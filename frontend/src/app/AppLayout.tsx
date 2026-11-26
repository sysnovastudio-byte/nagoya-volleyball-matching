import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useSession } from '../features/auth/sessionContext';
import { MemberNav } from './MemberNav';
import { PublicHeader } from './PublicHeader';

/**
 * 開発用の帯。import.meta.env.DEV のときだけ読み込む。
 * 本番用のビルドでは false に置き換わり、読み込みごと取り除かれる（npm run check:dist で確かめる）。
 */
const DevBar = import.meta.env.DEV ? lazy(() => import('../dev/DevBar')) : null;

export function AppLayout() {
  const { pathname } = useLocation();
  const session = useSession();
  const isMember = session.status === 'ready' && session.viewer !== null;
  const mode = session.status === 'loading' ? 'loading' : isMember ? 'member' : 'guest';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    // --member-nav-h：下部の移動の高さ。画面下に固定する操作は、この高さだけ上に置き、重ねない
    <div
      className={`flex min-h-dvh flex-col ${
        isMember
          ? '[--member-nav-h:calc(4.5rem+env(safe-area-inset-bottom))] lg:[--member-nav-h:0px]'
          : '[--member-nav-h:0px]'
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-bold"
      >
        本文へ移動
      </a>
      {DevBar && (
        <Suspense fallback={null}>
          <DevBar />
        </Suspense>
      )}
      <PublicHeader mode={mode} />
      <main id="main" tabIndex={-1} className="flex grow flex-col pb-(--member-nav-h) outline-none">
        <Outlet />
      </main>
      {isMember && (
        <div className="fixed inset-x-0 bottom-0 z-20 h-(--member-nav-h) border-t border-line bg-surface pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <MemberNav placement="bottom" />
        </div>
      )}
    </div>
  );
}
