import { describe, expect, it } from 'vitest';
import { afterSignInPath, loginPath, profileEditPath, safeNextPath } from './loginRedirect';

describe('ログイン後の戻り先', () => {
  it('同じサイトの中のパスは、そのまま使う', () => {
    expect(safeNextPath('/events/new')).toBe('/events/new');
    expect(safeNextPath('/events/1?tab=a')).toBe('/events/1?tab=a');
  });

  it.each([
    null,
    '',
    'https://example.com/',
    '//example.com',
    '/\\example.com',
    'javascript:alert(1)',
    '/events\n/1',
    '/login',
    '/login?next=/login',
    '/signup',
    '/signup/sent',
    '/auth/confirm?token=a',
    'http:/example.com',
    ' /events/1',
  ])('外部のサイトや、おかしな値（%s）は、ホームに戻す', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });

  it('ログイン画面のアドレスに、戻り先を付ける', () => {
    expect(loginPath('/events/new')).toBe('/login?next=%2Fevents%2Fnew');
    expect(loginPath('/')).toBe('/login');
  });
});

describe('必須プロフィールの入力画面', () => {
  it('入力した後の戻り先を付ける', () => {
    expect(profileEditPath('/events/new')).toBe('/profile/edit?next=%2Fevents%2Fnew');
    expect(profileEditPath('/')).toBe('/profile/edit');
  });

  it.each(['https://example.com/', '//example.com', '/profile/edit', '/profile/edit?next=/'])(
    '外部のサイトや入力画面自身（%s）は、戻り先にしない',
    (value) => {
      expect(profileEditPath(value)).toBe('/profile/edit');
    },
  );

  it('ログインした後、プロフィールが未登録なら入力画面へ移る', () => {
    expect(afterSignInPath(true, '/events/new')).toBe('/events/new');
    expect(afterSignInPath(false, '/events/new')).toBe('/profile/edit?next=%2Fevents%2Fnew');
    expect(afterSignInPath(true, 'https://example.com/')).toBe('/');
  });
});
