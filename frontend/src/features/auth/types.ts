/**
 * ログインしている人。画面が表示の切り替えに使う情報だけを持ち、利用者のIDは持たない。
 * 権限の判定は、取得の窓口（将来はDB）が行う。画面の判定は表示のためだけのもの。
 */
export interface Viewer {
  /** 管理者は、一般の操作（申請・作成・送信など）をしない。管理の画面の入口は設定だけ（docs/11の4-1） */
  role: 'user' | 'admin';
  /** 利用停止中は、公開情報の閲覧・ログアウト・退会だけができる（docs/11の4-2） */
  status: 'active' | 'suspended';
  /** 必須プロフィールが未登録の場合は null（docs/06の4-2、docs/11の3-4） */
  profile: { nickname: string } | null;
}

/** 同意を記録する文書（docs/06の4-17の document）。 */
export type AgreementDocument = 'terms' | 'privacy' | 'message_review';

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * ログインを断る理由。登録の有無・認証の有無を第三者が見分けられないよう、1つにまとめる（docs/07の3章）。
 */
export type SignInResult =
  { status: 'signedIn' } | { status: 'rejected'; reason: 'invalidCredentials' };

export interface SignUpInput {
  email: string;
  password: string;
  /** 「20歳以上です」と申告したか。登録は20歳以上に限る（docs/11の7-1） */
  adultDeclared: boolean;
  /** 同意した文書と版。3つを別々に送る（docs/11の7-2） */
  agreements: { document: AgreementDocument; version: string }[];
}

/**
 * 登録の結果。登録済みのメールアドレスでも同じ結果を返し、登録の有無を見分けられないようにする（docs/07の3章）。
 */
export type SignUpResult =
  { status: 'confirmationSent' } | { status: 'rejected'; reason: 'invalid' | 'outdatedAgreement' };

/** メールのリンクを確かめた結果。リンクは1時間有効（docs/11のQ-49）。 */
export type EmailLinkResult =
  { status: 'verified' } | { status: 'rejected'; reason: 'expired' | 'invalid' };

/** メール認証の結果（AUTH-02）。 */
export type VerifyEmailResult = EmailLinkResult;

/**
 * メールを送る申し込みの結果（認証メールの再送・パスワード再設定）。
 * 登録の有無・認証の有無を見分けられないよう、受け付けたら同じ結果を返す（docs/07の3章）。
 * 本番で Supabase Auth が回数の制限（同じ利用者に60秒の間隔、docs/05の3-3）で断った場合も、
 * 登録済みの人だけが断られるため、同じ結果にする。間隔は画面が守る（2026-11-27の決定）。
 */
export type EmailRequestResult =
  { status: 'sent' } | { status: 'rejected'; reason: 'invalid' | 'notLoggedIn' };

/** 新しいパスワードの設定（CND-01）の結果。expired：再設定のリンクを開いた状態でない・期限が切れた。 */
export type UpdatePasswordResult =
  { status: 'updated' } | { status: 'rejected'; reason: 'invalid' | 'expired' };

/**
 * ログイン状態の窓口。将来は Supabase Auth に置き換える。
 * 通信の失敗と、認証の仕組みに接続していない場合は例外にする。
 */
export interface AuthRepository {
  /** ログインしていない場合は null を返す。 */
  getViewer(): Promise<Viewer | null>;
  /** ログイン状態が変わったときに呼ぶ。戻り値で登録を解除する。 */
  onViewerChange(listener: () => void): () => void;
  signIn(input: SignInInput): Promise<SignInResult>;
  /** 登録して、認証メールを依頼する。 */
  signUp(input: SignUpInput): Promise<SignUpResult>;
  /** 認証メールのリンクを確かめる。認証できたら、ログインした状態にする。 */
  verifyEmail(token: string): Promise<VerifyEmailResult>;
  /** 認証メールを再送する（AUTH-05）。認証待ちでないアドレスでも、同じ結果を返す。 */
  resendVerification(input: { email: string }): Promise<EmailRequestResult>;
  /** 未ログインで、パスワード再設定のメールを申し込む（CND-01）。未登録のアドレスでも、同じ結果を返す。 */
  requestPasswordReset(input: { email: string }): Promise<EmailRequestResult>;
  /**
   * ログイン中に、パスワードの変更を申し込む（Q-50）。再設定と同じメールを、ログイン中の人の
   * 登録しているアドレスへ送る。宛先は窓口がログイン状態から決め、画面から受け取らない。
   */
  requestPasswordChange(): Promise<EmailRequestResult>;
  /**
   * 再設定のメールのリンクを確かめる。確かめられたら、そのアカウントでログインした状態にする
   * （本番は Supabase Auth の再設定用のセッション）。
   */
  verifyPasswordReset(token: string): Promise<EmailLinkResult>;
  /**
   * リンクを確かめた後に、新しいパスワードを設定する。本番では、変えたらほかの端末のログインを終わらせる
   * （Supabase Auth の signOut の scope 'others'。本番に接続するときに入れる。2026-11-27の決定）。
   */
  updatePassword(input: { password: string }): Promise<UpdatePasswordResult>;
  signOut(): Promise<void>;
}
