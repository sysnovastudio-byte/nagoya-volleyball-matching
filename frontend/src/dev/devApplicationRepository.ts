import type {
  Applicant,
  ApplicationRepository,
  DecisionResult,
  EventSummary,
  MyParticipation,
} from '../features/applications/types';
import { APPLICATION_LIMITS } from '../features/applications/types';
import { countApplications, devEventState, findDevUser, type DevDatabase } from './devDatabase';
import type { DevEventRecord } from './devEvents';
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
  const decide = (applicationId: string, next: 'approved' | 'rejected'): DecisionResult => {
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
    if (next === 'approved' && countApplications(db, record.id, 'approved') >= record.capacity) {
      return { status: 'rejected', reason: 'full' };
    }
    application.status = next;
    application.decidedAt = current;
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
      if (mine.some((application) => application.status !== 'rejected')) {
        return Promise.resolve({ status: 'rejected', reason: 'alreadyApplied' });
      }
      // 却下された募集には、もう申請できない（docs/11の2-2）
      if (mine.length > 0) {
        return Promise.resolve({ status: 'rejected', reason: 'notReapplicable' });
      }
      if (state === 'full') return Promise.resolve({ status: 'rejected', reason: 'full' });
      if (state !== 'open') return Promise.resolve({ status: 'rejected', reason: 'notAccepting' });

      const recent = db.applications.filter(
        (application) =>
          application.userId === user.id &&
          current.getTime() - application.appliedAt.getTime() < DAY_MS,
      );
      if (recent.length >= APPLICATION_LIMITS.dailyApplyLimit) {
        return Promise.resolve({ status: 'rejected', reason: 'rateLimited' });
      }

      db.applications.push({
        id: `dev-application-${db.applications.length + 1}`,
        eventId,
        userId: user.id,
        status: 'pending',
        appliedAt: current,
        decidedAt: null,
      });
      return Promise.resolve({ status: 'applied' });
    },

    approveApplication: (applicationId) => Promise.resolve(decide(applicationId, 'approved')),
    rejectApplication: (applicationId) => Promise.resolve(decide(applicationId, 'rejected')),

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
      // 非表示の募集の申請者一覧は、主催者にも見せない（DB-19 の仮の扱い）
      if (state === 'hidden') return Promise.resolve({ status: 'forbidden', reason: 'hidden' });

      const applicants = db.applications
        .filter((application) => application.eventId === eventId)
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
      const participations = db.applications
        .filter((application) => application.userId === user.id)
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
