import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { PublicHeader } from './PublicHeader';

export function AppLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-bold"
      >
        本文へ移動
      </a>
      {import.meta.env.DEV && (
        <p className="bg-ink px-4 py-1 text-center text-white">開発用のダミーデータを表示中</p>
      )}
      <PublicHeader />
      <main id="main" tabIndex={-1} className="flex grow flex-col outline-none">
        <Outlet />
      </main>
    </div>
  );
}
