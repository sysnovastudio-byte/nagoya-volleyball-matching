import { EVENT_LIMITS } from '../features/events/eventRules';
import type {
  Applicant,
  ApplicationRepository,
  DecisionResult,
  EventSummary,
  MyParticipation,
  OwnActionResult,
  RevokeReason,
  RevokeResult,
} from '../features/applications/types';
import { APPLICATION_LIMITS, MAX_ATTEMPTS, REVOKE_REASONS } from '../features/applications/types';
import { countApplications, devEventState, findDevUser, type DevDatabase } from './devDatabase';
import type { DevApplicationRecord, DevEventRecord } from './devEvents';
import { notifyParticipantChange } from './devNotifications';
import { toPublicProfile } from './devProfileRepository';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devApplicationRepository');

interface DevApplicationRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 募集と申請した人の組ごとに、最新の申請だけを残す。
 * 本人と主催者に見せるのは、今の行の状態と日時だけ（docs/06の14-2、M-14）。
 */
export function latestApplications(applications: DevApplicationRecord[]) {
  const latest = new Map<string, DevApplicationRecord>();
  for (const application of applications) {
    const key = `${application.eventId}:${application.userId}`;
    const current = latest.get(key);
    if (!current || application.attemptNo > current.attemptNo) latest.set(key, application);
  }
  return [...latest.values()];
}

/**
 * 【開発専用】申請の窓口。
 * **ここでの判定（主催者か・定員・重複・回数・期限など）は画面の確認用であり、権限の確認にはならない。**
 * 本番では、同じ条件をDB関数・制約・RLSで強制する（docs/06の5-1・5-2・6-5）。
 */
