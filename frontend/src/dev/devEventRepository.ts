import { MAX_ATTEMPTS } from '../features/applications/types';
import { EMPTY_FILTER, matchesFilter } from '../features/events/eventFilter';
import { checkEventInput, EVENT_LIMITS } from '../features/events/eventRules';
import type {
  EventDetail,
  EventRepository,
  EventState,
  MyEvent,
  PublicEvent,
} from '../features/events/types';
import { countApplications, devEventState, findDevUser, type DevDatabase } from './devDatabase';
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

/** 誰でも詳細を見られる状態（docs/06の5-12）。 */
const PUBLIC_STATES: readonly EventState[] = ['open', 'full', 'closed', 'ongoing'];

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
    remaining: record.capacity - countApplications(db, record.id, 'approved'),
    fee: record.fee,
    hostNickname: hostNickname(record),
    state,
  });

  /** ログインしている人。判定は表示の確認用に簡略化している（docs/06の6-3）。 */
  const currentUser = () => findDevUser(db, session.getUserId());

  /** 見ている人の申請。古い順。 */
  const myApplications = (eventId: string, userId: string | undefined) =>
    db.applications
      .filter((application) => application.eventId === eventId && application.userId === userId)
      .sort((a, b) => a.attemptNo - b.attemptNo);

  /** 見ている人の、最新の申請。 */
  const myApplication = (eventId: string, userId: string | undefined) =>
    myApplications(eventId, userId).at(-1);

  return {
    listEvents: (cursor, filter = EMPTY_FILTER) => {
      const current = now();
      const upcoming = db.events
        .flatMap((record) => {
          const state = devEventState(db, record, current);
          return (state === 'open' || state === 'full' || state === 'closed') &&
            matchesFilter(record, filter)
            ? [toPublicEvent(record, state)]
            : [];
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
      const start = cursor ? upcoming.findIndex((event) => event.id === cursor) + 1 : 0;
      const items = upcoming.slice(start, start + pageSize);
      const hasMore = start + pageSize < upcoming.length;
      return Promise.resolve({ items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null });
    },

    getEvent: (id) => {
      const record = db.events.find((event) => event.id === id);
      if (!record) return Promise.resolve(null);
      const state = devEventState(db, record, now());
      // 非表示の募集は、申請・募集の管理で開催日時だけを示す（docs/11の4-4）。詳細は見せない
      if (state === 'hidden') return Promise.resolve(null);

      const userId = currentUser()?.id;
      const isHost = record.hostId === userId;
      const applications = myApplications(record.id, userId);
      const application = applications.at(-1);
      // 終了・中止は、主催者と申請したことがある人だけ（DB-08）
      if (!PUBLIC_STATES.includes(state) && !isHost && !application) {
        return Promise.resolve(null);
      }
      const detail: EventDetail = {
        ...toPublicEvent(record, state),
        isHost,
        myApplication: application
          ? {
              id: application.id,
              status: application.status,
              // キャンセル・取り下げの後だけ、合計3回まで再申請できる（docs/11の2-2）
              canReapply:
                (application.status === 'cancelled' || application.status === 'retracted') &&
                applications.length < MAX_ATTEMPTS,
            }
          : null,
      };
      return Promise.resolve(detail);
    },

    getLocation: (eventId) => {
      // docs/06の5-4。主催者は非表示でなければ見られ、参加者は承認済みで終了日時まで見られる
      const user = currentUser();
      const record = db.events.find((event) => event.id === eventId);
      if (!user || !record || record.hidden) return Promise.resolve(null);
      const isHost = record.hostId === user.id;
      const isApprovedParticipant =
        record.status !== 'cancelled' &&
        now() <= new Date(record.endsAt) &&
        myApplication(record.id, user.id)?.status === 'approved';
      if (!isHost && !isApprovedParticipant) return Promise.resolve(null);
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
        fee: input.fee,
        status: 'open',
        hidden: false,
        clientRequestId: input.clientRequestId,
      });
      db.locations.set(id, { ...input.location });
      db.eventCreations.push({ userId: user.id, at: current });
      return Promise.resolve({ status: 'created', eventId: id });
    },

    getMyEvents: () => {
      const user = currentUser();
      if (!user) return Promise.resolve([]);
      const current = now();
      const events = db.events
        .filter((record) => record.hostId === user.id)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
        .map((record): MyEvent => {
          const state = devEventState(db, record, current);
          // 非表示の募集は、開催日時だけを返す（docs/06の5-12）
          if (state === 'hidden') {
            return { hidden: true, startsAt: record.startsAt, endsAt: record.endsAt };
          }
          return {
            hidden: false,
            id: record.id,
            title: record.title,
            startsAt: record.startsAt,
            endsAt: record.endsAt,
            state,
            capacity: record.capacity,
            approvedCount: countApplications(db, record.id, 'approved'),
            pendingCount: countApplications(db, record.id, 'pending'),
          };
        });
      return Promise.resolve(events);
    },
  };
}
