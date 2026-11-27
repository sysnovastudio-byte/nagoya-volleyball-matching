import { describe, expect, it, vi } from 'vitest';
import { createDevAuthRepository } from './devAuthRepository';
import { createDevDatabase } from './devDatabase';
import { createDevSession } from './devSession';

function setup(userId: string | null) {
  const session = createDevSession(userId);
  const repository = createDevAuthRepository({ db: createDevDatabase(new Date()), session });
  return { session, repository };
}

describe('開発用のログイン状態', () => {
  it.each([
    [null, null],
    ['dev-user-a', { role: 'user', status: 'active', profile: { nickname: 'あおい' } }],
    ['dev-user-no-profile', { role: 'user', status: 'active', profile: null }],
    ['dev-user-suspended', { role: 'user', status: 'suspended', profile: { nickname: 'かいと' } }],
    ['dev-admin', { role: 'admin', status: 'active', profile: null }],
  ])('%s', async (userId, expected) => {
    expect(await setup(userId).repository.getViewer()).toEqual(expected);
  });

  it('画面に利用者のIDを渡さない', async () => {
    const viewer = await setup('dev-user-b').repository.getViewer();

    expect(JSON.stringify(viewer)).not.toContain('dev-user-b');
  });

  it('切り替えとログアウトを知らせる', async () => {
    const { session, repository } = setup('dev-user-a');
    const listener = vi.fn();
    const unsubscribe = repository.onViewerChange(listener);

    session.setUserId('dev-user-b');
    await repository.signOut();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(await repository.getViewer()).toBeNull();
    unsubscribe();
  });
});

