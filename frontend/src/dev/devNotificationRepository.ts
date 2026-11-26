import type {
  NotificationItem,
  NotificationRepository,
  NotificationType,
} from '../features/notifications/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevNotificationRecord } from './devNotifications';
import { toPublicProfile } from './devProfileRepository';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devNotificationRepository');

interface DevNotificationRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 作成から90日で削除する（DB-02）。本番では定期的に削除し、開発では返さないことで代える */
const RETENTION_MS = 90 * DAY_MS;

/** 主催者が受け取る、申請した人を示す種類。 */
const WITH_APPLICANT: readonly NotificationType[] = [
  'application_received',
  'participation_cancelled',
];

/**
 * 【開発専用】通知の窓口。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では RLS で本人の通知だけを読み、既読は mark_notifications_read（docs/06の6-5）だけで変える。
 */
export function createDevNotificationRepository({
  db,
  session,
  now = () => new Date(),
}: DevNotificationRepositoryOptions): NotificationRepository {
  const mine = () => {
    const user = findDevUser(db, session.getUserId());
    if (!user) return [];
    const since = now().getTime() - RETENTION_MS;
    return db.notifications.filter(
      (item) => item.userId === user.id && item.createdAt.getTime() > since,
    );
  };

  const toItem = (record: DevNotificationRecord): NotificationItem | null => {
    const event = db.events.find((item) => item.id === record.eventId);
    if (!event) return null;
    const application = record.participantId
      ? db.applications.find((item) => item.id === record.participantId)
      : undefined;
    const applicantUser = application && findDevUser(db, application.userId);
    const applicant =
      application && WITH_APPLICANT.includes(record.type)
        ? // 見つからない人は退会した人として示す（docs/06の4-2）
          ((applicantUser && toPublicProfile(applicantUser)) ?? {
            userId: application.userId,
            isWithdrawn: true as const,
          })
        : null;
    return {
      id: record.id,
      type: record.type,
      // 非表示の募集は、開催日時だけを返す（docs/11の4-4）
      event: event.hidden
        ? { hidden: true, startsAt: event.startsAt, endsAt: event.endsAt }
        : {
            hidden: false,
            id: event.id,
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
          },
      applicant,
      createdAt: record.createdAt.toISOString(),
      read: record.readAt !== null,
    };
  };

  return {
    listMine: () => {
      const items = mine()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .flatMap((record) => {
          const item = toItem(record);
          return item ? [item] : [];
        });
      return Promise.resolve(items);
    },

    countUnread: () => Promise.resolve(mine().filter((item) => item.readAt === null).length),

    markRead: (notificationIds) => {
      const current = now();
      // 自分の通知だけを変える。既読の日時は変えない
      for (const record of mine()) {
        if (record.readAt === null && notificationIds.includes(record.id)) {
          record.readAt = current;
        }
      }
      return Promise.resolve();
    },
  };
}
