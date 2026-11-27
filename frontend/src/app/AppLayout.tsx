import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { isMemberViewer, useSession } from '../features/auth/sessionContext';
import { UnreadNotificationsProvider } from '../features/notifications/UnreadNotificationsProvider';
import { BackButton } from './BackButton';
import { MemberNav } from './MemberNav';
import { PublicHeader } from './PublicHeader';
import { ToastProvider } from './ToastProvider';

/**
 * 開発用の帯。import.meta.env.DEV のときだけ読み込む。
 * 本番用のビルドでは false に置き換わり、読み込みごと取り除かれる（npm run check:dist で確かめる）。
 */
const DevBar = import.meta.env.DEV ? lazy(() => import('../dev/DevBar')) : null;

export function AppLayout() {
  const { pathname } = useLocation();
  const session = useSession();
  const viewer = session.status === 'ready' ? session.viewer : null;
  // 管理者・利用停止中の人には、一般の利用者の移動を出さない（docs/11の4-1・4-2）
  const isMember = isMemberViewer(viewer);
  const mode =
    session.status === 'loading'
      ? 'loading'
      : isMember
        ? 'member'
        : viewer
          ? 'restricted'
          : 'guest';
  const suspended = viewer?.role === 'user' && viewer.status === 'suspended';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <ToastProvider>
      <UnreadNotificationsProvider>
        {/* --member-nav-h：下部の移動の高さ。画面下に固定する操作は、この高さだけ上に置き、重ねない */}
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
          {/* 本人への表示（docs/11の4-2）。案内の帯（docs/10の11-5） */}
          {suspended && (
            <p className="border-b border-danger bg-surface px-4 py-2 text-center font-bold text-danger">
              利用停止中です。公開されている募集の閲覧と、ログアウトだけができます。
            </p>
          )}
          <main
            id="main"
            tabIndex={-1}
            className="flex grow flex-col pb-(--member-nav-h) outline-none"
          >
            <BackButton />
            <Outlet />
          </main>
          {isMember && (
            <div className="fixed inset-x-0 bottom-0 z-20 h-(--member-nav-h) border-t border-line bg-surface pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
              <MemberNav placement="bottom" />
            </div>
          )}
        </div>
      </UnreadNotificationsProvider>
    </ToastProvider>
  );
}
