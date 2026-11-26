import { describe, expect, it } from 'vitest';
import { AGREEMENTS } from './agreements';
import { checkSignInForm, checkSignUpForm, EMPTY_SIGN_UP_FORM, isEmailFormat } from './authRules';

const VALID = {
  ...EMPTY_SIGN_UP_FORM,
  email: 'test@example.com',
  password: 'abcdefghij',
  ageCategory: 'adult' as const,
  agreements: { terms: true, privacy: true, message_review: true },
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

  it('同意の欄は3つで、最初はすべて未選択', () => {
    expect(AGREEMENTS.map((item) => item.document)).toEqual(['terms', 'privacy', 'message_review']);
    expect(Object.values(EMPTY_SIGN_UP_FORM.agreements)).toEqual([false, false, false]);
    expect(EMPTY_SIGN_UP_FORM.ageCategory).toBeNull();
  });

  it('同意は1つずつ確かめる', () => {
    for (const document of ['terms', 'privacy', 'message_review'] as const) {
      const errors = checkSignUpForm({
        ...VALID,
        agreements: { ...VALID.agreements, [document]: false },
      });
      expect(Object.keys(errors)).toEqual([document]);
    }
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
