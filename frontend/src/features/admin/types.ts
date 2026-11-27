import type { EventState } from '../events/types';
import type { ExperienceLevel } from '../profiles/types';
import type { ReportReason, ReportStatus, ReportTargetKind } from '../reports/types';

/**
 * 通報時の対象の控え（docs/11の4-3）。DB側で作り、住所と画像は含めない。
 * メッセージは、通報したものの控えだけを見られる（M-05）。
 */
export type ReportSnapshot =
  | { kind: 'user'; nickname: string; bio: string | null }
  | { kind: 'event'; title: string; description: string | null }
  | { kind: 'message'; body: string };

/**
 * 管理の画面を使えるか。
 * - mfaRequired：管理者だが、多要素認証が済んでいない（本番では aal2 でないセッション）
 * - forbidden：管理者でない
 */
export type AdminAccess = 'granted' | 'mfaRequired' | 'forbidden';
export type AdminDenial = Exclude<AdminAccess, 'granted'>;

/** 読み込みの結果。管理者の確認は、画面ではなく窓口（本番はDB関数）が毎回行う。 */
export type AdminRead<T> = { status: 'ok'; value: T } | { status: 'denied'; reason: AdminDenial };

/** 利用者の状態。退会した人は、プロフィールが消えている */
export type AdminUserStatus = 'active' | 'suspended' | 'withdrawn';

export interface AdminReportSummary {
  id: string;
  kind: ReportTargetKind;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  /** 通報された人（募集は主催者、メッセージは送信者）のニックネーム。退会した人は null */
  subjectNickname: string | null;
}

export interface AdminReportList {
  /** 未対応の件数（追加-13）。絞り込みに関係なく、すべての未対応を数える */
  openCount: number;
  reports: AdminReportSummary[];
}

/** 募集の公開項目と状態（docs/06の6-5の admin_get_event）。住所・参加者は含めない。 */
export interface AdminEventView {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  hostNickname: string | null;
  state: EventState | 'hidden';
  /** 非表示にすると、同時に中止になるか（開催開始前の募集。docs/11の4-4） */
  cancelsOnHide: boolean;
}

/** 通報された人の、ログイン済みに公開する項目だけ（docs/11の4-1）。年代などは含めない。 */
export interface AdminReportedProfile {
  nickname: string;
  experienceLevel: ExperienceLevel;
  bio: string | null;
}

export interface AdminReportDetail extends AdminReportSummary {
  /** 通報者が書いた補足 */
  detail: string | null;
  snapshot: ReportSnapshot;
  /** 対応が終わった日時と、対応の記録 */
  handledAt: string | null;
  resolutionNote: string | null;
  subject: { userId: string; nickname: string | null; status: AdminUserStatus };
  /** 募集の通報だけ。今の募集 */
  event: AdminEventView | null;
  /** ユーザーの通報だけ。今のプロフィール。退会した場合は null */
  profile: AdminReportedProfile | null;
}

export type ModerationActionType =
  'suspend' | 'unsuspend' | 'hideEvent' | 'cancelEventBySuspension';

/** 措置の記録（docs/06の4-12）。 */
export interface ModerationActionView {
  id: string;
  action: ModerationActionType;
  reasonCode: ReportReason | null;
  reasonNote: string | null;
  createdAt: string;
  /** 募集への措置だけ */
  eventTitle: string | null;
}

/** 利用停止で取り消すものの件数（docs/06の5-9）。 */
export interface SuspensionImpact {
  /** 開催開始前の参加（承認済み）のキャンセル */
  cancelledParticipations: number;
  /** 承認待ちの取り下げ */
  retractedApplications: number;
  /** 主催する開催開始前の募集の中止（M-03） */
  cancelledEvents: number;
}

export interface AdminUserSummary {
  userId: string;
  nickname: string;
  status: Exclude<AdminUserStatus, 'withdrawn'>;
}

/** 利用者管理で見られるもの。ニックネーム・利用状態・措置の履歴だけ（docs/10の5-10）。 */
export interface AdminUserDetail {
  userId: string;
  nickname: string | null;
  status: AdminUserStatus;
  /** 新しい順 */
  actions: ModerationActionView[];
  /** 停止したときに取り消すものの件数。利用中の人だけ */
  suspensionImpact: SuspensionImpact | null;
}

export type AdminActionResult =
  | { status: 'done' }
  | { status: 'denied'; reason: AdminDenial }
  /** notFound：対象がない。invalidState：今の状態ではできない。invalid：理由などが条件に合わない */
  | { status: 'rejected'; reason: 'notFound' | 'invalidState' | 'invalid' };

export type SuspendResult =
  { status: 'done'; impact: SuspensionImpact } | Exclude<AdminActionResult, { status: 'done' }>;

/** 通報の状態の変え方（docs/06の4-10）。終わった通報を対応中に戻す操作は公開後（M-05）。 */
export type ReportStatusChange = Exclude<ReportStatus, 'open'>;

/**
 * 管理の窓口（SAFE-05〜07・CND-07）。将来は docs/06の6-5の admin_* を呼ぶ実装に置き換える。
 * 操作する管理者は、常にログイン中の人。管理者であることと多要素認証は、窓口が毎回確かめる。
 * メールアドレス・住所・参加者の一覧・ブロックの情報は返さない（docs/11の4-1）。
 */
export interface AdminRepository {
  getAccess(): Promise<AdminAccess>;
  listReports(status: ReportStatus | 'all'): Promise<AdminRead<AdminReportList>>;
  /** ない場合は value が null */
  getReport(reportId: string): Promise<AdminRead<AdminReportDetail | null>>;
  updateReportStatus(
    reportId: string,
    input: { status: ReportStatusChange; note: string | null },
  ): Promise<AdminActionResult>;
  /** 募集の通報の対象を非表示にする（SAFE-07）。開催開始前なら同時に中止する。戻せない（M-08） */
  hideReportedEvent(
    reportId: string,
    input: { reasonCode: ReportReason; reasonNote: string | null },
  ): Promise<AdminActionResult>;
  /** ニックネームで探す。1回20件まで。管理者・退会した人は出ない */
  searchUsers(nickname: string): Promise<AdminRead<AdminUserSummary[]>>;
  getUser(userId: string): Promise<AdminRead<AdminUserDetail | null>>;
  /** 利用停止（SAFE-05）。理由の分類と補足が必須。reportId は、きっかけの通報 */
  suspendUser(
    userId: string,
    input: { reasonCode: ReportReason; reasonNote: string; reportId: string | null },
  ): Promise<SuspendResult>;
  /** 停止の解除（CND-07）。補足が必須。取り消した参加・中止した募集は戻さない */
  unsuspendUser(userId: string, input: { reasonNote: string }): Promise<AdminActionResult>;
}
