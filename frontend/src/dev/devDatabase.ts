import type { EventLocation } from '../features/events/types';
import { createDevEvents, createDevLocations, type DevEventRecord } from './devEvents';
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
  /** 募集の作成の記録。回数の上限に使う（docs/06の4-16の rate_limit_events） */
  eventCreations: { userId: string; at: Date }[];
}

export function createDevDatabase(now: Date): DevDatabase {
  return {
    users: createDevUsers(),
    events: createDevEvents(now),
    locations: createDevLocations(),
    eventCreations: [],
  };
}

export function findDevUser(db: DevDatabase, userId: string | null) {
  return userId === null ? undefined : db.users.find((user) => user.id === userId);
}