export function createDevApplicationRepository({
  db,
  session,
  now = () => new Date(),
}: DevApplicationRepositoryOptions): ApplicationRepository {
  const currentUser = () => findDevUser(db, session.getUserId());

  const summarize = (record: DevEventRecord, current: Date): EventSummary => {
    const state = devEventState(db, record, current);
    return state === 'hidden'
      ? { hidden: true, startsAt: record.startsAt, endsAt: record.endsAt }
      : {
          hidden: false,
          id: record.id,
          title: record.title,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          state,
        };
  };

  /** 承認・却下の共通の確認（docs/06の5-1の手順2〜4）。 */
  const decide = (
    applicationId: string,
    next: 'approved' | 'rejected',
    expandCapacityTo?: number,
  ): DecisionResult => {
    const user = currentUser();
    const application = db.applications.find((item) => item.id === applicationId);
    const record = application && db.events.find((event) => event.id === application.eventId);
    // 他人の募集の申請は、ない場合と同じに扱う
    if (!user || !application || !record || record.hostId !== user.id) {
      return { status: 'rejected', reason: 'notFound' };
    }
    const current = now();
    const state = devEventState(db, record, current);
    if (state === 'hidden' || state === 'cancelled' || state === 'ended' || state === 'ongoing') {
      return { status: 'rejected', reason: 'notAccepting' };
    }
    if (application.status !== 'pending') return { status: 'rejected', reason: 'notPending' };
    // 満員の場合は、承認と同時に定員を1人増やす。定員は常に承認済み人数以上に保つ（docs/11の2-2）
    if (next === 'approved' && countApplications(db, record.id, 'approved') >= record.capacity) {
      if (record.capacity >= EVENT_LIMITS.capacityMax) {
        return { status: 'rejected', reason: 'capacityLimit' };
      }
      if (expandCapacityTo !== record.capacity + 1) return { status: 'rejected', reason: 'full' };
      record.capacity = expandCapacityTo;
    }
    application.status = next;
    application.decidedAt = current;
    // 申請者へ通知する（CND-04）。本番では同じトランザクションで作る（docs/06の5-13）
    notifyParticipantChange(
      db,
      application,
      next === 'approved' ? 'application_approved' : 'application_rejected',
      current,
    );
    return { status: 'done' };
  };

  /** 承認の取り消し（docs/06の5-1の revoke_approval）。主催者・開催開始前・承認済み・理由を確認する。 */
  const revoke = (applicationId: string, reason: RevokeReason): RevokeResult => {
    const user = currentUser();
    const application = db.applications.find((item) => item.id === applicationId);
    const record = application && db.events.find((event) => event.id === application.eventId);
    // 他人の募集の申請は、ない場合と同じに扱う
    if (!user || !application || !record || record.hostId !== user.id) {
      return { status: 'rejected', reason: 'notFound' };
    }
    const current = now();
    const state = devEventState(db, record, current);
    if (state !== 'open' && state !== 'full' && state !== 'closed') {
      return { status: 'rejected', reason: 'notAccepting' };
    }
    if (application.status !== 'approved') return { status: 'rejected', reason: 'notApproved' };
    if (!REVOKE_REASONS.includes(reason)) return { status: 'rejected', reason: 'reasonRequired' };
    application.status = 'revoked';
    application.revokedAt = current;
    application.revokeReason = reason;
    // 参加者へ通知する（NTF-03）。理由は通知に含めない。枠は承認済みの人数から数えるため戻る
    notifyParticipantChange(db, application, 'approval_revoked', current);
    return { status: 'done' };
  };

  /**
   * 本人によるキャンセル・取り下げ（docs/06の6-5の cancel_participation・retract_application）。
   * 開催開始前で、中止・非表示でない募集だけ。
   */
  const changeOwn = (applicationId: string, action: 'cancel' | 'retract'): OwnActionResult => {
    const user = currentUser();
    const application = db.applications.find((item) => item.id === applicationId);
    const record = application && db.events.find((event) => event.id === application.eventId);
    // 他人の申請は、ない場合と同じに扱う
    if (!user || !application || !record || application.userId !== user.id) {
      return { status: 'rejected', reason: 'notFound' };
    }
    const current = now();
    const state = devEventState(db, record, current);
    if (state !== 'open' && state !== 'full' && state !== 'closed') {
      return { status: 'rejected', reason: 'notAccepting' };
    }
    if (action === 'cancel') {
      if (application.status !== 'approved') return { status: 'rejected', reason: 'invalidState' };
      application.status = 'cancelled';
      application.cancelledAt = current;
      // 主催者へ通知する（NTF-02）。枠は、承認済みの人数から数えるため自動的に戻る
      notifyParticipantChange(db, application, 'participation_cancelled', current);
    } else {
      if (application.status !== 'pending') return { status: 'rejected', reason: 'invalidState' };
      // 取り下げは主催者へ通知しない（docs/11の2-2）
      application.status = 'retracted';
      application.retractedAt = current;
    }
    return { status: 'done' };
  };

  return {
    applyToEvent: (eventId) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      if (!user.profile) return Promise.resolve({ status: 'rejected', reason: 'profileRequired' });
      const record = db.events.find((event) => event.id === eventId);
      const current = now();
      const state = record && devEventState(db, record, current);
      if (!record || state === 'hidden') {
        return Promise.resolve({ status: 'rejected', reason: 'notFound' });
      }
      // 主催者は自分の募集に申請できない（docs/06の4-5の CHECK 制約）
      if (record.hostId === user.id) {
        return Promise.resolve({ status: 'rejected', reason: 'ownEvent' });
      }

      const mine = db.applications.filter(
        (application) => application.eventId === eventId && application.userId === user.id,
      );
      // 有効な申請は1件だけ（docs/06の5-2の部分一意インデックス）
      if (mine.some(({ status }) => status === 'pending' || status === 'approved')) {
        return Promise.resolve({ status: 'rejected', reason: 'alreadyApplied' });
      }
      // 却下・承認取り消しの後は、同じ募集に申請できない（docs/11の2-2）
      if (mine.some(({ status }) => status === 'rejected' || status === 'revoked')) {
        return Promise.resolve({ status: 'rejected', reason: 'notReapplicable' });
      }
      // キャンセル・取り下げの後は再申請できるが、合計3回まで（docs/06の4-5の attempt_no）
      if (mine.length >= MAX_ATTEMPTS) {
        return Promise.resolve({ status: 'rejected', reason: 'attemptLimit' });
      }
      // 満員でも承認待ちとして受け付け、主催者が判断する（docs/11の2-2、2026-11-26）
      if (state !== 'open' && state !== 'full') {
        return Promise.resolve({ status: 'rejected', reason: 'notAccepting' });
      }

      const recent = db.applications.filter(
        (application) =>
          application.userId === user.id &&
          current.getTime() - application.appliedAt.getTime() < DAY_MS,
      );
      if (recent.length >= APPLICATION_LIMITS.dailyApplyLimit) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }

      const application: DevApplicationRecord = {
        id: `dev-application-${db.applications.length + 1}`,
        eventId,
        userId: user.id,
        // 再申請は新しい行にして、前の申請を残す（docs/06の4-5）
        attemptNo: mine.length + 1,
        status: 'pending',
        appliedAt: current,
        decidedAt: null,
        cancelledAt: null,
        retractedAt: null,
        revokedAt: null,
        revokeReason: null,
      };
      db.applications.push(application);
      // 主催者へ通知する（NTF-01）
      notifyParticipantChange(db, application, 'application_received', current);
      return Promise.resolve({ status: 'applied' });
    },

    approveApplication: (applicationId, options) =>
      Promise.resolve(decide(applicationId, 'approved', options?.expandCapacityTo)),
    rejectApplication: (applicationId) => Promise.resolve(decide(applicationId, 'rejected')),
    revokeApproval: (applicationId, reason) => Promise.resolve(revoke(applicationId, reason)),
    cancelParticipation: (applicationId) => Promise.resolve(changeOwn(applicationId, 'cancel')),
    retractApplication: (applicationId) => Promise.resolve(changeOwn(applicationId, 'retract')),

    listApplicants: (eventId) => {
      const user = currentUser();
      const record = db.events.find((event) => event.id === eventId);
      if (!user || !record) return Promise.resolve({ status: 'notFound' });
      const current = now();
      const state = devEventState(db, record, current);
      if (record.hostId !== user.id) {
        // 見られない募集は、ない場合と同じに扱う
        return Promise.resolve(
          state === 'open' || state === 'full' || state === 'closed' || state === 'ongoing'
            ? { status: 'forbidden', reason: 'notHost' }
            : { status: 'notFound' },
        );
      }
      // 非表示の募集の申請者一覧は、主催者にも見せない（DB-19）
      if (state === 'hidden') return Promise.resolve({ status: 'forbidden', reason: 'hidden' });

      // 年代は、承認待ち・承認済みの申請者の分を、終了日時まで見せる。中止・終了では見せない（DB-03）
      const canSeeDetails = state !== 'ended' && state !== 'cancelled';
      const applicants = latestApplications(
        db.applications.filter((application) => application.eventId === eventId),
      )
        .flatMap((application): Applicant[] => {
          const applicantUser = findDevUser(db, application.userId);
          const profile = applicantUser
            ? (toPublicProfile(applicantUser) ?? null)
            : { userId: application.userId, isWithdrawn: true as const };
          return profile
            ? [
                {
                  applicationId: application.id,
                  status: application.status,
                  appliedAt: application.appliedAt.toISOString(),
                  profile,
                  hostOnly:
                    canSeeDetails &&
                    applicantUser?.profile &&
                    (application.status === 'pending' || application.status === 'approved')
                      ? { ageGroup: applicantUser.profile.ageGroup }
                      : null,
                },
              ]
            : [];
        })
        .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

      return Promise.resolve({
        status: 'ready',
        list: {
          event: {
            id: record.id,
            title: record.title,
            startsAt: record.startsAt,
            endsAt: record.endsAt,
            state,
            capacity: record.capacity,
            approvedCount: countApplications(db, record.id, 'approved'),
            canDecide: state === 'open' || state === 'full' || state === 'closed',
          },
          applicants,
        },
      });
    },

    getMyParticipations: () => {
      const user = currentUser();
      if (!user) return Promise.resolve([]);
      const current = now();
      const participations = latestApplications(
        db.applications.filter((application) => application.userId === user.id),
      )
        .flatMap((application): MyParticipation[] => {
          const record = db.events.find((event) => event.id === application.eventId);
          return record
            ? [
                {
                  applicationId: application.id,
                  status: application.status,
                  event: summarize(record, current),
                },
              ]
            : [];
        })
        .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
      return Promise.resolve(participations);
    },
  };
}
