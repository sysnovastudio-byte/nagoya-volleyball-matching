import type {
  AccountRepository,
  UpcomingHostedEvent,
  WithdrawalCheck,
} from '../features/account/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevEventRecord } from './devEvents';
import { notifyParticipantChange } from './devNotifications';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devAccountRepository');

interface DevAccountRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/**
 * 【開発専用】退会（CND-08）の窓口。メモリ上のダミーのデータだけを変える。
 * **ここでの判定は画面の確認用であり、権限の確認にはならない。** パスワードは照合しない（空だけを断る）。
 * 本番では Edge Functions が、検証済みのJWTから本人を求め、直近のパスワードでのログイン（amr）を確かめて、
 * docs/06の5-8の段階1（MVPは14-5のとおり段階1・4・5）を行う。
 * 開発用のデータでは、退会した人は「見つからない人」として表す（ほかの窓口が「退会したユーザー」と示す）。
 */
export function createDevAccountRepository({
  db,
  session,
  now = () => new Date(),
}: DevAccountRepositoryOptions): AccountRepository {
  const notStarted = (record: DevEventRecord, current: Date) => current < new Date(record.startsAt);

  /** 本人として退会を申し込める人。管理者と利用停止中の人は断る（M-06） */
  const resolve = () => {
    const user = findDevUser(db, session.getUserId());
    if (!user) return { reason: 'notLoggedIn' as const };
    if (user.role === 'admin') return { reason: 'admin' as const };
    if (user.status !== 'active') return { reason: 'suspended' as const };
    return { user };
  };

  /** 主催する開催開始前の募集。中止・非表示を除く（docs/06の5-8の段階1の2） */
  const upcomingHosted = (userId: string, current: Date): UpcomingHostedEvent[] =>
    db.events
      .filter(
        (record) =>
          record.hostId === userId &&
          record.status !== 'cancelled' &&
          !record.hidden &&
          notStarted(record, current),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(({ id, title, startsAt, endsAt }) => ({ id, title, startsAt, endsAt }));

  /** 取り消す参加・申請。開催開始前で、中止していない募集だけ（中止した募集の参加は変えない） */
  const affectedApplications = (userId: string, current: Date) =>
    db.applications.flatMap((application) => {
      if (application.userId !== userId) return [];
      if (application.status !== 'approved' && application.status !== 'pending') return [];
      const record = db.events.find((event) => event.id === application.eventId);
      if (!record || record.status === 'cancelled' || !notStarted(record, current)) return [];
      return [{ application, record }];
    });

  return {
    getWithdrawalCheck: () => {
      const resolved = resolve();
      if (!resolved.user) {
        return Promise.resolve({ status: 'unavailable', reason: resolved.reason });
      }
      const current = now();
      const events = upcomingHosted(resolved.user.id, current);
      if (events.length > 0) return Promise.resolve({ status: 'hostingUpcoming', events });
      const affected = affectedApplications(resolved.user.id, current);
      const check: WithdrawalCheck = {
        status: 'available',
        impact: {
          approvedParticipations: affected.filter(
            ({ application }) => application.status === 'approved',
          ).length,
          pendingApplications: affected.filter(
            ({ application }) => application.status === 'pending',
          ).length,
        },
      };
      return Promise.resolve(check);
    },

    withdraw: ({ password }) => {
      const resolved = resolve();
      if (!resolved.user) return Promise.resolve({ status: 'rejected', reason: 'notAllowed' });
      const { user } = resolved;
      // パスワードの再入力（DB-26）。開発用では照合せず、空だけを断る
      if (password === '') return Promise.resolve({ status: 'rejected', reason: 'wrongPassword' });
      const current = now();
      if (upcomingHosted(user.id, current).length > 0) {
        return Promise.resolve({ status: 'rejected', reason: 'hostingUpcoming' });
      }

      // 非表示の開催開始前の募集は、主催者のいない募集が戻らないよう、通知せずに中止にする（段階1の2）
      for (const record of db.events) {
        if (record.hostId === user.id && record.hidden && notStarted(record, current)) {
          record.status = 'cancelled';
        }
      }
      // 開催開始前の参加をキャンセル、承認待ちを取り下げにする（段階1の3）
      for (const { application, record } of affectedApplications(user.id, current)) {
        if (application.status === 'approved') {
          application.status = 'cancelled';
          application.cancelledAt = current;
          // 参加のキャンセルは主催者へ通知する。非表示の募集では通知しない
          if (!record.hidden) {
            notifyParticipantChange(db, application, 'participation_cancelled', current);
          }
        } else {
          application.status = 'retracted';
          application.retractedAt = current;
        }
      }
      // 個人情報を消す（段階1の4）。主催した募集の住所は、終了・中止・開催中の分もすべて消す
      for (const record of db.events) {
        if (record.hostId === user.id) db.locations.delete(record.id);
      }
      db.notifications = db.notifications.filter((item) => item.userId !== user.id);
      db.blocks = db.blocks.filter((block) => block.blockerId !== user.id);
      db.eventCreations = db.eventCreations.filter((item) => item.userId !== user.id);
      db.pendingVerifications = db.pendingVerifications.filter((id) => id !== user.id);
      db.pendingPasswordResets = db.pendingPasswordResets.filter((id) => id !== user.id);
      if (db.passwordRecoveryUserId === user.id) db.passwordRecoveryUserId = null;
      // プロフィールと認証アカウントを消す（段階4・5）。募集・参加・会話・通報・同意などの記録は残す
      db.users.splice(db.users.indexOf(user), 1);
      session.setUserId(null);
      return Promise.resolve({ status: 'withdrawn' });
    },
  };
}
