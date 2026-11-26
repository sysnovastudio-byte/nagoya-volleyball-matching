import type { AgreementDocument } from '../features/auth/types';
import type { EventLocation, EventState } from '../features/events/types';
import {
  createDevApplications,
  createDevEvents,
  createDevLocations,
  type DevApplicationRecord,
  type DevEventRecord,
} from './devEvents';
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
}

export function createDevDatabase(now: Date): DevDatabase {
  return {
    users: createDevUsers(),
    events: createDevEvents(now),
    locations: createDevLocations(),
    applications: createDevApplications(now),
    eventCreations: [],
    agreements: [],
    pendingVerifications: [],
  };
}

export function findDevUser(db: DevDatabase, userId: string | null) {
  return userId === null ? undefined : db.users.find((user) => user.id === userId);
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
