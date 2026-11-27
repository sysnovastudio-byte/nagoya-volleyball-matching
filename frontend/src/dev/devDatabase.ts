import type { AgreementDocument } from '../features/auth/types';
import type { EventLocation, EventState } from '../features/events/types';
import {
  createDevApplications,
  createDevEvents,
  createDevLocations,
  type DevApplicationRecord,
  type DevEventRecord,
} from './devEvents';
import {
  createDevConversations,
  type DevConversationRecord,
  type DevMessageRecord,
} from './devConversations';
import { createDevNotifications, type DevNotificationRecord } from './devNotifications';
import { createDevUsers, type DevUser } from './devUsers';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devDatabase');

/**
 * 【開発専用】各 Repository が共有する、メモリ上の架空のデータ。
 * ブラウザに保存しないため、再読み込みで初期状態に戻る。
 */
export interface DevDatabase {
  users: DevUser[];
  events: DevEventRecord[];
  /** 募集のIDごとの住所（docs/06の4-4の event_locations） */
  locations: Map<string, EventLocation>;
  /** 申請（docs/06の4-5の event_participants） */
  applications: DevApplicationRecord[];
  /** 募集の作成の記録。回数の上限に使う（docs/06の4-16の rate_limit_events） */
  eventCreations: { userId: string; at: Date }[];
  /** 規約等への同意の記録（docs/06の4-17）。日時はダミー */
  agreements: { userId: string; document: AgreementDocument; version: string; agreedAt: Date }[];
  /** 新規登録して、メール認証を待っている利用者のID。新しいものが後ろ */
  pendingVerifications: string[];
  /** 会話（docs/06の4-7）とメッセージ（4-8） */
  conversations: DevConversationRecord[];
  messages: DevMessageRecord[];
  /** 通知（docs/06の4-11） */
  notifications: DevNotificationRecord[];
  /** ブロック（docs/06の4-9）。最初は空。帯で利用者を切り替えて、画面から作る */
  blocks: DevBlockRecord[];
}

/** 【開発専用】保存されているブロックの形（docs/06の4-9）。 */
export interface DevBlockRecord {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export function createDevDatabase(now: Date): DevDatabase {
  const { conversations, messages } = createDevConversations(now);
  const users = createDevUsers();
  const events = createDevEvents(now);
  const applications = createDevApplications(now);
  return {
    users,
    events,
    locations: createDevLocations(),
    applications,
    eventCreations: [],
    agreements: [],
    pendingVerifications: [],
    conversations,
    messages,
    notifications: createDevNotifications({ users, events, applications }, now),
    blocks: [],
  };
}

export function findDevUser(db: DevDatabase, userId: string | null) {
  return userId === null ? undefined : db.users.find((user) => user.id === userId);
}

/**
 * どちらか一方でも相手をブロックしているか（docs/06の5-3）。送信・会話の開始・申請は双方向に断る。
 * 本番ではブロックの判定関数を利用者から直接呼べない。結果を画面に返さず、断る理由にも示さない。
 */
export function isBlockedBetween(db: DevDatabase, userId: string, otherId: string) {
  return db.blocks.some(
    (block) =>
      (block.blockerId === userId && block.blockedId === otherId) ||
      (block.blockerId === otherId && block.blockedId === userId),
  );
}

/** 承認済みの人数。定員に数えるのは承認済みだけ（docs/06の5-1）。 */
export function countApplications(
  db: DevDatabase,
  eventId: string,
  status: DevApplicationRecord['status'],
) {
  return db.applications.filter(
    (application) => application.eventId === eventId && application.status === status,
  ).length;
}

/**
 * 募集の状態（docs/06の5-12）。上から順に、最初に当てはまるものにする。
 * 画面に返すかどうかは、呼び出し側が見る人に応じて決める。
 */
export function devEventState(
  db: DevDatabase,
  record: DevEventRecord,
  now: Date,
): EventState | 'hidden' {
  if (record.hidden) return 'hidden';
  if (record.status === 'cancelled') return 'cancelled';
  if (now > new Date(record.endsAt)) return 'ended';
  if (now >= new Date(record.startsAt)) return 'ongoing';
  if (record.status === 'closed') return 'closed';
  return countApplications(db, record.id, 'approved') >= record.capacity ? 'full' : 'open';
}
