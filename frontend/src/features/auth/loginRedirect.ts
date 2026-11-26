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
  // ログイン・新規登録・メール認証の画面には戻さない
  if (/^\/(login|signup|auth)(?=$|[/?#])/.test(value)) return '/';
  return value;
}

export function loginPath(next: string) {
  const path = safeNextPath(next);
  return path === '/'
    ? '/login'
    : `/login?${new URLSearchParams({ [NEXT_PARAM]: path }).toString()}`;
}

/**
 * 必須プロフィールの入力画面（SCR-014）。入力した後は next に戻る（docs/11のQ-40・追加-10）。
 * 入力画面自身を戻り先にはしない。
 */
export function profileEditPath(next: string) {
  const path = safeNextPath(next);
  if (path === '/' || path === '/profile/edit' || path.startsWith('/profile/edit?')) {
    return '/profile/edit';
  }
  return `/profile/edit?${new URLSearchParams({ [NEXT_PARAM]: path }).toString()}`;
}

/** ログインした後の移動先。必須プロフィールが未登録なら、先に入力画面へ移る。 */
export function afterSignInPath(hasProfile: boolean, next: string) {
  return hasProfile ? safeNextPath(next) : profileEditPath(next);
}
