/** ログイン後の戻り先を渡す、ログイン画面のアドレスの項目名（docs/11の追加-10）。 */
export const NEXT_PARAM = 'next';

/**
 * 戻り先として使ってよい値か。同じサイトの中のパスだけを認める。
 * 外部のサイトへ移す（オープンリダイレクト）ことを防ぐ。
 */
export function safeNextPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // 制御文字（改行・タブなど）を含むものは、ブラウザが読み替えるおそれがあるため認めない
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return '/';
  return value;
}

export function loginPath(next: string) {
  const path = safeNextPath(next);
  return path === '/'
    ? '/login'
    : `/login?${new URLSearchParams({ [NEXT_PARAM]: path }).toString()}`;
}
