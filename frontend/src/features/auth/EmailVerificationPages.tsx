import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { AuthLayout, DevNotice } from './AuthLayout';
import { profileEditPath } from './loginRedirect';
import { AuthNotConnectedError } from './repository';
import { useAuthRepository } from './repositoryContext';
import type { VerifyEmailResult } from './types';

/** 認証メールのリンクの有効期間（docs/11のQ-49）。 */
const LINK_VALID_HOURS = 1;

/**
 * SCR-003 メール認証：認証メールの案内（AUTH-02）。
 * 認証メールの再送（AUTH-05）は、サイクル1では作らない。
 */
export function VerificationSentPage() {
  return (
    <AuthLayout title="認証メールを送りました">
      <div className="flex flex-col gap-3">
        <p>
          入力したメールアドレスに、認証メールを送りました。メールのリンクを開くと、登録が完了します。
        </p>
        <p>リンクの有効期限は、送ってから{LINK_VALID_HOURS}時間です。</p>
        <p className="text-muted">
          届かない場合は、迷惑メールのフォルダも確かめてください。認証メールの再送は、準備中です。
        </p>
      </div>
      <div className="mt-6">
        {import.meta.env.DEV && (
          <DevNotice>
            <p className="mb-2">
              メールは送っていません。次のリンクで、認証の結果の表示を確かめられます。
            </p>
            <ul className="flex flex-col">
              {[
                // src/dev/devAuthRepository.ts の DEV_VERIFY_TOKENS と同じ値
                { token: 'dev-verify-success', label: '認証に成功するリンク' },
                { token: 'dev-verify-expired', label: '期限切れのリンク' },
                { token: 'dev-verify-invalid', label: '不正なリンク' },
              ].map((link) => (
                <li key={link.token}>
                  <Link
                    to={`/auth/confirm?${new URLSearchParams({ token: link.token }).toString()}`}
                    className="inline-flex min-h-11 items-center font-bold underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </DevNotice>
        )}
      </div>
      <ButtonLink to="/" variant="secondary">
        募集一覧へ
      </ButtonLink>
    </AuthLayout>
  );
}

type ConfirmState =
  | { status: 'checking' }
  | { status: 'done'; result: VerifyEmailResult }
  | { status: 'error'; notConnected: boolean };

/**
 * SCR-003 メール認証：認証の結果・期限切れ・不正なリンク（AUTH-02）。
 * 認証できたらログインした状態になり、必須プロフィールの入力へ進む（docs/11のQ-40）。
 */
export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const repository = useAuthRepository();
  const [state, setState] = useState<{ key: string; value: ConfirmState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // リンクは1回しか使えないため、同じリンクを2回確かめない（開発時の StrictMode の再実行を含む）
  const requested = useRef<string | null>(null);

  const key = `${attempt}:${token}`;

  useEffect(() => {
    // リンクに値がない場合は、確かめずに不正なリンクとして示す
    if (token === '' || requested.current === key) return;
    requested.current = key;
    repository.verifyEmail(token).then(
      (result) => {
        setState({ key, value: { status: 'done', result } });
      },
      (error: unknown) => {
        setState({
          key,
          value: { status: 'error', notConnected: error instanceof AuthNotConnectedError },
        });
      },
    );
  }, [repository, token, key]);

  const current: ConfirmState =
    token === ''
      ? { status: 'done', result: { status: 'rejected', reason: 'invalid' } }
      : state?.key === key
        ? state.value
        : { status: 'checking' };

  if (current.status === 'checking') {
    return (
      <AuthLayout title="メールアドレスの確認">
        <p role="status" className="text-muted">
          確認しています
        </p>
      </AuthLayout>
    );
  }
  if (current.status === 'error') {
    return (
      <AuthLayout title="確認できませんでした">
        <div role="alert" className="flex flex-col gap-4">
          <p>
            {current.notConnected
              ? '今は確認できません。認証の仕組みに接続していません。'
              : '通信の状態を確認して、もう一度お試しください。'}
          </p>
          {!current.notConnected && (
            <Button
              onClick={() => {
                setAttempt((value) => value + 1);
              }}
            >
              もう一度確かめる
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  const { result } = current;
  if (result.status === 'verified') {
    return (
      <AuthLayout title="メールアドレスを確認しました">
        <div role="status" className="flex flex-col gap-4">
          <p>登録が完了しました。続けて、ニックネームと経験レベルを登録してください。</p>
          <ButtonLink to={profileEditPath('/')}>プロフィールを入力する</ButtonLink>
        </div>
      </AuthLayout>
    );
  }
  if (result.reason === 'expired') {
    return (
      <AuthLayout title="リンクの有効期限が切れています">
        <div role="alert" className="flex flex-col gap-4">
          <p>認証メールのリンクは、送ってから{LINK_VALID_HOURS}時間で使えなくなります。</p>
          <p className="text-muted">認証メールの再送は、準備中です。</p>
          <ButtonLink to="/" variant="secondary">
            募集一覧へ
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="このリンクは使えません">
      <div role="alert" className="flex flex-col gap-4">
        <p>
          リンクが正しくないか、すでに使われています。メールのリンクを、そのまま開いてください。
        </p>
        <ButtonLink to="/login" variant="secondary">
          ログインへ
        </ButtonLink>
      </div>
    </AuthLayout>
  );
}
