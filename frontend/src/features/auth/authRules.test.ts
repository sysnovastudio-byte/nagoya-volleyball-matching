import { describe, expect, it } from 'vitest';
import { agreedDocuments, CONSENTS } from './agreements';
import { checkSignInForm, checkSignUpForm, EMPTY_SIGN_UP_FORM, isEmailFormat } from './authRules';

const VALID = {
  ...EMPTY_SIGN_UP_FORM,
  email: 'test@example.com',
  password: 'abcdefghij',
  adultDeclared: true,
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
      '同意する',
      '通報されたメッセージを、運営者が確認することに同意する',
    ]);
    expect(CONSENTS.map((item) => item.accessibleLabel)).toEqual([
      '利用規約・プライバシーポリシーに同意する',
      '通報されたメッセージを、運営者が確認することに同意する',
    ]);
    expect(Object.values(EMPTY_SIGN_UP_FORM.agreements)).toEqual([false, false]);
    expect(EMPTY_SIGN_UP_FORM.adultDeclared).toBe(false);
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

  it('「20歳以上です」の申告がないと登録できない', () => {
    expect(checkSignUpForm({ ...VALID, adultDeclared: false })).toEqual({
      adultDeclared: '20歳以上の方だけが登録できます。',
    });
  });
});
