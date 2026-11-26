import { describe, expect, it } from 'vitest';
import { loginPath, safeNextPath } from './loginRedirect';

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
  ])('外部のサイトや、おかしな値（%s）は、ホームに戻す', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });

  it('ログイン画面のアドレスに、戻り先を付ける', () => {
    expect(loginPath('/events/new')).toBe('/login?next=%2Fevents%2Fnew');
    expect(loginPath('/')).toBe('/login');
  });
});
