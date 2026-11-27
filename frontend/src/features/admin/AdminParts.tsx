import type { ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { loginPath } from '../auth/loginRedirect';
import { useSession } from '../auth/sessionContext';
import { useAdminRepository } from './repositoryContext';
import type { AdminDenial } from './types';

/**
 * 管理の画面（SCR-021・022）の入口の確認。管理者でない人には、画面があることを示さない。
 * 多要素認証が済んでいない場合は、画面の代わりに案内を示す（docs/11の4-1）。
 * **画面を見せないだけで、権限は窓口（本番はDB関数）が毎回確かめる。**
 */
export function RequireAdmin() {
  const session = useSession();
  const repository = useAdminRepository();
  const { pathname, search } = useLocation();
  const { result, retry } = useResource('admin-access', () => repository.getAccess());

  if (session.status === 'loading') return <Loading />;
  if (!session.viewer) return <Navigate replace to={loginPath(`${pathname}${search}`)} />;
  if (session.viewer.role !== 'admin') return <NotFoundPage />;
  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <LoadError onRetry={retry} />;
  if (result.value !== 'granted') return <AdminDenied reason={result.value} />;
  return <Outlet />;
}

/** 窓口が断った場合の表示。多要素認証が切れた場合など。 */
export function AdminDenied({ reason }: { reason: AdminDenial }) {
  if (reason === 'forbidden') return <NotFoundPage />;
  return <MfaRequired />;
}

function MfaRequired() {
  useDocumentTitle('多要素認証が必要です');
  return (
    <StatusMessage title="多要素認証が必要です" headingLevel="h1">
      <p>管理の画面を開くには、認証アプリでの確認（多要素認証）が必要です。</p>
      {import.meta.env.DEV && (
        <p className="text-sub">開発中は、開発用の帯で「多要素認証」を「済」にしてください。</p>
      )}
      <ButtonLink to="/settings" variant="secondary">
        設定へ
      </ButtonLink>
    </StatusMessage>
  );
}

export function Loading() {
  return (
    <div role="status" className="px-4 py-12 text-center text-muted">
      読み込んでいます
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <StatusMessage title="読み込めませんでした" headingLevel="h1" role="alert">
      <p>通信の状態を確認して、もう一度お試しください。</p>
      <Button onClick={onRetry}>もう一度読み込む</Button>
    </StatusMessage>
  );
}

/** 管理の画面の共通の枠。通報管理と利用者管理を行き来できる（docs/10の5-10）。 */
export function AdminPage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center rounded-xl px-3 font-bold ${
      isActive ? 'bg-main-tint text-main-strong' : 'text-sub hover:bg-canvas'
    }`;
  return (
    <div className="mx-auto w-full max-w-200 px-4 py-6">
      <nav aria-label="管理" className="mb-4">
        <ul className="flex flex-wrap gap-1">
          <li>
            <NavLink to="/admin/reports" className={linkClass}>
              通報管理
            </NavLink>
          </li>
          <li>
            <NavLink to="/admin/users" className={linkClass}>
              利用者管理
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" end className={linkClass}>
              設定
            </NavLink>
          </li>
        </ul>
      </nav>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
