import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCooldown } from '../../app/useCooldown';
import { Button, ButtonLink } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { AuthLayout, BotCheckSlot, DevEmailLinks, FormError } from './AuthLayout';
import { emailError, newPasswordError, PASSWORD_MIN_LENGTH } from './authRules';
import { AuthNotConnectedError } from './repository';
import { useAuthRepository } from './repositoryContext';
import { useSession } from './sessionContext';
import type { EmailLinkResult, EmailRequestResult } from './types';

/** 再設定のメールのリンクの有効期間（docs/11のQ-49）。 */
const LINK_VALID_HOURS = 1;
/** 同じ人への再設定のメールの間隔（docs/05の3-3）。画面でも、もう一度の申し込みを待たせる */
const REQUEST_INTERVAL_SECONDS = 60;

/** 開発用のメールのリンク。src/dev/devAuthRepository.ts の DEV_RESET_TOKENS と同じ値 */
const DEV_RESET_LINKS = [
  { token: 'dev-reset-success', label: '再設定に進むリンク' },
  { token: 'dev-reset-expired', label: '期限切れのリンク' },
  { token: 'dev-reset-invalid', label: '不正なリンク' },
].map(({ token, label }) => ({
  to: `/password-reset/confirm?${new URLSearchParams({ token }).toString()}`,
  label,
}));

function notConnectedOr(error: unknown, notConnected: string, otherwise: string) {
  return error instanceof AuthNotConnectedError ? notConnected : otherwise;
}

/**
 * SCR-004 パスワード再設定：申し込み（CND-01）。
 * 未ログインではメールアドレスを入力してもらう。ログイン中はパスワードの変更として、
 * 登録しているアドレスへ同じメールを送る（docs/11の3-4、Q-50）。宛先は窓口がログイン状態から決める。
 * 登録の有無を見分けられないよう、未登録のアドレスでも同じ文を示す（docs/07の3章）。
 */
export function PasswordResetRequestPage() {
  const session = useSession();
  const [sent, setSent] = useState<'guest' | 'signedIn' | null>(null);

  if (session.status === 'loading') {
    return (
      <AuthLayout title="パスワード再設定">
        <p role="status" className="text-muted">
          読み込んでいます
        </p>
      </AuthLayout>
    );
  }
  if (sent) {
    return (
      <RequestSent
        signedIn={sent === 'signedIn'}
        onRequestAgain={() => {
          setSent(null);
        }}
      />
    );
  }
  const signedIn = session.viewer !== null;
  return (
    <RequestForm
      signedIn={signedIn}
      onSent={() => {
        setSent(signedIn ? 'signedIn' : 'guest');
      }}
    />
  );
}

