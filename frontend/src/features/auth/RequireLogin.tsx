import { Navigate, Outlet, useLocation } from 'react-router';
import { loginPath } from './loginRedirect';
import { useSession } from './sessionContext';

/**
 * 要ログインの画面。未ログインなら、戻り先を付けてログイン画面へ移す。
 * 画面を見せないだけで、データの保護はDB側で行う。
 */
export function RequireLogin() {
  const session = useSession();
  const { pathname, search } = useLocation();

  if (session.status === 'loading') {
    return (
      <div role="status" className="px-4 py-12 text-center text-muted">
        読み込んでいます
      </div>
    );
  }
  if (!session.viewer) return <Navigate replace to={loginPath(`${pathname}${search}`)} />;
  return <Outlet />;
}
