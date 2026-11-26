import type { EventState } from '../events/types';
import type { PublicProfile } from '../profiles/types';

/**
 * 申請の状態（docs/11の2-3）。サイクル1は承認待ち・承認済み・却下だけを扱う。
 * キャンセル・承認取り消し・取り下げ（APP-08・APP-11・CND-10）は、作るときに加える。
 */
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

/** 申請を断る理由。画面は理由に応じて案内する。 */
export type ApplyRejection =
  | 'notLoggedIn'
  | 'profileRequired'
  /** 主催者は自分の募集に申請できない */
  | 'ownEvent'
  /** 承認待ち・承認済みの申請がすでにある */
  | 'alreadyApplied'
  /** 却下された募集には、もう申請できない（docs/11の2-2） */
  | 'notReapplicable'
  /** 締切・開催開始後・中止・非表示 */
  | 'notAccepting'
  | 'full'
  | 'rateLimited'
  | 'notFound';

export type ApplyResult = { status: 'applied' } | { status: 'rejected'; reason: ApplyRejection };

/** 承認・却下を断る理由。 */
export type DecisionRejection =
  | 'notFound'
  /** すでに承認・却下した */
  | 'notPending'
  /** 定員に達している（承認だけ） */
  | 'full'
  /** 開催開始後・中止・非表示 */
  | 'notAccepting';

export type DecisionResult = { status: 'done' } | { status: 'rejected'; reason: DecisionRejection };

/** 申請者一覧の1人分。申請者のプロフィールは、ログイン済みに公開する項目だけ。 */
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
  /** 主催者でない、または非表示の募集（DB-19 の仮の扱い） */
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

export interface MyParticipation {
  applicationId: string;
  status: ApplicationStatus;
  event: EventSummary;
}

/**
 * 申請の窓口。将来は docs/06の6-5の関数（apply_to_event・approve_application・
 * reject_application・get_my_participations）を呼ぶ実装に置き換える。
 * 操作する人は、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 * 通信の失敗は例外、条件による拒否は結果で返す。
 */
export interface ApplicationRepository {
  applyToEvent(eventId: string): Promise<ApplyResult>;
  approveApplication(applicationId: string): Promise<DecisionResult>;
  rejectApplication(applicationId: string): Promise<DecisionResult>;
  /** 自分が主催する募集の申請者。docs/06の6-5に対応する関数の名前はまだない */
  listApplicants(eventId: string): Promise<ApplicantListResult>;
  /** 自分の申請。終了・中止した募集の分も返す */
  getMyParticipations(): Promise<MyParticipation[]>;
}

/** 回数の上限（docs/11の4-5）。 */
export const APPLICATION_LIMITS = {
  dailyApplyLimit: 20,
} as const;
