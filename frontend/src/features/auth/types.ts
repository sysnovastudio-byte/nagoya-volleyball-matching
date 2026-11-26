/** 年齢の区分（docs/06の4-1の age_category、docs/11の7-1）。 */
export type AgeCategory = 'adult' | 'minor';

/**
 * ログインしている人。画面が表示の切り替えに使う情報だけを持ち、利用者のIDは持たない。
 * 権限の判定は、取得の窓口（将来はDB）が行う。画面の判定は表示のためだけのもの。
 */
export interface Viewer {
  ageCategory: AgeCategory;
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
  ageCategory: AgeCategory;
  /** 18歳未満の場合、保護者の同意を申告したか（docs/11の7-1） */
  guardianConsent: boolean;
  /** 同意した文書と版。3つを別々に送る（docs/11の7-2） */
  agreements: { document: AgreementDocument; version: string }[];
}

/**
 * 登録の結果。登録済みのメールアドレスでも同じ結果を返し、登録の有無を見分けられないようにする（docs/07の3章）。
 */
export type SignUpResult =
  { status: 'confirmationSent' } | { status: 'rejected'; reason: 'invalid' | 'outdatedAgreement' };

/** メール認証の結果（AUTH-02）。リンクは1時間有効（docs/11のQ-49）。 */
export type VerifyEmailResult =
  { status: 'verified' } | { status: 'rejected'; reason: 'expired' | 'invalid' };

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
  signOut(): Promise<void>;
}
