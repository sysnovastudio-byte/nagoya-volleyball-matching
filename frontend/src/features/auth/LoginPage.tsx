import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { AuthLayout, BotCheckSlot, DevNotice, FormError } from './AuthLayout';
import { checkSignInForm, type SignInFieldErrors, type SignInFormValues } from './authRules';
import { afterSignInPath, NEXT_PARAM, safeNextPath } from './loginRedirect';
import { AuthNotConnectedError } from './repository';
import { useAuthRepository } from './repositoryContext';
import { useSession } from './sessionContext';

/** 登録の有無・認証の有無を見分けられないよう、断られた理由をまとめて示す（docs/07の3章）。 */
const REJECTED_MESSAGE =
  'ログインできませんでした。メールアドレスとパスワードを確かめてください。登録したばかりの場合は、認証メールのリンクを開いてからログインしてください。';

/**
 * SCR-001 ログイン（AUTH-03）。ログインしたら元の画面に戻る（docs/11の追加-10）。
 * 必須プロフィールが未登録なら、先に SCR-014 へ移る（Q-40）。Bot対策（SAFE-10）は、置き場所と「未接続」の表示だけ。
 */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get(NEXT_PARAM));
  const session = useSession();

  if (session.status === 'ready' && session.viewer) {
    return <Navigate replace to={afterSignInPath(session.viewer.profile !== null, next)} />;
  }
  return <LoginForm />;
}

function LoginForm() {
  const repository = useAuthRepository();
  const [values, setValues] = useState<SignInFormValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<SignInFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const found = checkSignInForm(values);
    setErrors(found);
    const first = (['email', 'password'] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`login-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await repository.signIn({
        email: values.email.trim(),
        password: values.password,
      });
      // ログインできた場合は、ログイン状態が変わって LoginPage が移動する
      if (result.status === 'rejected') setSubmitError(REJECTED_MESSAGE);
    } catch (error) {
      setSubmitError(
        error instanceof AuthNotConnectedError
          ? '今はログインできません。認証の仕組みに接続していません。'
          : 'ログインできませんでした。通信の状態を確認して、もう一度お試しください。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="ログイン">
      {import.meta.env.DEV && (
        <DevNotice>
          <p>ダミーの利用者でログインします。入力はどこにも送らず、送信すると利用者Aになります。</p>
        </DevNotice>
      )}

      <form
        noValidate
        aria-label="ログイン"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-5"
      >
        <FormError message={submitError} />
        <FormField id="login-email" label="メールアドレス" required error={errors.email}>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onChange={(event) => {
                setValues({ ...values, email: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>
        <FormField id="login-password" label="パスワード" required error={errors.password}>
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => {
                setValues({ ...values, password: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>
        <BotCheckSlot />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'ログインしています' : 'ログイン'}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
        <p>
          はじめての方は{' '}
          <Link to="/signup" className="font-bold text-main-strong underline">
            新規登録
          </Link>
        </p>
        {/* パスワード再設定（CND-01、SCR-004） */}
        <p>
          <Link to="/password-reset" className="font-bold text-main-strong underline">
            パスワードを忘れた場合
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
