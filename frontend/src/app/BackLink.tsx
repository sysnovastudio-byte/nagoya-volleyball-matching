import { Link, useLocation } from 'react-router';
import { safeNextPath } from '../features/auth/loginRedirect';

/** 画面の移動で渡す「戻る先」。来た画面に戻れるようにする。 */
export interface BackState {
  back?: { to: string; label: string };
}

export function backState(to: string, label: string): BackState {
  return { back: { to, label } };
}

interface BackLinkProps {
  /** 戻る先が渡されなかった場合（アドレスを直接開いた場合など）。なければ出さない */
  fallback?: { to: string; label: string };
}

/** 画面の左上の「‹ ○○へ」。渡された戻る先は、同じサイトの中のパスだけを使う。 */
export function BackLink({ fallback }: BackLinkProps) {
  const state = useLocation().state as BackState | null;
  const given = state?.back;
  const back =
    given && typeof given.to === 'string' && typeof given.label === 'string'
      ? { to: safeNextPath(given.to), label: given.label }
      : fallback;
  if (!back) return null;

  return (
    <Link
      to={back.to}
      className="inline-flex min-h-11 items-center font-bold text-main-strong hover:underline"
    >
      <span aria-hidden="true" className="mr-1">
        ‹
      </span>
      {back.label}
    </Link>
  );
}
