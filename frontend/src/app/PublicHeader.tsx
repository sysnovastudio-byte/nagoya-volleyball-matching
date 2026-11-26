import { Link, useLocation } from 'react-router';
import { ButtonLink } from '../components/ui/Button';
import { loginPath } from '../features/auth/loginRedirect';
import { MemberNav } from './MemberNav';

type HeaderMode = 'loading' | 'guest' | 'member';

interface PublicHeaderProps {
  mode: HeaderMode;
}

/**
 * 上部の帯（docs/11の5-1）。サービス名は仮（Q-38）。
 * 未ログインはログイン・新規登録、ログイン後はPCだけ主な移動を置く。
 */
export function PublicHeader({ mode }: PublicHeaderProps) {
  const { pathname, search } = useLocation();
  // ログイン・新規登録・メール認証の画面から、さらに戻り先を重ねない
  const isAuthPage =
    pathname === '/login' || pathname.startsWith('/signup') || pathname.startsWith('/auth/');
  const here = isAuthPage ? '/' : `${pathname}${search}`;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-15 max-w-288 items-center gap-2 px-4 py-2">
        <Link
          to="/"
          className="flex min-h-11 grow items-center font-bold text-main-strong hover:underline"
        >
          サービス名（仮）
        </Link>
        {mode === 'guest' && (
          <nav aria-label="アカウント" className="flex shrink-0 items-center gap-1">
            <ButtonLink to={loginPath(here)} variant="text" size="small">
              ログイン
            </ButtonLink>
            <ButtonLink to="/signup" size="small">
              新規登録
            </ButtonLink>
          </nav>
        )}
        {mode === 'member' && (
          <div className="hidden shrink-0 lg:block">
            <MemberNav placement="top" />
          </div>
        )}
      </div>
    </header>
  );
}