function RequestForm({ signedIn, onSent }: { signedIn: boolean; onSent: () => void }) {
  const repository = useAuthRepository();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    if (!signedIn) {
      const found = emailError(email);
      setError(found);
      if (found) {
        document.getElementById('reset-email')?.focus();
        return;
      }
    }
    setSubmitting(true);
    try {
      const result: EmailRequestResult = signedIn
        ? await repository.requestPasswordChange()
        : await repository.requestPasswordReset({ email: email.trim() });
      if (result.status === 'sent') {
        onSent();
        return;
      }
      if (result.reason === 'notLoggedIn') {
        setSubmitError('ログインの状態が変わりました。画面を読み込み直してください。');
      } else {
        setError('メールアドレスの形式で入力してください。');
      }
    } catch (caught) {
      setSubmitError(
        notConnectedOr(
          caught,
          '今は申し込めません。認証の仕組みに接続していません。',
          '申し込めませんでした。通信の状態を確認して、もう一度お試しください。',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title={signedIn ? 'パスワードの変更' : 'パスワード再設定'}>
      <p className="mb-5">
        {signedIn
          ? '登録しているメールアドレスに、パスワード再設定のメールを送ります。メールのリンクを開いて、新しいパスワードを決めてください。'
          : '登録したメールアドレスを入力してください。パスワード再設定のメールを送ります。メールのリンクを開いて、新しいパスワードを決めてください。'}
      </p>
      <form
        noValidate
        aria-label={signedIn ? 'パスワードの変更' : 'パスワード再設定'}
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-5"
      >
        <FormError message={submitError} />
        {!signedIn && (
          <FormField id="reset-email" label="メールアドレス" required error={error}>
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
        )}
        <BotCheckSlot />
        <Button type="submit" disabled={submitting}>
          {submitting ? '送っています' : '再設定のメールを送る'}
        </Button>
      </form>
      {!signedIn && (
        <p className="mt-6 border-t border-line pt-5">
          <Link to="/login" className="font-bold text-main-strong underline">
            ログインへ戻る
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}

function RequestSent({
  signedIn,
  onRequestAgain,
}: {
  signedIn: boolean;
  onRequestAgain: () => void;
}) {
  // 送った直後は、同じ人への次のメールを60秒待たせる
  const cooldown = useCooldown(REQUEST_INTERVAL_SECONDS, true);

  return (
    <AuthLayout title="再設定のメールを送りました">
      <div role="status" className="flex flex-col gap-3">
        <p>
          {signedIn
            ? '登録しているメールアドレスに、パスワード再設定のメールを送りました。'
            : '入力したメールアドレスが登録されていれば、パスワード再設定のメールが届きます。'}
          メールのリンクを開いて、新しいパスワードを決めてください。
        </p>
        <p>リンクの有効期限は、送ってから{LINK_VALID_HOURS}時間です。</p>
        <p className="text-muted">
          届かない場合は、迷惑メールのフォルダも確かめてください。もう一度申し込むときは、
          {REQUEST_INTERVAL_SECONDS}秒以上あけてください。
        </p>
      </div>
      <div className="mt-6">
        {import.meta.env.DEV && (
          <DevEmailLinks
            description={`メールは送っていません。次のリンクで、再設定の表示を確かめられます。${
              signedIn ? '' : '進むリンクを開くと、利用者Aとしてログインします。'
            }`}
            links={DEV_RESET_LINKS}
          />
        )}
      </div>
      <Button variant="secondary" disabled={cooldown.remaining > 0} onClick={onRequestAgain}>
        {cooldown.remaining > 0 ? `あと${cooldown.remaining}秒で申し込めます` : 'もう一度申し込む'}
      </Button>
    </AuthLayout>
  );
}

type ConfirmState =
  | { status: 'checking' }
  | { status: 'done'; result: EmailLinkResult }
  | { status: 'error'; notConnected: boolean };

/**
 * SCR-004 パスワード再設定：新しいパスワードの設定（CND-01）。
 * リンクを確かめると、そのアカウントでログインした状態になる（本番は Supabase Auth の再設定用のセッション）。
 */
export function PasswordResetConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const repository = useAuthRepository();
  const [state, setState] = useState<{ key: string; value: ConfirmState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // リンクは1回しか使えないため、同じリンクを2回確かめない（開発時の StrictMode の再実行を含む）
  const requested = useRef<string | null>(null);

  const key = `${attempt}:${token}`;

  useEffect(() => {
    if (token === '' || requested.current === key) return;
    requested.current = key;
    repository.verifyPasswordReset(token).then(
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
      <AuthLayout title="パスワード再設定">
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
  if (result.status === 'verified') return <NewPasswordForm />;
  return (
    <AuthLayout
      title={
        result.reason === 'expired' ? 'リンクの有効期限が切れています' : 'このリンクは使えません'
      }
    >
      <div role="alert" className="flex flex-col gap-4">
        <p>
          {result.reason === 'expired'
            ? `再設定のメールのリンクは、送ってから${LINK_VALID_HOURS}時間で使えなくなります。`
            : 'リンクが正しくないか、すでに使われています。'}
          もう一度、再設定を申し込んでください。
        </p>
        <ButtonLink to="/password-reset" variant="secondary">
          再設定を申し込む
        </ButtonLink>
      </div>
    </AuthLayout>
  );
}

function NewPasswordForm() {
  const repository = useAuthRepository();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [validated, setValidated] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'updated' | 'expired'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'saving') return;
    setSubmitError(null);
    const found = newPasswordError(password);
    setError(found);
    setValidated(true);
    if (found) {
      document.getElementById('new-password')?.focus();
      return;
    }
    setStatus('saving');
    try {
      const result = await repository.updatePassword({ password });
      if (result.status === 'updated') {
        setStatus('updated');
        return;
      }
      if (result.reason === 'expired') {
        setStatus('expired');
        return;
      }
      setError(newPasswordError(password) ?? 'パスワードを確かめてください。');
      setStatus('idle');
    } catch (caught) {
      setSubmitError(
        notConnectedOr(
          caught,
          '今は変更できません。認証の仕組みに接続していません。',
          '変更できませんでした。通信の状態を確認して、もう一度お試しください。',
        ),
      );
      setStatus('idle');
    }
  };

  if (status === 'updated') {
    return (
      <AuthLayout title="パスワードを変更しました">
        <div role="status" className="flex flex-col gap-4">
          <p>次回から、新しいパスワードでログインしてください。</p>
          <ButtonLink to="/">募集一覧へ</ButtonLink>
        </div>
      </AuthLayout>
    );
  }
  if (status === 'expired') {
    return (
      <AuthLayout title="再設定の期限が切れました">
        <div role="alert" className="flex flex-col gap-4">
          <p>パスワードは変わっていません。もう一度、再設定を申し込んでください。</p>
          <ButtonLink to="/password-reset" variant="secondary">
            再設定を申し込む
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="新しいパスワードの設定">
      <form
        noValidate
        aria-label="新しいパスワードの設定"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-5"
      >
        <FormError message={submitError} />
        <FormField
          id="new-password"
          label="新しいパスワード"
          required
          hint={`${PASSWORD_MIN_LENGTH}文字以上。文字の種類は自由です。`}
          error={error}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (validated) setError(newPasswordError(event.target.value));
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>
        <Button type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? '変更しています' : 'パスワードを変更する'}
        </Button>
      </form>
    </AuthLayout>
  );
}