describe('開発用のログイン・登録・認証', () => {
  const SIGN_UP = {
    email: 'test@example.com',
    password: 'abcdefghij',
    adultDeclared: true,
    agreements: (['terms', 'privacy', 'message_review'] as const).map((document) => ({
      document,
      version: '仮-0',
    })),
  };

  function setupWithDb(userId: string | null = null) {
    const db = createDevDatabase(new Date());
    const session = createDevSession(userId);
    return { db, session, repository: createDevAuthRepository({ db, session }) };
  }

  it('ログインすると、利用者Aになる', async () => {
    const { session, repository } = setupWithDb();

    expect(await repository.signIn({ email: 'x@example.com', password: 'p' })).toEqual({
      status: 'signedIn',
    });
    expect(session.getUserId()).toBe('dev-user-a');
  });

  it('登録すると、文書ごとの同意（仮-0）だけを記録し、メールアドレスとパスワードは残さない', async () => {
    const { db, session, repository } = setupWithDb();

    expect(await repository.signUp(SIGN_UP)).toEqual({ status: 'confirmationSent' });

    const user = db.users.at(-1);
    expect(user).toEqual({
      id: 'dev-registered-1',
      role: 'user',
      status: 'active',
      profile: null,
    });
    expect(db.agreements.map(({ document, version }) => [document, version])).toEqual([
      ['terms', '仮-0'],
      ['privacy', '仮-0'],
      ['message_review', '仮-0'],
    ]);
    expect(JSON.stringify(db)).not.toContain('test@example.com');
    expect(JSON.stringify(db)).not.toContain('abcdefghij');
    // 認証するまではログインしない
    expect(session.getUserId()).toBeNull();
  });

  it.each([
    ['通報時のメッセージ確認への同意がない', { agreements: SIGN_UP.agreements.slice(0, 2) }],
    ['プライバシーポリシーへの同意がない', { agreements: SIGN_UP.agreements.slice(0, 1) }],
    ['「20歳以上です」の申告がない', { adultDeclared: false }],
    ['パスワードが短い', { password: 'short' }],
  ])('%s登録は断る', async (_, override) => {
    const { db, repository } = setupWithDb();

    expect(await repository.signUp({ ...SIGN_UP, ...override })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(db.pendingVerifications).toEqual([]);
  });

  it('古い版への同意は断る', async () => {
    const { repository } = setupWithDb();
    const agreements = SIGN_UP.agreements.map((item) => ({ ...item, version: '古い版' }));

    expect(await repository.signUp({ ...SIGN_UP, agreements })).toEqual({
      status: 'rejected',
      reason: 'outdatedAgreement',
    });
  });

  it('認証に成功すると、登録したダミーの利用者でログインする。リンクは1回だけ使える', async () => {
    const { session, repository } = setupWithDb();
    await repository.signUp(SIGN_UP);

    expect(await repository.verifyEmail('dev-verify-success')).toEqual({ status: 'verified' });
    expect(session.getUserId()).toBe('dev-registered-1');
    expect(await repository.getViewer()).toEqual({
      role: 'user',
      status: 'active',
      profile: null,
    });
    expect(await repository.verifyEmail('dev-verify-success')).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
  });

  it.each([
    ['dev-verify-expired', 'expired'],
    ['dev-verify-invalid', 'invalid'],
    ['', 'invalid'],
  ])('%s は %s を返す', async (token, reason) => {
    const { repository } = setupWithDb();
    await repository.signUp(SIGN_UP);

    expect(await repository.verifyEmail(token)).toEqual({ status: 'rejected', reason });
  });
});

describe('2回目の新規登録', () => {
  it('認証した後に登録し直しても、別の利用者になる', async () => {
    const db = createDevDatabase(new Date());
    const session = createDevSession(null);
    const repository = createDevAuthRepository({ db, session });
    const input = {
      email: 'test@example.com',
      password: 'abcdefghij',
      adultDeclared: true,
      agreements: (['terms', 'privacy', 'message_review'] as const).map((document) => ({
        document,
        version: '仮-0',
      })),
    };

    await repository.signUp(input);
    await repository.verifyEmail('dev-verify-success');
    await repository.signOut();
    await repository.signUp(input);
    await repository.verifyEmail('dev-verify-success');

    expect(session.getUserId()).toBe('dev-registered-2');
    expect(await repository.getViewer()).toEqual({
      role: 'user',
      status: 'active',
      profile: null,
    });
    expect(new Set(db.users.map((user) => user.id)).size).toBe(db.users.length);
  });
});

describe('開発用の認証メールの再送とパスワード再設定', () => {
  function setupWithDb(userId: string | null = null) {
    const db = createDevDatabase(new Date());
    const session = createDevSession(userId);
    return { db, session, repository: createDevAuthRepository({ db, session }) };
  }

  it('再送は形式だけを確かめ、アドレスを残さない', async () => {
    const { db, repository } = setupWithDb();

    expect(await repository.resendVerification({ email: 'test@example.com' })).toEqual({
      status: 'sent',
    });
    expect(await repository.resendVerification({ email: 'test' })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(JSON.stringify(db)).not.toContain('test@example.com');
  });

  it('未ログインで申し込むと、リンクで利用者Aになり、新しいパスワードを設定できる', async () => {
    const { db, session, repository } = setupWithDb();

    expect(await repository.requestPasswordReset({ email: 'unknown@example.com' })).toEqual({
      status: 'sent',
    });
    expect(JSON.stringify(db)).not.toContain('unknown@example.com');
    expect(await repository.verifyPasswordReset('dev-reset-success')).toEqual({
      status: 'verified',
    });
    expect(session.getUserId()).toBe('dev-user-a');
    expect(await repository.updatePassword({ password: 'short' })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(await repository.updatePassword({ password: 'abcdefghij' })).toEqual({
      status: 'updated',
    });
    expect(JSON.stringify(db)).not.toContain('abcdefghij');
    // 1回の再設定で、1回だけ変えられる。リンクも1回だけ使える
    expect(await repository.updatePassword({ password: 'abcdefghij' })).toEqual({
      status: 'rejected',
      reason: 'expired',
    });
    expect(await repository.verifyPasswordReset('dev-reset-success')).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
  });

  it('ログイン中の変更は、ログイン中の人のリンクになる', async () => {
    const { session, repository } = setupWithDb('dev-user-b');

    expect(await repository.requestPasswordChange()).toEqual({ status: 'sent' });
    expect(await repository.verifyPasswordReset('dev-reset-success')).toEqual({
      status: 'verified',
    });
    expect(session.getUserId()).toBe('dev-user-b');
    expect(await repository.updatePassword({ password: 'abcdefghij' })).toEqual({
      status: 'updated',
    });
  });

  it('未ログインではパスワードの変更を申し込めない', async () => {
    const { repository } = setupWithDb();

    expect(await repository.requestPasswordChange()).toEqual({
      status: 'rejected',
      reason: 'notLoggedIn',
    });
  });

  it('リンクを開いていない人・切り替えた人は、パスワードを設定できない', async () => {
    const { session, repository } = setupWithDb('dev-user-b');

    expect(await repository.updatePassword({ password: 'abcdefghij' })).toEqual({
      status: 'rejected',
      reason: 'expired',
    });
    await repository.requestPasswordChange();
    await repository.verifyPasswordReset('dev-reset-success');
    session.setUserId('dev-user-a');
    expect(await repository.updatePassword({ password: 'abcdefghij' })).toEqual({
      status: 'rejected',
      reason: 'expired',
    });
  });

  it.each([
    ['dev-reset-expired', 'expired'],
    ['dev-reset-invalid', 'invalid'],
    ['dev-verify-success', 'invalid'],
  ])('再設定のリンク %s は %s を返す', async (token, reason) => {
    const { repository } = setupWithDb();
    await repository.requestPasswordReset({ email: 'test@example.com' });

    expect(await repository.verifyPasswordReset(token)).toEqual({ status: 'rejected', reason });
  });

  it('申し込みがなければ、成功するリンクも使えない', async () => {
    const { repository } = setupWithDb();

    expect(await repository.verifyPasswordReset('dev-reset-success')).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
  });
});
