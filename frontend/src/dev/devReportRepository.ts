import type { ReportSnapshot } from '../features/admin/types';
import { isReportReason, normalizeReportDetail } from '../features/reports/reportRules';
import type {
  ReportRepository,
  ReportTarget,
  ReportTargetKind,
  SubmitReportResult,
} from '../features/reports/types';
import { devEventState, findDevMember, findDevUser, type DevDatabase } from './devDatabase';
import { reportLimitReached } from './devRateLimits';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devReportRepository');

interface DevReportRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/** 誰でも詳細を見られる募集の状態（devEventRepository.ts と同じ、docs/06の5-12）。 */
const PUBLIC_STATES = ['open', 'full', 'closed', 'ongoing'];

interface ResolvedTarget {
  subjectUserId: string;
  target: ReportTarget;
  snapshot: ReportSnapshot;
}

/**
 * 【開発専用】通報の窓口（SAFE-01〜03）。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では submit_report（docs/06の6-5）が、回数・対象を見られること・自分以外を確かめ、
 * 通報された人と控えをDB側で決める。重複は部分一意インデックスで防ぐ（docs/06の4-10）。
 */
export function createDevReportRepository({
  db,
  session,
  now = () => new Date(),
}: DevReportRepositoryOptions): ReportRepository {
  // 一般の操作ができる人だけ。管理者・利用停止中の人は通報できない（docs/11の4-1・4-2）
  const currentUser = () => findDevMember(db, session.getUserId());

  /** 通報できる対象と、通報された人・控え。見られない・自分のもの・退会した人は undefined */
  const resolveTarget = (
    userId: string,
    kind: ReportTargetKind,
    targetId: string,
  ): ResolvedTarget | undefined => {
    switch (kind) {
      case 'user': {
        const target = findDevUser(db, targetId);
        // 退会した人（プロフィールがない人）への「ユーザーの通報」は受け付けない（DB-30）
        if (!target?.profile || target.role !== 'user' || target.id === userId) return undefined;
        const { nickname, bio } = target.profile;
        return {
          subjectUserId: target.id,
          target: { kind, id: target.id, nickname },
          snapshot: { kind, nickname, bio },
        };
      }
      case 'event': {
        const record = db.events.find((event) => event.id === targetId);
        if (!record || record.hostId === userId) return undefined;
        const state = devEventState(db, record, now());
        // 見られる募集だけ（getEvent と同じ）。非表示は見られない。終了・中止は申請したことがある人だけ
        const applied = db.applications.some(
          (item) => item.eventId === record.id && item.userId === userId,
        );
        if (state === 'hidden' || (!PUBLIC_STATES.includes(state) && !applied)) return undefined;
        return {
          subjectUserId: record.hostId,
          target: { kind, id: record.id, title: record.title },
          // 住所は控えに含めない（docs/11の4-3）
          snapshot: { kind, title: record.title, description: record.description },
        };
      }
      case 'message': {
        const message = db.messages.find((item) => item.id === targetId);
        const conversation =
          message && db.conversations.find((item) => item.id === message.conversationId);
        if (!message || !conversation) return undefined;
        // 会話の当事者だけが、相手のメッセージを通報できる。退会した人のメッセージも通報できる（DB-30）
        const isParty = conversation.hostId === userId || conversation.inquirerId === userId;
        if (!isParty || message.senderId === userId) return undefined;
        return {
          subjectUserId: message.senderId,
          target: {
            kind,
            id: message.id,
            senderNickname: findDevUser(db, message.senderId)?.profile?.nickname ?? null,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
            conversationId: conversation.id,
          },
          snapshot: { kind, body: message.body },
        };
      }
    }
  };

  const rejected = (reason: Extract<SubmitReportResult, { status: 'rejected' }>['reason']) =>
    Promise.resolve<SubmitReportResult>({ status: 'rejected', reason });

  return {
    getReportTarget: (kind, targetId) => {
      const user = currentUser();
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      const resolved = resolveTarget(user.id, kind, targetId);
      return Promise.resolve(
        resolved
          ? { status: 'ok', target: resolved.target }
          : { status: 'rejected', reason: 'notFound' },
      );
    },

    submitReport: ({ kind, targetId, reason, detail: rawDetail }) => {
      const user = currentUser();
      if (!user) return rejected('notLoggedIn');
      const detail = rawDetail === null ? null : normalizeReportDetail(rawDetail);
      if (!isReportReason(reason) || detail === undefined) return rejected('invalid');
      const current = now();
      // 回数の上限（24時間に10件、SAFE-09）。受け付けた通報だけを数える
      const reportedAt = db.reports
        .filter((report) => report.reporterId === user.id)
        .map((report) => report.createdAt);
      if (reportLimitReached(reportedAt, current)) return rejected('rateLimited');
      const resolved = resolveTarget(user.id, kind, targetId);
      if (!resolved) return rejected('notFound');
      // 同じ対象への、対応が終わっていない通報は1件まで
      const duplicate = db.reports.some(
        (report) =>
          report.reporterId === user.id &&
          report.targetKind === kind &&
          report.targetId === targetId &&
          (report.status === 'open' || report.status === 'inProgress'),
      );
      if (duplicate) return rejected('duplicate');
      db.reports.push({
        id: `dev-report-${db.reports.length + 1}`,
        reporterId: user.id,
        subjectUserId: resolved.subjectUserId,
        targetKind: kind,
        targetId,
        reason,
        detail,
        status: 'open',
        snapshot: resolved.snapshot,
        handledBy: null,
        handledAt: null,
        resolutionNote: null,
        createdAt: current,
        updatedAt: current,
      });
      return Promise.resolve({ status: 'done' });
    },
  };
}
