import type { AgeCategory, AgreementDocument } from './types';

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

export interface SignInFormValues {
  email: string;
  password: string;
}

export type SignInFieldErrors = Partial<Record<keyof SignInFormValues, string>>;

/** ログインの入力の形式。パスワードの長さは示さない（登録の条件を手がかりにさせないため）。 */
export function checkSignInForm(values: SignInFormValues): SignInFieldErrors {
  const errors: SignInFieldErrors = {};
  const email = values.email.trim();
  if (email === '') errors.email = 'メールアドレスを入力してください。';
  else if (!isEmailFormat(email)) errors.email = 'メールアドレスの形式で入力してください。';
  if (values.password === '') errors.password = 'パスワードを入力してください。';
  return errors;
}

export interface SignUpFormValues {
  email: string;
  password: string;
  ageCategory: AgeCategory | null;
  guardianConsent: boolean;
  agreements: Record<AgreementDocument, boolean>;
}

export type SignUpField =
  'email' | 'password' | 'ageCategory' | 'guardianConsent' | AgreementDocument;
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>;

/** 同意の欄は、すべて未選択から始める（docs/11の7-2）。 */
export const EMPTY_SIGN_UP_FORM: SignUpFormValues = {
  email: '',
  password: '',
  ageCategory: null,
  guardianConsent: false,
  agreements: { terms: false, privacy: false, message_review: false },
};

const AGREEMENT_ERRORS: Record<AgreementDocument, string> = {
  terms: '利用規約への同意が必要です。',
  privacy: 'プライバシーポリシーへの同意が必要です。',
  message_review: '通報時のメッセージ確認への同意が必要です。',
};

export function checkSignUpForm(values: SignUpFormValues): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  const email = values.email.trim();
  if (email === '') errors.email = 'メールアドレスを入力してください。';
  else if (!isEmailFormat(email)) errors.email = 'メールアドレスの形式で入力してください。';
  if (Array.from(values.password).length < PASSWORD_MIN_LENGTH) {
    errors.password = `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください。`;
  }
  if (values.ageCategory === null) errors.ageCategory = '年齢の区分を選んでください。';
  if (values.ageCategory === 'minor' && !values.guardianConsent) {
    errors.guardianConsent = '18歳未満の方は、保護者の同意が必要です。';
  }
  for (const document of Object.keys(AGREEMENT_ERRORS) as AgreementDocument[]) {
    if (!values.agreements[document]) errors[document] = AGREEMENT_ERRORS[document];
  }
  return errors;
}
