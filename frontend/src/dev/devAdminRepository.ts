import type {
  AdminAccess,
  AdminActionResult,
  AdminDenial,
  AdminEventView,
  AdminRead,
  AdminReportDetail,
  AdminReportSummary,
  AdminRepository,
  AdminUserDetail,
  AdminUserStatus,
  SuspensionImpact,
} from '../features/admin/types';
import {
  REPORT_STATUS_TRANSITIONS,
  isReportReason,
  normalizeReportDetail,
} from '../features/reports/reportRules';
import { devEventState, findDevUser, type DevDatabase } from './devDatabase';
import type { DevEventRecord } from './devEvents';
import type { DevReportRecord } from './devModeration';
import {
  notifyEventCancelled,
  notifyEventHidden,
  notifyParticipantChange,
} from './devNotifications';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devAdminRepository');

interface DevAdminRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/** 検索の1回の件数（docs/06の6-5の admin_search_users）。 */
const SEARCH_LIMIT = 20;

/** 開催開始前で、中止・非表示でない状態（docs/06の5-12）。停止で取り消し・中止の対象にする。 */
const BEFORE_START = ['open', 'full', 'closed'];

function normalizeKey(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

/**
 * 【開発専用】管理の窓口（SAFE-05〜07・CND-07）。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 帯の「多要素認証」も本物の認証ではない。本番では admin_* の関数（docs/06の6-5）が、
 * 管理者であることと aal2 のセッションを毎回確かめ、措置と状態の変更を同じトランザクションで行う。
 * メールアドレス・住所・参加者の一覧・ブロックの情報は返さない（docs/11の4-1）。
 */
export function createDevAdminRepository({
  db,
  session,
  now = () => new Date(),
}: DevAdminRepositoryOptions): AdminRepository {
  const access = (): AdminAccess => {
    if (findDevUser(db, session.getUserId())?.role !== 'admin') return 'forbidden';
    return session.getMfaVerified() ? 'granted' : 'mfaRequired';
  };
  /** 管理者で多要素認証が済んでいれば、その管理者のID。そうでなければ断る理由 */
  const adminId = (): { id: string } | { denied: AdminDenial } => {
    const result = access();
    return result === 'granted' ? { id: session.getUserId() ?? '' } : { denied: result };
  };
  const read = <T>(load: () => T): Promise<AdminRead<T>> => {
    const admin = adminId();
    if ('denied' in admin) return Promise.resolve({ status: 'denied', reason: admin.denied });
    return Promise.resolve({ status: 'ok', value: load() });
  };
  const rejected = (reason: Extract<AdminActionResult, { status: 'rejected' }>['reason']) =>
    Promise.resolve({ status: 'rejected', reason } as const);

  const nicknameOf = (userId: string) => findDevUser(db, userId)?.profile?.nickname ?? null;
  const statusOf = (userId: string): AdminUserStatus => {
    const user = findDevUser(db, userId);
    // 開発用のデータでは、退会した人は見つからない人として表す
    return user ? user.status : 'withdrawn';
  };

  const toSummary = (report: DevReportRecord): AdminReportSummary => ({
    id: report.id,
    kind: report.targetKind,
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    subjectNickname: nicknameOf(report.subjectUserId),
  });

  const toEventView = (record: DevEventRecord): AdminEventView => {
    const state = devEventState(db, record, now());
    return {
      id: record.id,
      title: record.title,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      description: record.description,
      hostNickname: nicknameOf(record.hostId),
      state,
      cancelsOnHide: BEFORE_START.includes(state),
    };
  };

  /** 停止したときに取り消すもの（docs/06の5-9）。中止・非表示・開始後の募集は変えない */
  const suspensionTargets = (userId: string) => {
    const beforeStart = (eventId: string) => {
      const record = db.events.find((event) => event.id === eventId);
      return record !== undefined && BEFORE_START.includes(devEventState(db, record, now()));
    };
    const applications = db.applications.filter(
      (application) => application.userId === userId && beforeStart(application.eventId),
    );
    return {
      approved: applications.filter((application) => application.status === 'approved'),
      pending: applications.filter((application) => application.status === 'pending'),
      events: db.events.filter((event) => event.hostId === userId && beforeStart(event.id)),
    };
  };
  const impactOf = (targets: ReturnType<typeof suspensionTargets>): SuspensionImpact => ({
    cancelledParticipations: targets.approved.length,
    retractedApplications: targets.pending.length,
    cancelledEvents: targets.events.length,
  });

  const addAction = (
    action: Omit<DevDatabase['moderationActions'][number], 'id' | 'createdAt'>,
    createdAt: Date,
  ) => {
    const id = `dev-action-${db.moderationActions.length + 1}`;
    db.moderationActions.push({ ...action, id, createdAt });
    return id;
  };

  /** 補足。前後の空白を除き、空なら null。500文字を超えれば undefined（docs/06の4-12） */
  const noteOf = (note: string | null) => (note === null ? null : normalizeReportDetail(note));

  return {
    getAccess: () => Promise.resolve(access()),

    listReports: (status) =>
      read(() => {
        const reports = db.reports.filter((report) => status === 'all' || report.status === status);
        // 対応を待っている通報は古い順、終わった通報は新しい順
        const oldestFirst = status === 'open' || status === 'inProgress';
        reports.sort((a, b) =>
          oldestFirst
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return {
          openCount: db.reports.filter((report) => report.status === 'open').length,
          reports: reports.map(toSummary),
        };
      }),

    getReport: (reportId) =>
      read((): AdminReportDetail | null => {
        const report = db.reports.find((item) => item.id === reportId);
        if (!report) return null;
        const record =
          report.targetKind === 'event'
            ? db.events.find((event) => event.id === report.targetId)
            : undefined;
        const subject = findDevUser(db, report.subjectUserId);
        return {
          ...toSummary(report),
          detail: report.detail,
          snapshot: report.snapshot,
          handledAt: report.handledAt?.toISOString() ?? null,
          resolutionNote: report.resolutionNote,
          subject: {
            userId: report.subjectUserId,
            nickname: nicknameOf(report.subjectUserId),
            status: statusOf(report.subjectUserId),
          },
          event: record ? toEventView(record) : null,
          // 通報された人のニックネーム・経験レベル・自己紹介だけ（年代・性別は返さない。docs/11の4-1）
          profile:
            report.targetKind === 'user' && subject?.profile
              ? {
                  nickname: subject.profile.nickname,
                  experienceLevel: subject.profile.experienceLevel,
                  bio: subject.profile.bio,
                }
              : null,
        };
      }),

    updateReportStatus: (reportId, { status, note }) => {
      const admin = adminId();
      if ('denied' in admin) return Promise.resolve({ status: 'denied', reason: admin.denied });
      const report = db.reports.find((item) => item.id === reportId);
      if (!report) return rejected('notFound');
      if (!REPORT_STATUS_TRANSITIONS[report.status].includes(status))
        return rejected('invalidState');
      const resolutionNote = noteOf(note);
      if (resolutionNote === undefined) return rejected('invalid');
      const current = now();
      report.status = status;
      report.handledBy = admin.id;
      report.handledAt = status === 'resolved' || status === 'dismissed' ? current : null;
      if (resolutionNote !== null) report.resolutionNote = resolutionNote;
      report.updatedAt = current;
      return Promise.resolve({ status: 'done' });
    },

    hideReportedEvent: (reportId, { reasonCode, reasonNote }) => {
      const admin = adminId();
      if ('denied' in admin) return Promise.resolve({ status: 'denied', reason: admin.denied });
      const report = db.reports.find((item) => item.id === reportId);
      const record =
        report?.targetKind === 'event'
          ? db.events.find((event) => event.id === report.targetId)
          : undefined;
      if (!report || !record) return rejected('notFound');
      if (record.hidden) return rejected('invalidState');
      const note = noteOf(reasonNote);
      if (!isReportReason(reasonCode) || note === undefined) return rejected('invalid');

      const current = now();
      const state = devEventState(db, record, current);
      // 開催開始前の募集は、非表示と同時に中止する。開始後は非表示だけ。どちらも戻せない（M-08）
      record.hidden = true;
      if (BEFORE_START.includes(state)) record.status = 'cancelled';
      const actionId = addAction(
        {
          adminId: admin.id,
          targetUserId: record.hostId,
          action: 'hideEvent',
          reasonCode,
          reasonNote: note,
          eventId: record.id,
          reportId: report.id,
        },
        current,
      );
      // 終了・中止した募集では、主催者だけに通知する（DB-24）
      notifyEventHidden(
        db,
        record,
        { actionId, includeParticipants: state !== 'ended' && state !== 'cancelled' },
        current,
      );
      return Promise.resolve({ status: 'done' });
    },

    searchUsers: (nickname) =>
      read(() => {
        const key = normalizeKey(nickname);
        if (key === '') return [];
        return db.users
          .flatMap((user) =>
            // 管理者と、プロフィールのない人（退会した人を含む）は出さない
            user.role === 'user' &&
            user.profile &&
            normalizeKey(user.profile.nickname).includes(key)
              ? [{ userId: user.id, nickname: user.profile.nickname, status: user.status }]
              : [],
          )
          .slice(0, SEARCH_LIMIT);
      }),

    getUser: (userId) =>
      read((): AdminUserDetail | null => {
        const user = findDevUser(db, userId);
        const actions = db.moderationActions
          .filter((action) => action.targetUserId === userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((action) => ({
            id: action.id,
            action: action.action,
            reasonCode: action.reasonCode,
            reasonNote: action.reasonNote,
            createdAt: action.createdAt.toISOString(),
            eventTitle: db.events.find((event) => event.id === action.eventId)?.title ?? null,
          }));
        // 管理者は扱わない。退会した人は、通報や措置の記録がある場合だけ示す
        if (user?.role === 'admin') return null;
        const known =
          user !== undefined ||
          actions.length > 0 ||
          db.reports.some((report) => report.subjectUserId === userId);
        if (!known) return null;
        return {
          userId,
          nickname: nicknameOf(userId),
          status: statusOf(userId),
          actions,
          suspensionImpact: user?.status === 'active' ? impactOf(suspensionTargets(userId)) : null,
        };
      }),

    suspendUser: (userId, { reasonCode, reasonNote, reportId }) => {
      const admin = adminId();
      if ('denied' in admin) return Promise.resolve({ status: 'denied', reason: admin.denied });
      const user = findDevUser(db, userId);
      if (!user || user.role !== 'user') return rejected('notFound');
      // 二重の停止は、記録を残さずに断る（docs/06の5-9）
      if (user.status !== 'active') return rejected('invalidState');
      const note = noteOf(reasonNote);
      const report = reportId === null ? null : db.reports.find((item) => item.id === reportId);
      // 停止の補足は必須（docs/06の4-12）。きっかけの通報は、通報された人が同じであること
      if (
        !isReportReason(reasonCode) ||
        !note ||
        report === undefined ||
        (report && report.subjectUserId !== userId)
      ) {
        return rejected('invalid');
      }

      const current = now();
      const targets = suspensionTargets(userId);
      addAction(
        {
          adminId: admin.id,
          targetUserId: userId,
          action: 'suspend',
          reasonCode,
          reasonNote: note,
          eventId: null,
          reportId: report?.id ?? null,
        },
        current,
      );
      user.status = 'suspended';
      // 開催開始前の参加はキャンセル（主催者へ通常のキャンセルとして通知）、承認待ちは取り下げ（通知しない）
      for (const application of targets.approved) {
        application.status = 'cancelled';
        application.cancelledAt = current;
        notifyParticipantChange(db, application, 'participation_cancelled', current);
      }
      for (const application of targets.pending) {
        application.status = 'retracted';
        application.retractedAt = current;
      }
      // 主催する開催開始前の募集は必ず中止する（M-03）。通知は主催者による中止と同じで、停止のことは書かない
      for (const record of targets.events) {
        record.status = 'cancelled';
        addAction(
          {
            adminId: admin.id,
            targetUserId: userId,
            action: 'cancelEventBySuspension',
            reasonCode,
            reasonNote: null,
            eventId: record.id,
            reportId: report?.id ?? null,
          },
          current,
        );
        notifyEventCancelled(db, record, current);
      }
      // 停止は直ちに反映する（SAFE-05）
      session.notify();
      return Promise.resolve({ status: 'done', impact: impactOf(targets) });
    },

    unsuspendUser: (userId, { reasonNote }) => {
      const admin = adminId();
      if ('denied' in admin) return Promise.resolve({ status: 'denied', reason: admin.denied });
      const user = findDevUser(db, userId);
      if (!user || user.role !== 'user') return rejected('notFound');
      if (user.status !== 'suspended') return rejected('invalidState');
      const note = noteOf(reasonNote);
      if (!note) return rejected('invalid');
      addAction(
        {
          adminId: admin.id,
          targetUserId: userId,
          action: 'unsuspend',
          reasonCode: null,
          reasonNote: note,
          eventId: null,
          reportId: null,
        },
        now(),
      );
      // 取り消した参加・中止した募集は戻さない（docs/11の4-2）
      user.status = 'active';
      session.notify();
      return Promise.resolve({ status: 'done' });
    },
  };
}
