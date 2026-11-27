import { checkMessageBody, sendableUntil } from '../features/conversations/messageRules';
import type {
  ConversationRepository,
  ConversationSummary,
  Message,
} from '../features/conversations/types';
import type { PublicProfile } from '../features/profiles/types';
import type { DevConversationRecord, DevMessageRecord } from './devConversations';
import { findDevMember, findDevUser, isBlockedBetween, type DevDatabase } from './devDatabase';
import { toPublicProfile } from './devProfileRepository';
import { conversationStartLimitReached, messageLimitReached } from './devRateLimits';
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
  // 一般の操作ができる人だけ。管理者・利用停止中の人は、未ログインと同じに扱う
  const currentUser = () => findDevMember(db, session.getUserId());
  const isParty = (conversation: DevConversationRecord, userId: string) =>
    conversation.hostId === userId || conversation.inquirerId === userId;

  const partnerProfile = (userId: string): PublicProfile => {
    const user = findDevUser(db, userId);
    // 見つからない人は退会した人として示す（docs/06の4-2）
    return (user && toPublicProfile(user)) ?? { userId, isWithdrawn: true };
  };

  /** 自分の側の、読んだ最後の seq。 */
  const myLastReadSeq = (conversation: DevConversationRecord, userId: string) =>
    conversation.hostId === userId
      ? conversation.hostLastReadSeq
      : conversation.inquirerLastReadSeq;

  const toSummary = (
    conversation: DevConversationRecord,
    userId: string,
  ): ConversationSummary | null => {
    const record = db.events.find((event) => event.id === conversation.eventId);
    if (!record) return null;
    const role = conversation.hostId === userId ? 'host' : 'inquirer';
    const until = sendableUntil(record.endsAt);
    const lastRead = myLastReadSeq(conversation, userId);
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
      // 自分の読んだ位置より後に、相手が送ったメッセージがあるか（docs/06の14-4）。自分の送信では付かない
      hasUnread: db.messages.some(
        (message) =>
          message.conversationId === conversation.id &&
          message.senderId !== userId &&
          message.seq > lastRead,
      ),
    };
  };

  /** 新しい会話を作る。開始の回数は、この行の started_by・created_at で数える（docs/06の14-2）。 */
  const createConversation = (
    fields: Pick<DevConversationRecord, 'eventId' | 'hostId' | 'inquirerId' | 'startedBy'>,
    createdAt: Date,
  ) => {
    const conversation: DevConversationRecord = {
      id: `dev-conv-new-${db.conversations.length + 1}`,
      ...fields,
      createdAt,
      lastMessageAt: null,
      hostLastReadSeq: 0,
      inquirerLastReadSeq: 0,
    };
    db.conversations.push(conversation);
    return conversation;
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
      // 新しい会話の回数（1日10件）。自分の操作の回数のため、相手の事情（ブロック）より先に判定する
      if (conversationStartLimitReached(db, user.id, current)) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }
      // どちらかが相手をブロックしていれば開始できない（docs/06の5-3）。理由は示さない
      // 主催者が利用停止中の場合も、理由を分けずに断る
      if (isBlockedBetween(db, user.id, record.hostId) || !findDevMember(db, record.hostId)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }

      const conversation = createConversation(
        { eventId, hostId: record.hostId, inquirerId: user.id, startedBy: user.id },
        current,
      );
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

      const current = now();
      // 相手の最新の申請が、承認待ち・承認済みであること（docs/11の3-1）
      const latest = db.applications.findLast(
        (item) => item.eventId === record.id && item.userId === application.userId,
      );
      const allowed =
        latest?.id === application.id &&
        (application.status === 'pending' || application.status === 'approved') &&
        // 退会した人・利用停止中の人とは始めない
        findDevMember(db, application.userId) !== undefined &&
        // 送信できる期間内で、非表示でない（DB-10）
        !record.hidden &&
        current <= sendableUntil(record.endsAt);
      if (!allowed) return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      // 回数を、ブロックより先に判定する（startConversation と同じ）
      if (conversationStartLimitReached(db, user.id, current)) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }
      if (isBlockedBetween(db, user.id, application.userId)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }

      const conversation = createConversation(
        {
          eventId: record.id,
          hostId: user.id,
          inquirerId: application.userId,
          // 始めた人の一覧だけに、メッセージのない会話を示す（DB-29）
          startedBy: user.id,
        },
        current,
      );
      return Promise.resolve({ status: 'opened', conversationId: conversation.id });
    },

    listMine: () => {
      const user = currentUser();
      if (!user) return Promise.resolve([]);
      const items = db.conversations
        .filter((conversation) => isParty(conversation, user.id))
        // メッセージのない会話は、始めた人の一覧だけに示す（DB-29）
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
      // 送信回数（1分間に10通・1時間に60通）。相手の事情より先に判定する（docs/06の5-7の5）
      if (messageLimitReached(db, user.id, current)) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }
      const partnerId =
        conversation.hostId === user.id ? conversation.inquirerId : conversation.hostId;
      // 相手の事情（docs/06の5-7の6）。相手の退会・利用停止と、双方向のブロック。どれで断っても理由は示さない（Q-20）
      if (!findDevMember(db, partnerId) || isBlockedBetween(db, user.id, partnerId)) {
        return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      }

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

    markRead: (conversationId, seq) => {
      const user = currentUser();
      const conversation = db.conversations.find((item) => item.id === conversationId);
      if (!user || !conversation || !isParty(conversation, user.id)) return Promise.resolve();
      // その会話にある seq を超えない。値は小さくならない（docs/06の14-4）
      const maxSeq = Math.max(
        0,
        ...db.messages.filter((item) => item.conversationId === conversationId).map((m) => m.seq),
      );
      const next = Math.max(myLastReadSeq(conversation, user.id), Math.min(seq, maxSeq));
      // 自分の側だけを変える
      if (conversation.hostId === user.id) conversation.hostLastReadSeq = next;
      else conversation.inquirerLastReadSeq = next;
      return Promise.resolve();
    },
  };
}
