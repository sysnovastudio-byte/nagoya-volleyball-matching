import type { EventRepository, EventState, PublicEvent } from '../types';
import { createDevEvents, DEV_DATA_MARKER, type DevEventRecord } from './devEvents';

interface DevRepositoryOptions {
  now?: () => Date;
  pageSize?: number;
}

/** 未ログインの人から見た状態。見られない場合は null（docs/06の5-12）。 */
function guestState(record: DevEventRecord, now: Date): EventState | null {
  if (record.hidden || record.status === 'cancelled') return null;
  if (now > new Date(record.endsAt)) return null;
  if (now >= new Date(record.startsAt)) return 'ongoing';
  if (record.status === 'closed') return 'closed';
  return record.approvedCount >= record.capacity ? 'full' : 'open';
}

/** 公開する項目だけを書き出す。項目が増えても、意図せず公開しないため。 */
function toPublicEvent(record: DevEventRecord, state: EventState): PublicEvent {
  return {
    id: record.id,
    title: record.title,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    area: record.area,
    targetLevels: record.targetLevels,
    description: record.description,
    belongings: record.belongings,
    capacity: record.capacity,
    remaining: record.capacity - record.approvedCount,
    fee: record.fee,
    hostNickname: record.hostNickname,
    state,
  };
}

/** 【開発専用】画面の動作を確かめるための実装。権限や整合性の確認にはならない。 */
export function createDevEventRepository({
  now = () => new Date(),
  pageSize = 20,
}: DevRepositoryOptions = {}): EventRepository {
  console.info(`[${DEV_DATA_MARKER}] 開発用のダミーデータを使っています。`);
  const records = createDevEvents(now());

  const visibleEvents = () => {
    const current = now();
    return records.flatMap((record) => {
      const state = guestState(record, current);
      return state ? [toPublicEvent(record, state)] : [];
    });
  };

  return {
    list: (cursor) => {
      const upcoming = visibleEvents()
        .filter((event) => event.state !== 'ongoing')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
      const start = cursor ? upcoming.findIndex((event) => event.id === cursor) + 1 : 0;
      const items = upcoming.slice(start, start + pageSize);
      const hasMore = start + pageSize < upcoming.length;
      return Promise.resolve({ items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null });
    },
    get: (id) => Promise.resolve(visibleEvents().find((event) => event.id === id) ?? null),
  };
}
