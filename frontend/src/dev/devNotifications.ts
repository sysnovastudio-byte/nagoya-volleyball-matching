import type { NotificationType } from '../features/notifications/types';
import type { DevApplicationRecord, DevEventRecord } from './devEvents';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devNotifications');

/** 【開発専用】保存されている通知の形（docs/06の4-11）。文章・住所は持たない。 */
export interface DevNotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  eventId: string;
  /** 申請に関する通知だけ。募集の中止・非表示は null */
  participantId: string | null;
  /** 重複防止の鍵（docs/06の5-13）。受け取る人ごとに一意 */
  dedupeKey: string;
  readAt: Date | null;
  createdAt: Date;
}

/** 通知を作るのに必要な、データの一部。devDatabase との循環を避けるため、ここで形だけ決める。 */
interface NotificationStore {
  users: { id: string }[];
  events: DevEventRecord[];
  applications: DevApplicationRecord[];
  notifications: DevNotificationRecord[];
}

/** 申請の状態の変化による通知と、鍵の末尾（docs/06の5-13）。 */
const PARTICIPANT_NOTIFICATIONS = {
  application_received: 'applied',
  participation_cancelled: 'cancelled',
  approval_revoked: 'revoked',
  application_approved: 'approved',
  application_rejected: 'rejected',
} as const satisfies Partial<Record<NotificationType, string>>;

export type ParticipantNotificationType = keyof typeof PARTICIPANT_NOTIFICATIONS;

/** 主催者が受け取る種類。ほかは申請した本人が受け取る。 */
const TO_HOST: readonly ParticipantNotificationType[] = [
  'application_received',
  'participation_cancelled',
];

function add(store: NotificationStore, record: Omit<DevNotificationRecord, 'id' | 'readAt'>): void {
  // 退会した人（見つからない人）には作らない（docs/06の5-13）
  if (!store.users.some((user) => user.id === record.userId)) return;
  // 同じ受け取る人・同じ鍵があれば、何もしない（docs/06の4-11の一意制約）
  if (
    store.notifications.some(
      (item) => item.userId === record.userId && item.dedupeKey === record.dedupeKey,
    )
  ) {
    return;
  }
  store.notifications.push({
    ...record,
    id: `dev-notification-${store.notifications.length + 1}`,
    readAt: null,
  });
}

/**
 * 【開発専用】申請の状態の変化を通知する。本番では、状態を変える関数と同じトランザクションで作る（docs/06の5-13）。
 * 取り下げは、主催者に通知しない（docs/11の2-2）ため、ここに種類がない。
 */
export function notifyParticipantChange(
  store: NotificationStore,
  application: DevApplicationRecord,
  type: ParticipantNotificationType,
  now: Date,
): void {
  const record = store.events.find((event) => event.id === application.eventId);
  if (!record) return;
  add(store, {
    userId: TO_HOST.includes(type) ? record.hostId : application.userId,
    type,
    eventId: record.id,
    participantId: application.id,
    dedupeKey: `participant:${application.id}:${PARTICIPANT_NOTIFICATIONS[type]}`,
    createdAt: now,
  });
}

/** 【開発専用】募集の中止を、承認待ち・承認済みの人へ1件ずつ通知する（docs/06の5-13）。 */
export function notifyEventCancelled(
  store: NotificationStore,
  record: DevEventRecord,
  now: Date,
): void {
  for (const application of store.applications) {
    if (application.eventId !== record.id) continue;
    if (application.status !== 'pending' && application.status !== 'approved') continue;
    add(store, {
      userId: application.userId,
      type: 'event_cancelled',
      eventId: record.id,
      participantId: null,
      dedupeKey: `event:${record.id}:cancelled`,
      createdAt: now,
    });
  }
}

const HOUR_MS = 60 * 60 * 1000;

/** 帯で選べる利用者に、最初から届いている架空の通知。種類ごとの表示を確かめるためのもの。 */
const SEEDS: {
  eventId: string;
  /** 申請に関する通知は、この人の申請。非表示の通知は受け取る人 */
  userId: string;
  type: NotificationType;
  hoursAgo: number;
  read: boolean;
}[] = [
  // 利用者B（主催者）へ
  {
    eventId: 'dev-beginner-afternoon',
    userId: 'dev-user-minor',
    type: 'application_received',
    hoursAgo: 2,
    read: false,
  },
  // 利用者A（参加者）へ
  {
    eventId: 'dev-family-morning',
    userId: 'dev-user-a',
    type: 'application_approved',
    hoursAgo: 5,
    read: false,
  },
  { eventId: 'dev-hidden', userId: 'dev-user-a', type: 'event_hidden', hoursAgo: 26, read: false },
  {
    eventId: 'dev-spike-practice',
    userId: 'dev-user-a',
    type: 'application_rejected',
    hoursAgo: 50,
    read: true,
  },
];

export function createDevNotifications(
  store: Omit<NotificationStore, 'notifications'>,
  now: Date,
): DevNotificationRecord[] {
  const target: NotificationStore = { ...store, notifications: [] };
  for (const seed of SEEDS) {
    const createdAt = new Date(now.getTime() - seed.hoursAgo * HOUR_MS);
    const before = target.notifications.length;
    if (seed.type === 'event_hidden') {
      add(target, {
        userId: seed.userId,
        type: seed.type,
        eventId: seed.eventId,
        participantId: null,
        dedupeKey: `event:${seed.eventId}:hidden:dev-action-1`,
        createdAt,
      });
    } else if (seed.type in PARTICIPANT_NOTIFICATIONS) {
      const application = store.applications.find(
        (item) => item.eventId === seed.eventId && item.userId === seed.userId,
      );
      if (!application) throw new Error(`${seed.eventId} の申請がありません。`);
      notifyParticipantChange(
        target,
        application,
        seed.type as ParticipantNotificationType,
        createdAt,
      );
    }
    const created = target.notifications[before];
    if (created && seed.read) created.readAt = new Date(createdAt.getTime() + HOUR_MS);
  }
  return target.notifications;
}
