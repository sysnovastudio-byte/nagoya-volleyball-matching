/** 退会できない原因になっている、主催する開催開始前の募集（docs/06の5-8の段階1の2）。 */
export interface UpcomingHostedEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

/**
 * 退会の画面を開いたときの確認（SCR-017）。画面の表示のためのもので、退会の時に窓口がもう一度確かめる。
 * - available：退会できる。impact は、退会で取り消す自分の参加・申請の件数
 * - hostingUpcoming：主催する開催開始前の募集があるため、退会できない【合意済み】
 * - unavailable：未ログイン・管理用のアカウント・利用停止中（停止中は問い合わせで受け付ける。M-06）
 */
export type WithdrawalCheck =
  | {
      status: 'available';
      impact: {
        /** 開催開始前の、承認済みの参加。キャンセルして主催者へ通知する */
        approvedParticipations: number;
        /** 開催開始前の、承認待ちの申請。取り下げる */
        pendingApplications: number;
      };
    }
  | { status: 'hostingUpcoming'; events: UpcomingHostedEvent[] }
  | { status: 'unavailable'; reason: 'notLoggedIn' | 'admin' | 'suspended' };

/**
 * 退会の結果。
 * - wrongPassword：パスワードの再入力が合わない（DB-26）
 * - hostingUpcoming：主催する開催開始前の募集がある
 * - notAllowed：未ログイン・管理用のアカウント・利用停止中
 */
export type WithdrawResult =
  | { status: 'withdrawn' }
  | { status: 'rejected'; reason: 'wrongPassword' | 'hostingUpcoming' | 'notAllowed' };

/**
 * 退会（CND-08）の窓口。対象はログイン中の本人だけで、利用者のIDを画面から受け取らない。
 * 本番では Edge Functions が、検証済みのJWTから本人を求め、直近のパスワードでのログイン（JWTの amr）を
 * 確かめてから、docs/06の5-8・14-5 の段階で処理する（DB-26）。
 */
export interface AccountRepository {
  getWithdrawalCheck(): Promise<WithdrawalCheck>;
  /** パスワードを確かめてから退会する。退会したら、ログアウトした状態になる */
  withdraw(input: { password: string }): Promise<WithdrawResult>;
}
