import { describe, expect, it } from 'vitest';
import { agreedDocuments, CONSENTS } from './agreements';
import { checkSignInForm, checkSignUpForm, EMPTY_SIGN_UP_FORM, isEmailFormat } from './authRules';

const VALID = {
  ...EMPTY_SIGN_UP_FORM,
  email: 'test@example.com',
  password: 'abcdefghij',
  ageCategory: 'adult' as const,
  agreements: { termsAndPrivacy: true, messageReview: true },
};

describe('メールアドレスの形式', () => {
  it.each(['test@example.com', 'a.b+c@sub.example.jp'])('%s は受け付ける', (value) => {
    expect(isEmailFormat(value)).toBe(true);
  });

  it.each([
    '',
    'test',
    'test@',
    '@example.com',
    'test@example',
    'te st@example.com',
    'a@b@c.com',
    `${'a'.repeat(250)}@example.com`,
  ])('%s は受け付けない', (value) => {
    expect(isEmailFormat(value)).toBe(false);
  });
});

describe('ログインの入力', () => {
  it('形式だけを確かめ、パスワードの長さは示さない', () => {
    expect(checkSignInForm({ email: 'test@example.com', password: 'short' })).toEqual({});
    expect(checkSignInForm({ email: 'test', password: '' })).toEqual({
      email: 'メールアドレスの形式で入力してください。',
      password: 'パスワードを入力してください。',
    });
  });
});

describe('新規登録の入力', () => {
  it('正しい入力では誤りがない', () => {
    expect(checkSignUpForm(VALID)).toEqual({});
  });

  it('パスワードは10文字以上。文字の種類は問わない', () => {
    expect(checkSignUpForm({ ...VALID, password: 'abcdefghi' }).password).toBeDefined();
    expect(checkSignUpForm({ ...VALID, password: 'ああああああああああ' })).toEqual({});
  });

  it('同意の欄は2つで、最初はすべて未選択', () => {
    expect(CONSENTS.map((item) => item.label)).toEqual([
      '利用規約とプライバシーポリシーに同意する',
      '通報時のメッセージ確認に同意する',
    ]);
    expect(Object.values(EMPTY_SIGN_UP_FORM.agreements)).toEqual([false, false]);
    expect(EMPTY_SIGN_UP_FORM.ageCategory).toBeNull();
  });

  it('同意は欄ごとに確かめる', () => {
    for (const key of ['termsAndPrivacy', 'messageReview'] as const) {
      const errors = checkSignUpForm({
        ...VALID,
        agreements: { ...VALID.agreements, [key]: false },
      });
      expect(Object.keys(errors)).toEqual([key]);
    }
  });

  it('同意は文書ごとに、版を付けて記録する', () => {
    expect(agreedDocuments({ termsAndPrivacy: true, messageReview: true })).toEqual([
      { document: 'terms', version: '仮-0' },
      { document: 'privacy', version: '仮-0' },
      { document: 'message_review', version: '仮-0' },
    ]);
    expect(agreedDocuments({ termsAndPrivacy: false, messageReview: true })).toEqual([
      { document: 'message_review', version: '仮-0' },
    ]);
  });

  it('年齢の区分は、選ばないと誤りになる', () => {
    expect(checkSignUpForm({ ...VALID, ageCategory: null }).ageCategory).toBeDefined();
  });

  it('18歳未満は、保護者の同意が必要', () => {
    expect(checkSignUpForm({ ...VALID, ageCategory: 'minor' }).guardianConsent).toBeDefined();
    expect(checkSignUpForm({ ...VALID, ageCategory: 'minor', guardianConsent: true })).toEqual({});
    // 18歳以上には求めない
    expect(checkSignUpForm({ ...VALID, guardianConsent: false })).toEqual({});
  });
});
