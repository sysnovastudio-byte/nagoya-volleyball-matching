import { useState } from 'react';
import { Navigate } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Button, ButtonLink } from '../../components/ui/Button';
import { loginPath } from '../auth/loginRedirect';
import { useAuthRepository } from '../auth/repositoryContext';
import { useSession } from '../auth/sessionContext';

/**
 * SCR-015 設定。ログアウト（docs/11の追加-07）と、管理者だけに管理の画面の入口（docs/11の4-1）。
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
            利用停止中です。停止や退会についてのお問い合わせは、利用規約・プライバシーポリシーに示す問い合わせ先へお願いします。
          </p>
        )}
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
