import type { ConsentKey } from './agreements';

/** パスワードは10文字以上。文字の種類は強制しない（docs/11のQ-49）。 */
export const PASSWORD_MIN_LENGTH = 10;
/** メールアドレスの長さの上限（一般的な上限）。 */
const EMAIL_MAX_LENGTH = 254;

/**
 * メールアドレスの形式だけを確かめる。届くかどうかは、認証メールで確かめる。
 * 空白を含まず、@ の前後に文字があり、@ の後に . を含むこと。
 */
export function isEmailFormat(value: string) {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/** メールアドレスの入力の誤り。ない場合は undefined。 */
export function emailError(value: string) {
  const email = value.trim();
  if (email === '') return 'メールアドレスを入力してください。';
  if (!isEmailFormat(email)) return 'メールアドレスの形式で入力してください。';
  return undefined;
}

/** 新しく決めるパスワード（登録・再設定）の誤り。ない場合は undefined。 */
export function newPasswordError(value: string) {
  return Array.from(value).length < PASSWORD_MIN_LENGTH
    ? `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください。`
    : undefined;
}

export interface SignInFormValues {
  email: string;
  password: string;
}

export type SignInFieldErrors = Partial<Record<keyof SignInFormValues, string>>;

/** ログインの入力の形式。パスワードの長さは示さない（登録の条件を手がかりにさせないため）。 */
export function checkSignInForm(values: SignInFormValues): SignInFieldErrors {
  const errors: SignInFieldErrors = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  if (values.password === '') errors.password = 'パスワードを入力してください。';
  return errors;
}

export interface SignUpFormValues {
  email: string;
  password: string;
  /** 「20歳以上です」の申告 */
  adultDeclared: boolean;
  agreements: Record<ConsentKey, boolean>;
}

export type SignUpField = 'email' | 'password' | 'adultDeclared' | ConsentKey;
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>;

/** 同意の欄は、すべて未選択から始める（docs/11の7-2）。 */
export const EMPTY_SIGN_UP_FORM: SignUpFormValues = {
  email: '',
  password: '',
  adultDeclared: false,
  agreements: { termsAndPrivacy: false, messageReview: false },
};

const AGREEMENT_ERRORS: Record<ConsentKey, string> = {
  termsAndPrivacy: '利用規約・プライバシーポリシーへの同意が必要です。',
  messageReview: '通報されたメッセージを運営者が確認することへの同意が必要です。',
};

export function checkSignUpForm(values: SignUpFormValues): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  const password = newPasswordError(values.password);
  if (password) errors.password = password;
  if (!values.adultDeclared) errors.adultDeclared = '20歳以上の方だけが登録できます。';
  for (const key of Object.keys(AGREEMENT_ERRORS) as ConsentKey[]) {
    if (!values.agreements[key]) errors[key] = AGREEMENT_ERRORS[key];
  }
  return errors;
}
