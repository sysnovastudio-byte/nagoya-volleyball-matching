import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Button, ButtonLink } from '../../components/ui/Button';
import { loginPath } from '../auth/loginRedirect';
import { useAuthRepository } from '../auth/repositoryContext';
import { useSession } from '../auth/sessionContext';

/** 設定の中の、ほかの画面への移動。押せる範囲は44px以上（docs/11の5-1）。 */
function SettingsLinks({ links }: { links: readonly { to: string; label: string }[] }) {
  return (
    <ul className="mb-3 flex flex-col divide-y divide-line border-y border-line">
      {links.map((link) => (
        <li key={link.to}>
          <Link
            to={link.to}
            className="flex min-h-12 items-center justify-between gap-3 py-2 font-bold text-main-strong hover:underline"
          >
            {link.label}
            <span aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * SCR-015 設定。ログアウト（docs/11の追加-07）、パスワードの変更（SCR-004、Q-50）・退会（SCR-017）・
 * 利用規約（SCR-023）・プライバシーポリシー（SCR-024）への移動と、管理者だけに管理の画面の入口（docs/11の4-1）。
 * ログアウトの後はホームへ移るため、要ログインの確認（RequireLogin）をこの画面で行う。
 * RequireLogin に任せると、ログアウトした瞬間にログイン画面へ移ってしまう。
 */
export function SettingsPage() {
  useDocumentTitle('設定');
  const repository = useAuthRepository();
  const session = useSession();
  const [status, setStatus] = useState<'idle' | 'signingOut' | 'error'>('idle');

  if (session.status === 'loading') {
    return (
      <div role="status" className="px-4 py-12 text-center text-muted">
        読み込んでいます
      </div>
    );
  }
  if (!session.viewer) {
    return <Navigate replace to={status === 'signingOut' ? '/' : loginPath('/settings')} />;
  }

  const signOut = async () => {
    if (status === 'signingOut') return;
    setStatus('signingOut');
    try {
      await repository.signOut();
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">設定</h1>
      <section
        aria-labelledby="settings-account"
        className="rounded-2xl border border-line bg-surface p-4"
      >
        <h2 id="settings-account" className="mb-3 text-lg font-bold">
          アカウント
        </h2>
        {status === 'error' && (
          <p role="alert" className="mb-3 font-bold text-danger">
            ログアウトできませんでした。もう一度お試しください。
          </p>
        )}
        {session.viewer.status === 'suspended' && (
          <p className="mb-3 text-sub">
            利用停止中です。停止や退会についてのお問い合わせは、
            <Link to="/privacy" className="font-bold text-main-strong underline">
              プライバシーポリシー
            </Link>
            に示す問い合わせ先へお願いします。
          </p>
        )}
        <SettingsLinks
          links={[
            // 利用停止中の人にも出す（アカウントの安全のための操作。2026-11-27の決定）
            { to: '/password-reset', label: 'パスワードの変更' },
            // 管理用のアカウントは退会できない（docs/06の5-8）。停止中の人には、問い合わせの案内を示す（M-06）
            ...(session.viewer.role === 'user'
              ? [{ to: '/settings/withdraw', label: '退会' }]
              : []),
          ]}
        />
        <Button
          variant="secondary"
          disabled={status === 'signingOut'}
          onClick={() => {
            void signOut();
          }}
        >
          {status === 'signingOut' ? 'ログアウトしています' : 'ログアウト'}
        </Button>
      </section>
      <section
        aria-labelledby="settings-legal"
        className="mt-4 rounded-2xl border border-line bg-surface p-4"
      >
        <h2 id="settings-legal" className="mb-3 text-lg font-bold">
          規約等
        </h2>
        <SettingsLinks
          links={[
            { to: '/terms', label: '利用規約' },
            { to: '/privacy', label: 'プライバシーポリシー' },
          ]}
        />
      </section>
      {/* 管理者でログインした場合だけ示す。画面を見せないだけで、権限は窓口が確かめる */}
      {session.viewer.role === 'admin' && (
        <section
          aria-labelledby="settings-admin"
          className="mt-4 rounded-2xl border border-line bg-surface p-4"
        >
          <h2 id="settings-admin" className="mb-3 text-lg font-bold">
            管理
          </h2>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/admin/reports">通報管理</ButtonLink>
            <ButtonLink to="/admin/users" variant="secondary">
              利用者管理
            </ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}
