import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS, RequiredMark } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { NEXT_PARAM, safeNextPath } from '../auth/loginRedirect';
import type { AgeCategory } from '../auth/types';
import { useViewer } from '../auth/sessionContext';
import { levelLabel } from '../events/format';
import {
  ageGroupLabel,
  EMPTY_PROFILE_FORM,
  EXPERIENCE_LEVELS,
  PROFILE_LIMITS,
  selectableAgeGroups,
  validateProfileForm,
  type ProfileField,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from './profileRules';
import { useProfileRepository } from './repositoryContext';
import type { AgeGroup, MyProfile } from './types';

/** 保存した後に、プロフィールの画面へ渡す印。 */
export interface ProfileLocationState {
  profileSaved?: boolean;
}

const FIELD_ORDER: ProfileField[] = ['nickname', 'experienceLevel', 'ageGroup', 'bio'];

function fieldId(field: ProfileField) {
  return `profile-${field}`;
}

/**
 * SCR-014 プロフィール登録・編集（PROF-01）。ニックネーム・経験レベル・年代・自己紹介。
 * M-01 のうち年代だけを加える。画像・性別・活動地域は作らない。
 * 18歳未満の人は、ここで年齢の区分を「18歳以上」に変えられる（docs/11の7-1。戻せない）。
 * 保存した後は、戻り先（next）があればそこへ、なければ登録はホーム、編集はプロフィールへ戻る（追加-10）。
 */
export function ProfileEditPage() {
  const repository = useProfileRepository();
  const viewer = useViewer();
  const [searchParams] = useSearchParams();
  const next = searchParams.get(NEXT_PARAM);
  const { result, retry } = useResource('my-profile-edit', () => repository.getMyProfile());
  // 保存の後、ログイン状態の表示が新しくなってから移る。古いままだと、戻り先でまた入力画面へ移されるため
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [lastReady, setLastReady] = useState<MyProfile | null | undefined>(undefined);

  if (savedTo) {
    if (!viewer?.profile) return <Saving />;
    const state: ProfileLocationState = { profileSaved: true };
    return <Navigate replace to={savedTo} state={state} />;
  }
  // ログイン状態の表示が変わると読み込み直す。年齢の区分を変えたときに入力中の内容を消さないよう、
  // 読み込み直している間も、前に読み込んだ内容でフォームを出し続ける
  if (result.status === 'ready' && result.value !== lastReady) setLastReady(result.value);
  const current = result.status === 'ready' ? result.value : lastReady;

  if (current === undefined) {
    if (result.status === 'error') return <LoadError onRetry={retry} />;
    return <Saving loading />;
  }
  if (!viewer) return <Saving loading />;

  const isFirstTime = current === null;
  const destination = next !== null ? safeNextPath(next) : isFirstTime ? '/' : '/profile';

  return (
    <ProfileForm
      // 別の人のプロフィールに変わった場合は、入力を初めからにする
      key={current?.userId ?? 'new'}
      initial={current}
      ageCategory={viewer.ageCategory}
      isFirstTime={isFirstTime}
      laterPath={destination}
      onSaved={() => {
        setSavedTo(destination);
      }}
    />
  );
}

function Saving({ loading = false }: { loading?: boolean }) {
  useDocumentTitle('プロフィール');
  return (
    <div role="status" className="px-4 py-12 text-center text-muted">
      {loading ? 'プロフィールを読み込んでいます' : '保存しました。移動しています'}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  useDocumentTitle('プロフィール');
  return (
    <StatusMessage title="プロフィールを読み込めませんでした" headingLevel="h1" role="alert">
      <p>通信の状態を確認して、もう一度お試しください。</p>
      <Button onClick={onRetry}>もう一度読み込む</Button>
    </StatusMessage>
  );
}

function toFormValues(profile: MyProfile | null): ProfileFormValues {
  if (!profile) return EMPTY_PROFILE_FORM;
  return {
    nickname: profile.nickname,
    experienceLevel: profile.experienceLevel,
    bio: profile.bio ?? '',
    ageGroup: profile.ageGroup,
  };
}

interface ProfileFormProps {
  initial: MyProfile | null;
  ageCategory: AgeCategory;
  isFirstTime: boolean;
  /** 「あとで入力する」「やめる」で戻る先 */
  laterPath: string;
  onSaved: () => void;
}

function ProfileForm({ initial, ageCategory, isFirstTime, laterPath, onSaved }: ProfileFormProps) {
  const title = isFirstTime ? 'プロフィールを登録' : 'プロフィールを編集';
  useDocumentTitle(title);
  const repository = useProfileRepository();
  const [values, setValues] = useState<ProfileFormValues>(() => toFormValues(initial));
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const update = (next: ProfileFormValues) => {
    setValues(next);
    if (validated) {
      const checked = validateProfileForm(next, ageCategory);
      setErrors(checked.ok ? {} : checked.errors);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const checked = validateProfileForm(values, ageCategory);
    setValidated(true);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = FIELD_ORDER.find((field) => checked.errors[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const result = await repository.saveProfile(checked.input);
      if (result.status === 'saved') {
        onSaved();
        return;
      }
      setSubmitError(
        result.reason === 'notLoggedIn'
          ? 'ログインの状態が変わりました。ログインし直してください。'
          : '入力の内容を確かめてください。',
      );
    } catch {
      setSubmitError('保存できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      {isFirstTime && (
        <p className="mb-2">
          募集への申請や募集の作成には、ニックネームと経験レベルの登録が必要です。
        </p>
      )}
      <p className="mb-4 text-muted">
        <RequiredMark required /> の項目は、入力が必要です。
      </p>

      {/* 公開範囲を項目ごとに示す（docs/11の5-1） */}
      <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-3">
        <p>
          年代のほかの項目は、<strong>ログインしている利用者</strong>
          に公開されます。年代は、本人と、申請した募集の主催者（終了日時まで）だけが見られます。
        </p>
        <p className="text-muted">メールアドレスは、ほかの利用者に公開されません。</p>
      </div>

      <form
        noValidate
        aria-label={title}
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-6"
      >
        {submitError && (
          <p
            role="alert"
            className="rounded-xl border border-danger px-4 py-3 font-bold text-danger"
          >
            {submitError}
          </p>
        )}

        <FormField
          id={fieldId('nickname')}
          label="ニックネーム"
          required
          hint={<ScopeHint text="ほかの人と同じニックネームでも登録できます。" />}
          error={errors.nickname}
          counter={{ value: values.nickname.trim(), max: PROFILE_LIMITS.nicknameMax }}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              autoComplete="nickname"
              value={values.nickname}
              onChange={(event) => {
                update({ ...values, nickname: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>

        <fieldset
          aria-describedby={[
            'profile-experienceLevel-hint',
            errors.experienceLevel ? 'profile-experienceLevel-error' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          className="flex flex-col gap-1"
        >
          <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
            経験レベル
            <RequiredMark required />
          </legend>
          <p id="profile-experienceLevel-hint" className="text-muted">
            <ScopeHint />
          </p>
          <div className="flex flex-wrap gap-x-4">
            {EXPERIENCE_LEVELS.map((level, index) => (
              <label key={level} className="flex min-h-11 items-center gap-2">
                <input
                  id={index === 0 ? fieldId('experienceLevel') : undefined}
                  type="radio"
                  name="experienceLevel"
                  value={level}
                  checked={values.experienceLevel === level}
                  aria-invalid={errors.experienceLevel ? true : undefined}
                  onChange={() => {
                    update({ ...values, experienceLevel: level });
                  }}
                  className="size-5"
                />
                {levelLabel(level)}
              </label>
            ))}
          </div>
          {errors.experienceLevel && (
            <p id="profile-experienceLevel-error" className="font-bold text-danger">
              {errors.experienceLevel}
            </p>
          )}
        </fieldset>

        <FormField
          id={fieldId('ageGroup')}
          label="年代"
          hint={
            <span className="flex flex-wrap items-center gap-x-2">
              <Badge>本人と申請先の主催者だけ</Badge>
              {ageCategory === 'minor' && <span>18歳未満の場合は「10代」だけを選べます。</span>}
            </span>
          }
          error={errors.ageGroup}
        >
          {(control) => (
            <select
              {...control}
              value={values.ageGroup ?? ''}
              onChange={(event) => {
                update({
                  ...values,
                  ageGroup: event.target.value === '' ? null : (event.target.value as AgeGroup),
                });
              }}
              className={INPUT_CLASS}
            >
              <option value="">選ばない</option>
              {selectableAgeGroups(ageCategory).map((group) => (
                <option key={group} value={group}>
                  {ageGroupLabel(group)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          id={fieldId('bio')}
          label="自己紹介"
          hint={<ScopeHint text="連絡先や住所は書かないでください。" />}
          error={errors.bio}
          counter={{ value: values.bio.trim(), max: PROFILE_LIMITS.bioMax }}
        >
          {(control) => (
            <textarea
              {...control}
              rows={5}
              value={values.bio}
              onChange={(event) => {
                update({ ...values, bio: event.target.value });
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? '保存しています' : '保存する'}
          </Button>
          <Link
            to={laterPath}
            className="inline-flex min-h-11 items-center justify-center font-bold text-main-strong hover:underline"
          >
            {isFirstTime ? 'あとで入力する' : 'やめる'}
          </Link>
        </div>
      </form>

      {changed && (
        <p
          role="status"
          className="mt-8 rounded-xl border border-main bg-main-tint px-4 py-3 font-bold text-main-strong"
        >
          年齢の区分を「18歳以上」に変えました。
        </p>
      )}
      {ageCategory === 'minor' && (
        <ChangeToAdult
          onChanged={() => {
            setChanged(true);
          }}
        />
      )}
    </div>
  );
}

/** 18歳になった人が、年齢の区分を「18歳以上」に変える（docs/11の7-1）。戻せないため、確認を挟む。 */
function ChangeToAdult({ onChanged }: { onChanged: () => void }) {
  const repository = useProfileRepository();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.changeAgeCategoryToAdult();
      // 変えると、ログイン状態の表示が変わり、この欄は消える
      if (result.status === 'changed' || result.reason === 'alreadyAdult') onChanged();
      else {
        setError('ログインの状態が変わりました。ログインし直してください。');
      }
    } catch {
      setError('変更できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="change-to-adult-heading"
      className="mt-8 rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="change-to-adult-heading" className="mb-1 font-bold">
        年齢の区分
      </h2>
      <p className="mb-3">
        今は「18歳未満」です。18歳になったら、「18歳以上」に変えられます。年齢の区分は、ほかの利用者に公開されません。
      </p>
      {error && (
        <p role="alert" className="mb-3 font-bold text-danger">
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label="年齢の区分の変更の確認"
          className="rounded-xl border border-danger p-3"
        >
          <p className="mb-2 font-bold">
            「18歳以上」に変えると、「18歳未満」に戻すことはできません。変えますか？
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              disabled={busy}
              onClick={() => {
                void change();
              }}
            >
              {busy ? '変えています' : '18歳以上に変える'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            setConfirming(true);
          }}
        >
          「18歳以上」に変更する
        </Button>
      )}
    </section>
  );
}

/** 項目ごとの公開範囲。 */
function ScopeHint({ text }: { text?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <Badge>ログインした人に公開</Badge>
      {text && <span>{text}</span>}
    </span>
  );
}
