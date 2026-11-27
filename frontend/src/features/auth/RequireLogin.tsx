import { Navigate, Outlet, useLocation } from 'react-router';
import { loginPath } from './loginRedirect';
import { RestrictedNotice } from './RestrictedNotice';
import { isMemberViewer, useSession } from './sessionContext';

/**
 * 要ログインの画面。未ログインなら、戻り先を付けてログイン画面へ移す。
 * 管理者・利用停止中の人には、一般の利用者の画面の代わりに案内を示す（docs/11の4-1・4-2）。
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
  if (!isMemberViewer(session.viewer)) return <RestrictedNotice viewer={session.viewer} />;
  return <Outlet />;
}
