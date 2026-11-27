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
    [
      'dev-user-a',
      { role: 'user', status: 'active', ageCategory: 'adult', profile: { nickname: 'あおい' } },
    ],
    [
      'dev-user-minor',
      { role: 'user', status: 'active', ageCategory: 'minor', profile: { nickname: 'こはる' } },
    ],
    [
      'dev-user-no-profile',
      { role: 'user', status: 'active', ageCategory: 'adult', profile: null },
    ],
    [
      'dev-user-suspended',
      { role: 'user', status: 'suspended', ageCategory: 'adult', profile: { nickname: 'かいと' } },
    ],
    ['dev-admin', { role: 'admin', status: 'active', ageCategory: 'adult', profile: null }],
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
    ageCategory: 'minor' as const,
    guardianConsent: true,
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

  it('登録すると、年齢の区分と、文書ごとの同意（仮-0）だけを記録し、メールアドレスとパスワードは残さない', async () => {
    const { db, session, repository } = setupWithDb();

    expect(await repository.signUp(SIGN_UP)).toEqual({ status: 'confirmationSent' });

    const user = db.users.at(-1);
    expect(user).toEqual({
      id: 'dev-registered-1',
      role: 'user',
      status: 'active',
      ageCategory: 'minor',
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
    ['18歳未満で保護者の同意がない', { guardianConsent: false }],
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
      ageCategory: 'minor',
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
  it('認証した後に登録し直しても、別の利用者になり、年齢の区分を取り違えない', async () => {
    const db = createDevDatabase(new Date());
    const session = createDevSession(null);
    const repository = createDevAuthRepository({ db, session });
    const input = {
      email: 'test@example.com',
      password: 'abcdefghij',
      guardianConsent: true,
      agreements: (['terms', 'privacy', 'message_review'] as const).map((document) => ({
        document,
        version: '仮-0',
      })),
    };

    await repository.signUp({ ...input, ageCategory: 'minor' });
    await repository.verifyEmail('dev-verify-success');
    await repository.signOut();
    await repository.signUp({ ...input, ageCategory: 'adult' });
    await repository.verifyEmail('dev-verify-success');

    expect(session.getUserId()).toBe('dev-registered-2');
    expect(await repository.getViewer()).toEqual({
      role: 'user',
      status: 'active',
      ageCategory: 'adult',
      profile: null,
    });
    expect(new Set(db.users.map((user) => user.id)).size).toBe(db.users.length);
  });
});
