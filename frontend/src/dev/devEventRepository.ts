import { checkEventInput, EVENT_LIMITS } from '../features/events/eventRules';
import type {
  EventDetail,
  EventRepository,
  EventState,
  PublicEvent,
} from '../features/events/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevEventRecord } from './devEvents';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devEventRepository');

interface DevEventRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
  pageSize?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 未ログインの人から見た状態。見られない場合は null（docs/06の5-12）。 */
function guestState(record: DevEventRecord, now: Date): EventState | null {
  if (record.hidden || record.status === 'cancelled') return null;
  if (now > new Date(record.endsAt)) return null;
  if (now >= new Date(record.startsAt)) return 'ongoing';
  if (record.status === 'closed') return 'closed';
  return record.approvedCount >= record.capacity ? 'full' : 'open';
}

/**
 * 【開発専用】画面の動作を確かめるための実装。
 * **ここでの判定（定員・18歳未満・回数・住所の公開範囲など）は画面の確認用であり、権限の確認にはならない。**
 * 本番では、同じ条件をDB関数とRLSで強制する（docs/06の5章・6章）。
 */
export function createDevEventRepository({
  db,
  session,
  now = () => new Date(),
  pageSize = 20,
}: DevEventRepositoryOptions): EventRepository {
  const hostNickname = (record: DevEventRecord) =>
    findDevUser(db, record.hostId)?.profile?.nickname ?? '';

  /** 公開する項目だけを書き出す。項目が増えても、意図せず公開しないため。 */
  const toPublicEvent = (record: DevEventRecord, state: EventState): PublicEvent => ({
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
    hostNickname: hostNickname(record),
    state,
  });

  const visibleEvents = () => {
    const current = now();
    return db.events.flatMap((record) => {
      const state = guestState(record, current);
      return state ? [{ record, event: toPublicEvent(record, state) }] : [];
    });
  };

  /** ログインしていて、利用を始められる人（docs/06の6-3の共通の検証を、表示の確認用に簡略化）。 */
  const currentUser = () => findDevUser(db, session.getUserId());

  return {
    listEvents: (cursor) => {
      const upcoming = visibleEvents()
        .map(({ event }) => event)
        .filter((event) => event.state !== 'ongoing')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
      const start = cursor ? upcoming.findIndex((event) => event.id === cursor) + 1 : 0;
      const items = upcoming.slice(start, start + pageSize);
      const hasMore = start + pageSize < upcoming.length;
      return Promise.resolve({ items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null });
    },

    getEvent: (id) => {
      // 終了・中止した募集を主催者に見せる扱い（DB-08）は、SCR-009 と合わせて加える
      const found = visibleEvents().find(({ event }) => event.id === id);
      if (!found) return Promise.resolve(null);
      const detail: EventDetail = {
        ...found.event,
        isHost: found.record.hostId === session.getUserId(),
      };
      return Promise.resolve(detail);
    },

    getLocation: (eventId) => {
      // 主催者で、募集が非表示でない場合だけ（docs/06の5-4）。承認済みの参加者は申請と合わせて加える
      const user = currentUser();
      const record = db.events.find((event) => event.id === eventId);
      if (!user || !record || record.hidden || record.hostId !== user.id) {
        return Promise.resolve(null);
      }
      const location = db.locations.get(eventId);
      return Promise.resolve(location ? { ...location } : null);
    },

    createEvent: (input) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      if (!user.profile) return Promise.resolve({ status: 'rejected', reason: 'profileRequired' });
      if (user.ageCategory !== 'adult') {
        return Promise.resolve({ status: 'rejected', reason: 'minor' });
      }

      // 同じ送信の繰り返しは、作成済みの募集を返す（docs/06の4-3）
      const duplicate = db.events.find(
        (event) => event.hostId === user.id && event.clientRequestId === input.clientRequestId,
      );
      if (duplicate) return Promise.resolve({ status: 'created', eventId: duplicate.id });

      const current = now();
      const recent = db.eventCreations.filter(
        (creation) =>
          creation.userId === user.id && current.getTime() - creation.at.getTime() < DAY_MS,
      );
      if (recent.length >= EVENT_LIMITS.dailyCreateLimit) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }
      if (Object.keys(checkEventInput(input, current)).length > 0) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }

      const id = `dev-created-${db.eventCreations.length + 1}`;
      db.events.push({
        id,
        hostId: user.id,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        area: input.area,
        targetLevels: [...input.targetLevels],
        description: input.description,
        belongings: input.belongings,
        capacity: input.capacity,
        approvedCount: 0,
        fee: input.fee,
        status: 'open',
        hidden: false,
        clientRequestId: input.clientRequestId,
      });
      db.locations.set(id, { ...input.location });
      db.eventCreations.push({ userId: user.id, at: current });
      return Promise.resolve({ status: 'created', eventId: id });
    },
  };
}
