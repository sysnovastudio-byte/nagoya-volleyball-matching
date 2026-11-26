import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { FormField, INPUT_CLASS, RequiredMark } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { useViewer } from '../auth/sessionContext';
import type { EventDetailLocationState } from './EventDetailPage';
import {
  EMPTY_EVENT_FORM,
  isEventFormDirty,
  parseJstDateTime,
  validateEventForm,
  type EventFormValues,
} from './eventForm';
import {
  AREAS,
  EVENT_LIMITS,
  overlapsLateNight,
  TARGET_LEVELS,
  type EventField,
  type EventFieldErrors,
} from './eventRules';
import { areaLabel, levelLabel } from './format';
import { useEventRepository } from './repositoryContext';
import type { CreateEventRejection, TargetLevel } from './types';

/** 誤りがあるときに、最初に移る入力欄の順（画面の並び順）。 */
const FIELD_ORDER: EventField[] = [
  'title',
  'startsAt',
  'endsAt',
  'area',
  'targetLevels',
  'capacity',
  'fee',
  'description',
  'belongings',
  'address',
  'venueName',
  'note',
];

const fieldId = (field: EventField) =>
  field === 'targetLevels' ? `event-level-${TARGET_LEVELS[0]}` : `event-${field}`;

const REJECTION_MESSAGES: Record<CreateEventRejection, string> = {
  notLoggedIn:
    'ログインの状態を確認できませんでした。ログインし直してから、もう一度お試しください。',
  profileRequired: '募集を作るには、プロフィールの登録が必要です。',
  minor: '18歳未満の方は、募集を作成できません。',
  rateLimited: `募集の作成は、24時間に${EVENT_LIMITS.dailyCreateLimit}件までです。時間をおいてから、もう一度お試しください。`,
  invalid: '入力の内容を確認してください。時間がたって、開始の日時が過ぎた可能性があります。',
};

/** 二重送信の防止に使う値。安全な接続でない場合（randomUUID がない場合）も作れるようにする。 */
function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * SCR-007 募集作成（EVT-01）。サイクル1は作成だけ。
 * 編集と公開前の確認（M-02）は含めない。
 */
export function CreateEventPage() {
  useDocumentTitle('募集を作る');
  const viewer = useViewer();

  // 画面の切り替えは表示のためだけのもの。作成の可否は取得の窓口（本番はDB）が判定する。
  // プロフィール未登録の人は、経路の RequireProfile が入力画面へ移す
  if (viewer?.ageCategory === 'minor') {
    return (
      <StatusMessage title="18歳未満の方は、募集を作成できません" headingLevel="h1">
        <p>参加の申請と、主催者への質問はできます。</p>
        <ButtonLink to="/">募集一覧へ</ButtonLink>
      </StatusMessage>
    );
  }
  return <CreateEventForm />;
}

