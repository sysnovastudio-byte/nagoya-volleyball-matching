import type { ModerationActionType, ReportSnapshot } from '../features/admin/types';
import type { ReportReason, ReportStatus, ReportTargetKind } from '../features/reports/types';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devModeration');

/** 【開発専用】保存されている通報の形（docs/06の4-10）。 */
export interface DevReportRecord {
  id: string;
  reporterId: string;
  /** 通報された人（募集は主催者、メッセージは送信者） */
  subjectUserId: string;
  targetKind: ReportTargetKind;
  /** 利用者・募集・メッセージのID */
  targetId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  snapshot: ReportSnapshot;
  /** 最後に対応した管理者 */
  handledBy: string | null;
  /** 対応が終わった日時。対応済み・対応不要のときだけ */
  handledAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 【開発専用】保存されている措置の記録の形（docs/06の4-12）。追加だけで、変えない。 */
export interface DevModerationActionRecord {
  id: string;
  adminId: string;
  targetUserId: string;
  action: ModerationActionType;
  reasonCode: ReportReason | null;
  reasonNote: string | null;
  eventId: string | null;
  reportId: string | null;
  createdAt: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const ADMIN = 'dev-admin';

/**
 * 状態ごとの架空の通報。本文は架空で、住所・連絡先の形の文字を入れない。
 * 対象のメッセージは devConversations.ts の会話にある。
 */
const REPORTS: (Omit<DevReportRecord, 'createdAt' | 'updatedAt' | 'handledAt'> & {
  hoursAgo: number;
  handledHoursAgo?: number;
})[] = [
  {
    id: 'dev-report-1',
    reporterId: 'dev-member-2',
    subjectUserId: 'dev-host-minato',
    targetKind: 'event',
    targetId: 'dev-weekday-night',
    reason: 'falseInformation',
    detail: '説明にある会場と、実際の会場が違うようです。',
    status: 'open',
    snapshot: {
      kind: 'event',
      title: '平日夜にしっかり動く会',
      description: null,
    },
    handledBy: null,
    resolutionNote: null,
    hoursAgo: 3,
  },
  {
    id: 'dev-report-2',
    reporterId: 'dev-member-1',
    subjectUserId: 'dev-host-tsubasa',
    targetKind: 'user',
    targetId: 'dev-host-tsubasa',
    reason: 'solicitation',
    detail: null,
    status: 'open',
    // 通報の後に自己紹介を消したため、今のプロフィールと控えが違う
    snapshot: {
      kind: 'user',
      nickname: 'つばさ',
      bio: '別のサービスの練習会にも参加しませんか。プロフィールの名前で検索してください。',
    },
    handledBy: null,
    resolutionNote: null,
    hoursAgo: 26,
  },
  {
    id: 'dev-report-3',
    reporterId: 'dev-member-3',
    subjectUserId: 'dev-host-minato',
    targetKind: 'message',
    targetId: 'dev-conv-reported-message-2',
    reason: 'solicitation',
    detail: '練習と関係のない会への勧誘が続いています。',
    status: 'inProgress',
    snapshot: {
      kind: 'message',
      body: '練習とは別に、こちらの会にも入りませんか。会費は月払いです。',
    },
    handledBy: ADMIN,
    resolutionNote: null,
    hoursAgo: 30,
  },
  {
    id: 'dev-report-4',
    reporterId: 'dev-host-haru',
    subjectUserId: 'dev-user-suspended',
    targetKind: 'message',
    targetId: 'dev-conv-suspended-message-3',
    reason: 'dating',
    detail: '練習と関係なく、個別に会うことをしつこく求められました。',
    status: 'resolved',
    snapshot: { kind: 'message', body: '練習の後、二人で会えませんか。個別に連絡したいです。' },
    handledBy: ADMIN,
    resolutionNote: '出会い目的のメッセージが続いたため、利用停止とした。',
    hoursAgo: 96,
    handledHoursAgo: 72,
  },
  {
    id: 'dev-report-5',
    reporterId: 'dev-member-4',
    subjectUserId: 'dev-host-yui',
    targetKind: 'event',
    targetId: 'dev-family-morning',
    reason: 'other',
    detail: '参加費が高い気がします。',
    status: 'dismissed',
    snapshot: {
      kind: 'event',
      title: '家族や友人と楽しむ午前バレー',
      description: '各自で1人ずつ申請してください。',
    },
    handledBy: ADMIN,
    resolutionNote: '規約に反する内容ではないため、対応不要とした。',
    hoursAgo: 144,
    handledHoursAgo: 120,
  },
];

/** 措置の記録。dev-action-1 は、通知のダミー（devNotifications.ts）の鍵と合わせる。 */
const ACTIONS: (Omit<DevModerationActionRecord, 'createdAt'> & { hoursAgo: number })[] = [
  {
    id: 'dev-action-1',
    adminId: ADMIN,
    targetUserId: 'dev-host-tsubasa',
    action: 'hideEvent',
    reasonCode: 'dangerousOrIllegal',
    reasonNote: null,
    eventId: 'dev-hidden',
    reportId: null,
    hoursAgo: 26,
  },
  {
    id: 'dev-action-2',
    adminId: ADMIN,
    targetUserId: 'dev-user-b',
    action: 'hideEvent',
    reasonCode: 'falseInformation',
    reasonNote: null,
    eventId: 'dev-b-hidden',
    reportId: null,
    hoursAgo: 48,
  },
  {
    id: 'dev-action-3',
    adminId: ADMIN,
    targetUserId: 'dev-user-suspended',
    action: 'suspend',
    reasonCode: 'dating',
    reasonNote: '出会い目的のメッセージを繰り返し送ったため。',
    eventId: null,
    reportId: 'dev-report-4',
    hoursAgo: 72,
  },
];

export function createDevReports(now: Date): DevReportRecord[] {
  const at = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);
  return REPORTS.map(({ hoursAgo, handledHoursAgo, ...report }) => ({
    ...report,
    createdAt: at(hoursAgo),
    updatedAt: at(handledHoursAgo ?? hoursAgo),
    handledAt: handledHoursAgo === undefined ? null : at(handledHoursAgo),
  }));
}

export function createDevModerationActions(now: Date): DevModerationActionRecord[] {
  return ACTIONS.map(({ hoursAgo, ...action }) => ({
    ...action,
    createdAt: new Date(now.getTime() - hoursAgo * HOUR_MS),
  }));
}
