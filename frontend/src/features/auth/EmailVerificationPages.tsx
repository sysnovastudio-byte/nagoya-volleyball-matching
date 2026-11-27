import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCooldown } from '../../app/useCooldown';
import { Button, ButtonLink } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { AuthLayout, DevEmailLinks, FormError } from './AuthLayout';
import { emailError } from './authRules';
import { profileEditPath } from './loginRedirect';
import { AuthNotConnectedError } from './repository';
import { useAuthRepository } from './repositoryContext';
import type { VerifyEmailResult } from './types';

/** 認証メールのリンクの有効期間（docs/11のQ-49）。 */
const LINK_VALID_HOURS = 1;

/** 認証メールの再送の間隔（docs/11の3-4、docs/05の3-3）。 */
export const RESEND_INTERVAL_SECONDS = 60;

/** 開発用のメールのリンク。src/dev/devAuthRepository.ts の DEV_VERIFY_TOKENS と同じ値 */
const DEV_VERIFY_LINKS = [
  { token: 'dev-verify-success', label: '認証に成功するリンク' },
  { token: 'dev-verify-expired', label: '期限切れのリンク' },
  { token: 'dev-verify-invalid', label: '不正なリンク' },
].map(({ token, label }) => ({
  to: `/auth/confirm?${new URLSearchParams({ token }).toString()}`,
  label,
}));

function DevVerifyLinks() {
  return (
    <DevEmailLinks
      description="メールは送っていません。次のリンクで、認証の結果の表示を確かめられます。"
      links={DEV_VERIFY_LINKS}
    />
  );
}

/**
 * SCR-003 メール認証：認証メールの案内（AUTH-02）と再送（AUTH-05）。
 * 登録の直後に送っているため、再送は60秒たってからできる。
 */
export function VerificationSentPage() {
  return (
    <AuthLayout title="認証メールを送りました">
      <div className="flex flex-col gap-3">
        <p>
          入力したメールアドレスに、認証メールを送りました。メールのリンクを開くと、登録が完了します。
        </p>
        <p>リンクの有効期限は、送ってから{LINK_VALID_HOURS}時間です。</p>
        <p className="text-muted">届かない場合は、迷惑メールのフォルダも確かめてください。</p>
      </div>
      <div className="mt-6">{import.meta.env.DEV && <DevVerifyLinks />}</div>
      <ResendVerificationForm initiallyWaiting />
      <div className="mt-6">
        <ButtonLink to="/" variant="secondary">
          募集一覧へ
        </ButtonLink>
      </div>
    </AuthLayout>
  );
}

/**
 * SCR-003 メール認証：認証メールの再送だけの画面（AUTH-05）。ログイン画面の「認証メールが届かない場合」から開く
 * （メールを消してしまった人のため。2026-11-27の決定）。
 */
export function ResendVerificationPage() {
  return (
    <AuthLayout title="認証メールの再送">
      <p className="mb-4">
        登録の後に届く認証メールを、もう一度送ります。リンクの有効期限は、送ってから
        {LINK_VALID_HOURS}時間です。
      </p>
      <ResendVerificationForm showDevLinks standalone />
      <p className="mt-6 border-t border-line pt-5">
        <Link to="/login" className="font-bold text-main-strong underline">
          ログインへ戻る
        </Link>
      </p>
    </AuthLayout>
  );
}

/**
 * 認証メールの再送（AUTH-05）。メールアドレスは画面に残していないため、入力してもらう。
 * 認証待ちでないアドレスでも同じ文を示し、登録の有無を見分けられないようにする（docs/07の3章）。
 */
function ResendVerificationForm({
  initiallyWaiting = false,
  showDevLinks = false,
  standalone = false,
}: {
  /** 直前にメールを送った画面では、開いた時点から60秒待つ */
  initiallyWaiting?: boolean;
  /** 再送した後に、開発用のメールのリンクを示す（まだ示していない画面だけ） */
  showDevLinks?: boolean;
  /** 再送だけの画面に置く。画面の見出しがあるため、区切りの線と見出しを置かない */
  standalone?: boolean;
}) {
  const repository = useAuthRepository();
  const cooldown = useCooldown(RESEND_INTERVAL_SECONDS, initiallyWaiting);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'sending' || cooldown.remaining > 0) return;
    setSubmitError(null);
    const found = emailError(email);
    setError(found);
    if (found) {
      document.getElementById('resend-email')?.focus();
      return;
    }
    setStatus('sending');
    try {
      const result = await repository.resendVerification({ email: email.trim() });
      if (result.status === 'sent') {
        cooldown.start();
        setStatus('sent');
        return;
      }
      setError('メールアドレスの形式で入力してください。');
      setStatus('idle');
    } catch (caught) {
      setSubmitError(
        caught instanceof AuthNotConnectedError
          ? '今は再送できません。認証の仕組みに接続していません。'
          : '再送できませんでした。通信の状態を確認して、もう一度お試しください。',
      );
      setStatus('idle');
    }
  };

  return (
    <section
      aria-labelledby={standalone ? undefined : 'resend-heading'}
      className={standalone ? undefined : 'mt-6 border-t border-line pt-5'}
    >
      {!standalone && (
        <h2 id="resend-heading" className="mb-2 text-lg font-bold">
          認証メールの再送
        </h2>
      )}
      <p className="mb-4 text-muted">
        登録したメールアドレスを入力してください。再送は、{RESEND_INTERVAL_SECONDS}
        秒以上あけてできます。
      </p>
      <form
        noValidate
        aria-label="認証メールの再送"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-4"
      >
        <FormError message={submitError} />
        {status === 'sent' && (
          <p role="status" className="rounded-xl border border-line px-4 py-3">
            入力したメールアドレスが認証待ちであれば、認証メールを再送しました。リンクの有効期限は、送ってから
            {LINK_VALID_HOURS}時間です。
          </p>
        )}
        <FormField id="resend-email" label="メールアドレス" required error={error}>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(emailError(event.target.value));
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="secondary"
          disabled={status === 'sending' || cooldown.remaining > 0}
        >
          {status === 'sending'
            ? '再送しています'
            : cooldown.remaining > 0
              ? `あと${cooldown.remaining}秒で再送できます`
              : '認証メールを再送する'}
        </Button>
      </form>
      {import.meta.env.DEV && showDevLinks && status === 'sent' && (
        <div className="mt-4">
          <DevVerifyLinks />
        </div>
      )}
    </section>
  );
}

type ConfirmState =
  | { status: 'checking' }
  | { status: 'done'; result: VerifyEmailResult }
  | { status: 'error'; notConnected: boolean };

/**
 * SCR-003 メール認証：認証の結果・期限切れ・不正なリンク（AUTH-02）。期限切れでは再送できる（AUTH-05）。
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
          <p>認証メールを再送して、新しいリンクを開いてください。</p>
        </div>
        <ResendVerificationForm showDevLinks />
        <div className="mt-6">
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
