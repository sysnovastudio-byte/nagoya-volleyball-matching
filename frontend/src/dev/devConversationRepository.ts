import { checkMessageBody, sendableUntil } from '../features/conversations/messageRules';
import type {
  ConversationRepository,
  ConversationSummary,
  Message,
} from '../features/conversations/types';
import type { PublicProfile } from '../features/profiles/types';
import type { DevConversationRecord, DevMessageRecord } from './devConversations';
import { findDevUser, type DevDatabase } from './devDatabase';
import { toPublicProfile } from './devProfileRepository';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devConversationRepository');

const MAX_CONVERSATIONS = 50;

interface DevConversationRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/**
 * 【開発専用】会話の窓口。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では start_conversation・get_my_conversations・send_message（docs/06の6-5）と RLS が、
 * 当事者であること・送信者が本人であること・期間・回数・ブロックを強制する（docs/06の5-7）。
 */
export function createDevConversationRepository({
  db,
  session,
  now = () => new Date(),
}: DevConversationRepositoryOptions): ConversationRepository {
  const currentUser = () => findDevUser(db, session.getUserId());
  const isParty = (conversation: DevConversationRecord, userId: string) =>
    conversation.hostId === userId || conversation.inquirerId === userId;

  const partnerProfile = (userId: string): PublicProfile => {
    const user = findDevUser(db, userId);
    // 見つからない人は退会した人として示す（docs/06の4-2）
    return (user && toPublicProfile(user)) ?? { userId, isWithdrawn: true };
  };

  const toSummary = (
    conversation: DevConversationRecord,
    userId: string,
  ): ConversationSummary | null => {
    const record = db.events.find((event) => event.id === conversation.eventId);
    if (!record) return null;
    const role = conversation.hostId === userId ? 'host' : 'inquirer';
    const until = sendableUntil(record.endsAt);
    return {
      id: conversation.id,
      role,
      partner: partnerProfile(role === 'host' ? conversation.inquirerId : conversation.hostId),
      // 非表示の募集は、開催日時だけを示す（docs/11の3-1）
      event: record.hidden
        ? { hidden: true, startsAt: record.startsAt, endsAt: record.endsAt }
        : {
            hidden: false,
            id: record.id,
            title: record.title,
            startsAt: record.startsAt,
            endsAt: record.endsAt,
          },
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      withinSendPeriod: now() <= until,
      sendableUntil: until.toISOString(),
    };
  };

  const toMessage = (message: DevMessageRecord, userId: string): Message => ({
    id: message.id,
    seq: message.seq,
    isMine: message.senderId === userId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  });

  return {
    startConversation: (eventId) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      if (!user.profile) return Promise.resolve({ status: 'rejected', reason: 'profileRequired' });
      const record = db.events.find((event) => event.id === eventId);
      // 主催者からの開始（MSG-06）は、startConversationWithApplicant で行う
      if (!record || record.hostId === user.id) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }

      // 会話は募集ごと、問い合わせた人ごとに1つ。すでにあれば、それを開く（docs/06の4-7）
      const existing = db.conversations.find(
        (conversation) => conversation.eventId === eventId && conversation.inquirerId === user.id,
      );
      if (existing) return Promise.resolve({ status: 'opened', conversationId: existing.id });

      // 【未実装】ブロック（どちらかが相手をブロックしていれば開始できない）と、
      // 新しい会話の回数（1日10件、docs/11の3-1）の判定は、ここに加える
      const current = now();
      const approved = db.applications.some(
        (application) =>
          application.eventId === eventId &&
          application.userId === user.id &&
          application.status === 'approved',
      );
      // 開始できる期限（docs/06の DB-10）。非表示の募集では、どの場合も開始できない
      const allowed =
        !record.hidden &&
        (approved
          ? current <= sendableUntil(record.endsAt)
          : record.status !== 'cancelled' && current < new Date(record.startsAt));
      if (!allowed) return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });

      const conversation: DevConversationRecord = {
        id: `dev-conv-new-${db.conversations.length + 1}`,
        eventId,
        hostId: record.hostId,
        inquirerId: user.id,
        startedBy: user.id,
        createdAt: current,
        lastMessageAt: null,
      };
      db.conversations.push(conversation);
      return Promise.resolve({ status: 'opened', conversationId: conversation.id });
    },

    startConversationWithApplicant: (applicationId) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      if (!user.profile) return Promise.resolve({ status: 'rejected', reason: 'profileRequired' });
      const application = db.applications.find((item) => item.id === applicationId);
      const record = application && db.events.find((event) => event.id === application.eventId);
      // 自分の募集の申請だけ。他人の募集の申請は、ない場合と同じに扱う
      if (!application || !record || record.hostId !== user.id) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }

      // すでにある会話は、期限などを判定する前に返す（docs/06の5-0）
      const existing = db.conversations.find(
        (conversation) =>
          conversation.eventId === record.id && conversation.inquirerId === application.userId,
      );
      if (existing) return Promise.resolve({ status: 'opened', conversationId: existing.id });

      // 【未実装】ブロックと、新しい会話の回数（1日10件）の判定は、ここに加える（サイクル3）
      const current = now();
      // 相手の最新の申請が、承認待ち・承認済みであること（docs/11の3-1）
      const latest = db.applications.findLast(
        (item) => item.eventId === record.id && item.userId === application.userId,
      );
      const allowed =
        latest?.id === application.id &&
        (application.status === 'pending' || application.status === 'approved') &&
        // 退会した人とは始めない
        findDevUser(db, application.userId) !== undefined &&
        // 送信できる期間内で、非表示でない（DB-10）
        !record.hidden &&
        current <= sendableUntil(record.endsAt);
      if (!allowed) return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });

      const conversation: DevConversationRecord = {
        id: `dev-conv-new-${db.conversations.length + 1}`,
        eventId: record.id,
        hostId: user.id,
        inquirerId: application.userId,
        // 始めた人の一覧だけに、メッセージのない会話を示す（DB-29）
        startedBy: user.id,
        createdAt: current,
        lastMessageAt: null,
      };
      db.conversations.push(conversation);
      return Promise.resolve({ status: 'opened', conversationId: conversation.id });
    },

    listMine: () => {
      const user = currentUser();
      if (!user) return Promise.resolve([]);
      const items = db.conversations
        .filter((conversation) => isParty(conversation, user.id))
        // メッセージのない会話は、始めた人の一覧だけに示す（DB-29 の仮の扱い）
        .filter(
          (conversation) =>
            conversation.lastMessageAt !== null || conversation.startedBy === user.id,
        )
        .sort(
          (a, b) =>
            (b.lastMessageAt ?? b.createdAt).getTime() - (a.lastMessageAt ?? a.createdAt).getTime(),
        )
        .slice(0, MAX_CONVERSATIONS)
        .flatMap((conversation) => {
          const summary = toSummary(conversation, user.id);
          return summary ? [summary] : [];
        });
      return Promise.resolve(items);
    },

    getMessages: (conversationId) => {
      const user = currentUser();
      const conversation = db.conversations.find((item) => item.id === conversationId);
      // 当事者でない場合は、ない場合と同じに扱う
      if (!user || !conversation || !isParty(conversation, user.id)) return Promise.resolve(null);
      const summary = toSummary(conversation, user.id);
      if (!summary) return Promise.resolve(null);
      const messages = db.messages
        .filter((message) => message.conversationId === conversationId)
        .sort((a, b) => a.seq - b.seq)
        .map((message) => toMessage(message, user.id));
      return Promise.resolve({ conversation: summary, messages });
    },

    send: ({ conversationId, body, clientRequestId }) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      const conversation = db.conversations.find((item) => item.id === conversationId);
      if (!conversation || !isParty(conversation, user.id)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }
      // 同じ送信の繰り返しは、新しく作らずに前の結果を返す（docs/06の5-7の3）
      const repeated = db.messages.find(
        (message) => message.senderId === user.id && message.clientRequestId === clientRequestId,
      );
      if (repeated) {
        return Promise.resolve({ status: 'sent', message: toMessage(repeated, user.id) });
      }
      if (checkMessageBody(body) !== null) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }
      const record = db.events.find((event) => event.id === conversation.eventId);
      const current = now();
      // 送信できる期間は、終了日時から7日後まで。中止でも予定の終了日時で数える（docs/11の3-1）
      if (!record || current > sendableUntil(record.endsAt)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }
      const partnerId =
        conversation.hostId === user.id ? conversation.inquirerId : conversation.hostId;
      // 相手が退会している場合は送信できない
      if (!findDevUser(db, partnerId)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }
      // 【未実装】送信回数（1分間に10通・1時間に60通）、ブロック、利用停止の判定は、ここに加える。
      // どれで断っても、画面には「送信できません」とだけ示す（Q-20）

      const message: DevMessageRecord = {
        id: `dev-message-new-${db.messages.length + 1}`,
        seq: Math.max(0, ...db.messages.map((item) => item.seq)) + 1,
        conversationId,
        // 送信者は、常にログイン中の人（送信者のIDを受け取らない、docs/06の5-7）
        senderId: user.id,
        body: body.trim(),
        clientRequestId,
        createdAt: current,
      };
      db.messages.push(message);
      conversation.lastMessageAt = current;
      return Promise.resolve({ status: 'sent', message: toMessage(message, user.id) });
    },
  };
}
