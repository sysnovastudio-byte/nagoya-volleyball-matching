import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS, RequiredMark } from '../../components/ui/FormField';
import { AGREEMENT_VERSION, agreedDocuments, CONSENTS, type ConsentKey } from './agreements';
import { AuthLayout, DevNotice, FormError } from './AuthLayout';
import {
  checkSignUpForm,
  EMPTY_SIGN_UP_FORM,
  PASSWORD_MIN_LENGTH,
  type SignUpField,
  type SignUpFieldErrors,
  type SignUpFormValues,
} from './authRules';
import { AuthNotConnectedError } from './repository';
import { useAuthRepository } from './repositoryContext';
import { useSession } from './sessionContext';
import type { AgeCategory } from './types';

/** 誤りがあるときに、最初にフォーカスを移す順。 */
const FIELD_ORDER: SignUpField[] = [
  'email',
  'password',
  'ageCategory',
  'guardianConsent',
  'termsAndPrivacy',
  'messageReview',
];

function fieldId(field: SignUpField) {
  return `signup-${field}`;
}

const AGE_OPTIONS: { value: AgeCategory; label: string }[] = [
  { value: 'adult', label: '18歳以上' },
  { value: 'minor', label: '18歳未満（保護者の同意あり）' },
];

/**
 * SCR-002 新規登録（AUTH-01・CND-09）。送信すると SCR-003 へ移る。
 * Bot対策（SAFE-10）は作らない。規約等は仮の文章で、版は「仮-0」。
 */
export function SignUpPage() {
  const session = useSession();
  if (session.status === 'ready' && session.viewer) return <Navigate replace to="/" />;
  return <SignUpForm />;
}

function SignUpForm() {
  const repository = useAuthRepository();
  const navigate = useNavigate();
  const [values, setValues] = useState<SignUpFormValues>(EMPTY_SIGN_UP_FORM);
  const [errors, setErrors] = useState<SignUpFieldErrors>({});
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (next: SignUpFormValues) => {
    setValues(next);
    // 一度送ろうとした後は、入力に合わせて誤りの表示を直す
    if (validated) setErrors(checkSignUpForm(next));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const found = checkSignUpForm(values);
    setErrors(found);
    setValidated(true);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    // 上の検証で選ばれていることを確かめている。型を絞るための確認
    if (values.ageCategory === null) return;

    setSubmitting(true);
    try {
      const result = await repository.signUp({
        email: values.email.trim(),
        password: values.password,
        ageCategory: values.ageCategory,
        guardianConsent: values.ageCategory === 'minor' && values.guardianConsent,
        agreements: agreedDocuments(values.agreements),
      });
      if (result.status === 'confirmationSent') {
        // 戻る操作で、送信済みの入力画面に戻らないようにする
        await navigate('/signup/sent', { replace: true });
        return;
      }
      setSubmitError(
        result.reason === 'outdatedAgreement'
          ? '規約等が新しくなりました。画面を読み込み直して、内容を確かめてください。'
          : '入力の内容を確かめてください。',
      );
    } catch (error) {
      setSubmitError(
        error instanceof AuthNotConnectedError
          ? '今は登録できません。認証の仕組みに接続していません。'
          : '登録できませんでした。通信の状態を確認して、もう一度お試しください。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setAgreement = (key: ConsentKey, checked: boolean) => {
    update({ ...values, agreements: { ...values.agreements, [key]: checked } });
  };

  return (
    <AuthLayout title="新規登録">
      {import.meta.env.DEV && (
        <DevNotice>
          <p>入力はどこにも送らず、メールも送りません。送信すると、メール認証の画面へ移ります。</p>
        </DevNotice>
      )}
      <p className="mb-4 text-muted">
        <RequiredMark required /> の項目は、入力が必要です。
      </p>

      <form
        noValidate
        aria-label="新規登録"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-6"
      >
        <FormError message={submitError} />
        <FormField
          id={fieldId('email')}
          label="メールアドレス"
          required
          hint="認証メールを送ります。ほかの利用者には公開しません。"
          error={errors.email}
        >
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onChange={(event) => {
                update({ ...values, email: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>

        <FormField
          id={fieldId('password')}
          label="パスワード"
          required
          hint={`${PASSWORD_MIN_LENGTH}文字以上。文字の種類は自由です。`}
          error={errors.password}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => {
                update({ ...values, password: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>

        <fieldset
          aria-describedby={errors.ageCategory ? `${fieldId('ageCategory')}-error` : undefined}
          className="flex flex-col gap-1"
        >
          <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
            年齢の区分
            <RequiredMark required />
          </legend>
          {AGE_OPTIONS.map((option, index) => (
            <label key={option.value} className="flex min-h-11 items-center gap-2">
              <input
                // 誤りのときにフォーカスを移す先は、最初の選択肢
                id={index === 0 ? fieldId('ageCategory') : undefined}
                type="radio"
                name="ageCategory"
                value={option.value}
                checked={values.ageCategory === option.value}
                aria-invalid={errors.ageCategory ? true : undefined}
                onChange={() => {
                  update({ ...values, ageCategory: option.value });
                }}
                className="size-5"
              />
              {option.label}
            </label>
          ))}
          <FieldError id={`${fieldId('ageCategory')}-error`} message={errors.ageCategory} />
        </fieldset>

        {values.ageCategory === 'minor' && (
          <div className="rounded-xl border border-accent bg-accent-tint p-4">
            <p className="mb-2">
              18歳未満の方は、保護者の方に利用規約とプライバシーポリシーを確かめてもらい、同意を得てから登録してください。
            </p>
            <CheckboxField
              id={fieldId('guardianConsent')}
              checked={values.guardianConsent}
              error={errors.guardianConsent}
              onChange={(checked) => {
                update({ ...values, guardianConsent: checked });
              }}
            >
              保護者が規約等を確かめ、利用に同意しています
            </CheckboxField>
          </div>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
            規約等への同意
            <RequiredMark required />
          </legend>
          <p className="text-muted">
            2つの欄に、それぞれ同意が必要です。内容は開発中の仮の文章です（版：{AGREEMENT_VERSION}
            ）。
          </p>
          {CONSENTS.map((consent) => (
            <div key={consent.key} className="rounded-xl border border-line p-3">
              {consent.documents.map((document) => (
                <details key={document.document} className="mb-1">
                  <summary className="flex min-h-11 cursor-pointer items-center font-bold text-main-strong">
                    {document.title}（仮の文章）を読む
                  </summary>
                  <p className="pb-2 text-sub">{document.body}</p>
                </details>
              ))}
              <CheckboxField
                id={fieldId(consent.key)}
                checked={values.agreements[consent.key]}
                error={errors[consent.key]}
                onChange={(checked) => {
                  setAgreement(consent.key, checked);
                }}
              >
                {consent.label}
              </CheckboxField>
            </div>
          ))}
        </fieldset>

        <Button type="submit" disabled={submitting}>
          {submitting ? '登録しています' : '登録する'}
        </Button>
      </form>

      <p className="mt-6 border-t border-line pt-5">
        登録済みの方は{' '}
        <Link to="/login" className="font-bold text-main-strong underline">
          ログイン
        </Link>
      </p>
    </AuthLayout>
  );
}

interface CheckboxFieldProps {
  id: string;
  checked: boolean;
  error: string | undefined;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

function CheckboxField({ id, checked, error, onChange, children }: CheckboxFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 font-bold">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          className="size-5 shrink-0"
        />
        {children}
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="font-bold text-danger">
      {message}
    </p>
  );
}