function CreateEventForm() {
  const repository = useEventRepository();
  const navigate = useNavigate();
  const location = useLocation();
  const [clientRequestId] = useState(createRequestId);
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<EventFieldErrors>({});
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 公開に成功した後の移動は、確認せずに通す
  const createdRef = useRef(false);
  // 状態の更新を待たずに、二重の送信を止める
  const submittingRef = useRef(false);
  const submitErrorRef = useRef<HTMLParagraphElement>(null);
  const dirty = isEventFormDirty(values);

  // 入力中に、画面の中のリンク・下部の移動・戻る操作・「やめる」で移るときは確認する
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !createdRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // 入力中に、再読み込み・タブを閉じるときは、ブラウザの確認を出す
  useEffect(() => {
    if (!dirty || submitting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, submitting]);

  useEffect(() => {
    if (submitError) submitErrorRef.current?.focus();
  }, [submitError]);

  const update = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) => {
    const next = { ...values, [field]: value };
    setValues(next);
    // 一度送ろうとした後は、入力に合わせて誤りの表示を直す
    if (validated) {
      const result = validateEventForm(next, new Date(), clientRequestId);
      setErrors(result.ok ? {} : result.errors);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setSubmitError(null);
    if (blocker.state === 'blocked') blocker.reset();

    const result = validateEventForm(values, new Date(), clientRequestId);
    setValidated(true);
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((field) => result.errors[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const created = await repository.createEvent(result.input);
      if (created.status === 'created') {
        const state: EventDetailLocationState = { justCreated: true };
        createdRef.current = true;
        // 戻る操作で、送信済みの入力画面に戻らないようにする
        await navigate(`/events/${created.eventId}`, { replace: true, state });
        return;
      }
      setSubmitError(REJECTION_MESSAGES[created.reason]);
    } catch {
      setSubmitError('公開できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const leave = () => {
    // この画面を直接開いた場合は、募集一覧へ移る
    if (location.key === 'default') void navigate('/');
    else void navigate(-1);
  };

  const startsAt = parseJstDateTime(values.startsAt);
  const endsAt = parseJstDateTime(values.endsAt);
  const lateNight = startsAt && endsAt ? overlapsLateNight(startsAt, endsAt) : false;

  return (
    <div className="mx-auto w-full max-w-160 px-4 pt-4">
      <h1 className="mb-2 text-2xl font-bold">募集を作る</h1>
      <p className="mb-4 text-muted">
        <RequiredMark required /> の項目は、入力が必要です。
      </p>

      <HostNotice />

      <form
        noValidate
        aria-label="募集の内容"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="mt-6 flex flex-col gap-6"
      >
        <FieldSection
          id="public-fields"
          title="全員に公開する項目"
          badge={<Badge>全員に公開</Badge>}
          description="ログインしていない人を含め、誰でも見られます。住所や連絡先を書かないでください。"
          tone="public"
        >
          <FormField
            id="event-title"
            label="タイトル"
            required
            error={errors.title}
            counter={{ value: values.title, max: EVENT_LIMITS.titleMax }}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={values.title}
                onChange={(event) => {
                  update('title', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField
            id="event-startsAt"
            label="開始の日時"
            required
            hint="日本時間で入力します。今より後で、1年以内にしてください。"
            error={errors.startsAt}
          >
            {(control) => (
              <input
                {...control}
                type="datetime-local"
                value={values.startsAt}
                onChange={(event) => {
                  update('startsAt', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField
            id="event-endsAt"
            label="終了の日時"
            required
            hint={`開始より後で、開催時間は${EVENT_LIMITS.maxDurationHours}時間以内にしてください。`}
            error={errors.endsAt}
          >
            {(control) => (
              <input
                {...control}
                type="datetime-local"
                value={values.endsAt}
                onChange={(event) => {
                  update('endsAt', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          {lateNight && (
            <p
              role="status"
              className="rounded-xl border border-accent bg-accent-tint px-4 py-3 text-ink"
            >
              <strong>深夜（午後11時〜翌午前6時）にかかります。</strong>
              18歳未満の人が申請する場合があります。18歳未満の人を深夜に参加させたり、連れ出したりしないでください。
            </p>
          )}

          <FormField
            id="event-area"
            label="開催エリア"
            required
            hint="名古屋市の16区から選びます。"
            error={errors.area}
          >
            {(control) => (
              <select
                {...control}
                value={values.area}
                onChange={(event) => {
                  const area = AREAS.find((candidate) => candidate === event.target.value);
                  update('area', area ?? '');
                }}
                className={INPUT_CLASS}
              >
                <option value="">選んでください</option>
                {AREAS.map((area) => (
                  <option key={area} value={area}>
                    {areaLabel(area)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <TargetLevelField
            value={values.targetLevels}
            error={errors.targetLevels}
            onChange={(levels) => {
              update('targetLevels', levels);
            }}
          />

          <FormField
            id="event-capacity"
            label="募集人数"
            required
            hint={`主催者を含まない人数です。${EVENT_LIMITS.capacityMin}〜${EVENT_LIMITS.capacityMax}人。`}
            error={errors.capacity}
          >
            {(control) => (
              <div className="flex items-center gap-2">
                <input
                  {...control}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values.capacity}
                  onChange={(event) => {
                    update('capacity', event.target.value);
                  }}
                  className={`${INPUT_CLASS} max-w-32`}
                />
                <span aria-hidden="true">人</span>
              </div>
            )}
          </FormField>

          <FormField
            id="event-fee"
            label="参加費"
            required
            hint={`${EVENT_LIMITS.feeMin}〜${EVENT_LIMITS.feeMax.toLocaleString('ja-JP')}円。当日の支払いが基本です。アプリの中では支払いません。支払い方法は説明に書いてください。`}
            error={errors.fee}
          >
            {(control) => (
              <div className="flex items-center gap-2">
                <input
                  {...control}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values.fee}
                  onChange={(event) => {
                    update('fee', event.target.value);
                  }}
                  className={`${INPUT_CLASS} max-w-40`}
                />
                <span aria-hidden="true">円</span>
              </div>
            )}
          </FormField>

          <FormField
            id="event-description"
            label="説明"
            hint="練習の内容や、支払い方法など。住所や連絡先は書かないでください。"
            error={errors.description}
            counter={{ value: values.description, max: EVENT_LIMITS.descriptionMax }}
          >
            {(control) => (
              <textarea
                {...control}
                rows={6}
                value={values.description}
                onChange={(event) => {
                  update('description', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField
            id="event-belongings"
            label="持ち物"
            error={errors.belongings}
            counter={{ value: values.belongings, max: EVENT_LIMITS.belongingsMax }}
          >
            {(control) => (
              <textarea
                {...control}
                rows={3}
                value={values.belongings}
                onChange={(event) => {
                  update('belongings', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>
        </FieldSection>

        <FieldSection
          id="private-fields"
          title="承認された人だけに見せる項目"
          badge={<Badge tone="accent">承認された人だけ</Badge>}
          description="主催者のあなたと、参加を承認した人だけが見られます。募集一覧や、承認する前の人には表示されません。"
          tone="private"
        >
          <FormField
            id="event-address"
            label="くわしい住所"
            required
            error={errors.address}
            counter={{ value: values.address, max: EVENT_LIMITS.addressMax }}
          >
            {(control) => (
              <textarea
                {...control}
                rows={2}
                value={values.address}
                onChange={(event) => {
                  update('address', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField
            id="event-venueName"
            label="施設名"
            error={errors.venueName}
            counter={{ value: values.venueName, max: EVENT_LIMITS.venueNameMax }}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={values.venueName}
                onChange={(event) => {
                  update('venueName', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField
            id="event-note"
            label="集合場所など"
            hint="入口や、当日の集まり方など。"
            error={errors.note}
            counter={{ value: values.note, max: EVENT_LIMITS.noteMax }}
          >
            {(control) => (
              <textarea
                {...control}
                rows={3}
                value={values.note}
                onChange={(event) => {
                  update('note', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>
        </FieldSection>

        {/* スマートフォンでは下部の移動の上に固定し、重ねない */}
        <div className="sticky bottom-(--member-nav-h) z-10 -mx-4 border-t border-line bg-surface px-4 py-3 lg:static lg:mx-0 lg:mb-8 lg:rounded-2xl lg:border">
          {submitError && (
            <p
              ref={submitErrorRef}
              role="alert"
              tabIndex={-1}
              className="mb-3 font-bold text-danger outline-none"
            >
              {submitError}
            </p>
          )}
          {blocker.state === 'blocked' ? (
            <LeaveConfirm
              onContinue={() => {
                blocker.reset();
              }}
              onLeave={() => {
                blocker.proceed();
              }}
            />
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={submitting} onClick={leave}>
                やめる
              </Button>
              <div className="flex grow flex-col">
                <Button type="submit" disabled={submitting}>
                  {submitting ? '公開しています' : '公開する'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

/** 主催者への案内（docs/10の11-3、docs/11の7-1・2-1）。 */
function HostNotice() {
  return (
    <section
      aria-labelledby="host-notice-heading"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="host-notice-heading" className="mb-1 font-bold">
        募集を作る前に
      </h2>
      <ul className="list-disc pl-5">
        <li>タイトル・説明・持ち物は、誰でも見られます。住所や連絡先を書かないでください。</li>
        <li>参加費は、当日の支払いが基本です。</li>
        <li>
          18歳未満の人も申請できます。深夜（午後11時〜翌午前6時）に18歳未満の人を参加させたり、連れ出したりしないでください。
        </li>
      </ul>
    </section>
  );
}

interface FieldSectionProps {
  id: string;
  title: string;
  badge: ReactNode;
  description: string;
  tone: 'public' | 'private';
  children: ReactNode;
}

/** 公開する項目と、承認された人だけの項目を、見た目ではっきり分ける。 */
function FieldSection({ id, title, badge, description, tone, children }: FieldSectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={`rounded-2xl p-4 ${
        tone === 'private'
          ? 'border-2 border-accent bg-accent-tint'
          : 'border border-line bg-surface'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 id={`${id}-heading`} className="text-lg font-bold">
          {title}
        </h2>
        {badge}
      </div>
      <p className={`mb-4 ${tone === 'private' ? 'text-accent-ink' : 'text-muted'}`}>
        {description}
      </p>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

interface TargetLevelFieldProps {
  value: TargetLevel[];
  error: string | undefined;
  onChange: (levels: TargetLevel[]) => void;
}

function TargetLevelField({ value, error, onChange }: TargetLevelFieldProps) {
  const errorId = 'event-targetLevels-error';

  return (
    <fieldset
      aria-describedby={error ? errorId : 'event-targetLevels-hint'}
      className="flex flex-col gap-1"
    >
      <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
        対象レベル
        <RequiredMark required />
      </legend>
      <p id="event-targetLevels-hint" className="text-muted">
        当てはまるものを、すべて選びます。
      </p>
      <div className="flex flex-wrap gap-x-4">
        {TARGET_LEVELS.map((level) => (
          <label
            key={level}
            htmlFor={`event-level-${level}`}
            className="flex min-h-11 items-center gap-2"
          >
            <input
              id={`event-level-${level}`}
              type="checkbox"
              checked={value.includes(level)}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? TARGET_LEVELS.filter(
                        (candidate) => candidate === level || value.includes(candidate),
                      )
                    : value.filter((candidate) => candidate !== level),
                );
              }}
              className="size-5 accent-main"
            />
            {levelLabel(level)}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="font-bold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface LeaveConfirmProps {
  onContinue: () => void;
  onLeave: () => void;
}

/** 入力をやめる前の確認（docs/10の11-3）。 */
function LeaveConfirm({ onContinue, onLeave }: LeaveConfirmProps) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div role="group" aria-labelledby="leave-confirm-text" className="flex flex-col gap-2">
      <p id="leave-confirm-text" className="font-bold">
        入力した内容は保存されません。入力をやめますか？
      </p>
      <div className="flex flex-wrap gap-2">
        <Button ref={continueRef} variant="secondary" onClick={onContinue}>
          入力を続ける
        </Button>
        <Button variant="danger" onClick={onLeave}>
          入力をやめる
        </Button>
      </div>
    </div>
  );
}
