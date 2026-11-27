import type { EventState } from '../events/types';
import type { PublicProfile } from '../profiles/types';

/**
 * 申請の状態（docs/11の2-3）。状態は後戻りしない（docs/06の4-5）。
 * キャンセル・取り下げの後は再申請でき、新しい申請になる。却下・承認取り消しの後はできない。
 */
export type ApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  /** 承認済みの本人がキャンセルした（APP-08） */
  | 'cancelled'
  /** 主催者が承認を取り消した（APP-11） */
  | 'revoked'
  /** 承認待ちの本人が取り下げた（CND-10） */
  | 'retracted';

/** 同じ募集への申請は、合計3回まで（docs/11の2-2、docs/06の4-5の attempt_no）。 */
export const MAX_ATTEMPTS = 3;

/** 申請を断る理由。画面は理由に応じて案内する。 */
export type ApplyRejection =
  | 'notLoggedIn'
  | 'profileRequired'
  /** 主催者は自分の募集に申請できない */
  | 'ownEvent'
  /** 承認待ち・承認済みの申請がすでにある */
  | 'alreadyApplied'
  /** 却下・承認取り消しの後は、同じ募集に申請できない（docs/11の2-2） */
  | 'notReapplicable'
  /** 同じ募集への申請が、合計3回に達した */
  | 'attemptLimit'
  /** 締切・開催開始後・中止・非表示 */
  | 'notAccepting'
  | 'rateLimited'
  /**
   * そのほかの理由で申請できない（どちらかが相手をブロックしている）。
   * 画面には「申請できません」とだけ示し、ブロックを推測させない（docs/11の3-1）
   */
  | 'notAllowed'
  | 'notFound';

export type ApplyResult = { status: 'applied' } | { status: 'rejected'; reason: ApplyRejection };

/** 承認・却下を断る理由。 */
export type DecisionRejection =
  | 'notFound'
  /** すでに承認・却下した */
  | 'notPending'
  /** 定員に達していて、定員を増やす指定がない・指定が今の定員と合わない（承認だけ） */
  | 'full'
  /** 定員が上限（100人）のため、増やせない（承認だけ） */
  | 'capacityLimit'
  /** 開催開始後・中止・非表示 */
  | 'notAccepting';

export type DecisionResult = { status: 'done' } | { status: 'rejected'; reason: DecisionRejection };

/** 承認の取り消しの理由（docs/11の3-3、docs/06の4-19）。画面にもこの順で示す。 */
export const REVOKE_REASONS = [
  'mistaken_approval',
  'not_matching',
  'safety',
  'event_changed',
  'other',
] as const;

export type RevokeReason = (typeof REVOKE_REASONS)[number];

/** 承認の取り消しを断る理由。 */
export type RevokeRejection =
  | 'notFound'
  /** 承認済みでない（すでに取り消した・キャンセルされたなど） */
  | 'notApproved'
  /** 理由がない、または選択肢にない */
  | 'reasonRequired'
  /** 開催開始後・中止・非表示 */
  | 'notAccepting';

export type RevokeResult = { status: 'done' } | { status: 'rejected'; reason: RevokeRejection };

/** キャンセル・取り下げを断る理由。 */
export type OwnActionRejection =
  | 'notFound'
  /** キャンセルは承認済み、取り下げは承認待ちの申請だけ */
  | 'invalidState'
  /** 開催開始後・中止・非表示 */
  | 'notAccepting';

export type OwnActionResult =
  { status: 'done' } | { status: 'rejected'; reason: OwnActionRejection };

/**
 * 申請者一覧の1人分。申請者のプロフィールは、ログイン済みに公開する項目だけ。
 * 同じ人が再申請した場合は、最新の申請だけ（履歴の表示は公開後、M-14）。
 */
export interface Applicant {
  applicationId: string;
  status: ApplicationStatus;
  appliedAt: string;
  profile: PublicProfile;
}

export interface ApplicantList {
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    state: EventState;
    capacity: number;
    /** 定員に数えるのは承認済みだけ（docs/06の5-1） */
    approvedCount: number;
    /** 承認・却下できる期間か（開催開始前で、中止でない） */
    canDecide: boolean;
  };
  applicants: Applicant[];
}

export type ApplicantListResult =
  | { status: 'ready'; list: ApplicantList }
  /** 主催者でない、または非表示の募集（DB-19） */
  | { status: 'forbidden'; reason: 'notHost' | 'hidden' }
  | { status: 'notFound' };

/** 申請・募集の管理に出す募集。非表示の募集は開催日時だけ（docs/11の4-4）。 */
export type EventSummary =
  | {
      hidden: false;
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      state: EventState;
    }
  | { hidden: true; startsAt: string; endsAt: string };

/** 自分の申請。同じ募集に複数の申請がある場合は、最新の1件だけ（履歴の表示は公開後、M-14）。 */
export interface MyParticipation {
  applicationId: string;
  status: ApplicationStatus;
  event: EventSummary;
}

/**
 * 申請の窓口。将来は docs/06の6-5の関数（apply_to_event・approve_application・
 * reject_application・revoke_approval・cancel_participation・retract_application・get_my_participations）を
 * 呼ぶ実装に置き換える。
 * 操作する人は、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 * 通信の失敗は例外、条件による拒否は結果で返す。
 */
export interface ApplicationRepository {
  applyToEvent(eventId: string): Promise<ApplyResult>;
  /**
   * 承認する。満員の場合は expandCapacityTo に「今の定員＋1」を渡すと、承認と同時に定員を1人増やす。
   * 渡した値が今の定員＋1と合わない場合は、ほかの操作で変わったものとして断る（full）。
   */
  approveApplication(
    applicationId: string,
    options?: { expandCapacityTo?: number },
  ): Promise<DecisionResult>;
  rejectApplication(applicationId: string): Promise<DecisionResult>;
  /**
   * 主催者が承認を取り消す（APP-11）。理由は必須。参加者へ通知し、相手は同じ募集に再申請できなくなる。
   * 理由は記録するが、参加者への通知には含めない
   */
  revokeApproval(applicationId: string, reason: RevokeReason): Promise<RevokeResult>;
  /** 自分の承認済みの参加をキャンセルする（APP-08）。主催者へ通知する */
  cancelParticipation(applicationId: string): Promise<OwnActionResult>;
  /** 自分の承認待ちの申請を取り下げる（CND-10）。主催者へは通知しない */
  retractApplication(applicationId: string): Promise<OwnActionResult>;
  /** 自分が主催する募集の申請者。docs/06の6-5の list_event_applicants【提案・未承認】に対応する */
  listApplicants(eventId: string): Promise<ApplicantListResult>;
  /** 自分の申請。終了・中止した募集の分も返す。募集ごとに最新の申請だけ */
  getMyParticipations(): Promise<MyParticipation[]>;
}

/** 回数の上限（docs/11の4-5）。 */
export const APPLICATION_LIMITS = {
  dailyApplyLimit: 20,
} as const;
