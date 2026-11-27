import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS, RequiredMark } from '../../components/ui/FormField';
import type { EventDetailLocationState } from './EventDetailPage';
import {
  EMPTY_EVENT_FORM,
  isEventFormDirty,
  scheduleFromForm,
  TIME_OPTIONS,
  validateEventForm,
  type EventFormErrors,
  type EventFormField,
  type EventFormValues,
} from './eventForm';
import {
  EVENT_LIMITS,
  isMunicipality,
  isNagoyaWard,
  MUNICIPALITIES,
  NAGOYA_WARDS,
  TARGET_LEVELS,
} from './eventRules';
import { levelLabel, municipalityLabel, wardLabel } from './format';
import { useEventRepository } from './repositoryContext';
import type { CreateEventRejection, TargetLevel } from './types';

/** 誤りがあるときに、最初に移る入力欄の順（画面の並び順）。 */
const FIELD_ORDER: EventFormField[] = [
  'title',
  'date',
  'startTime',
  'endTime',
  'municipality',
  'ward',
  'targetLevels',
  'capacity',
  'fee',
  'description',
  'belongings',
  'address',
  'venueName',
  'note',
];

const fieldId = (field: EventFormField) =>
  field === 'targetLevels' ? `event-level-${TARGET_LEVELS[0]}` : `event-${field}`;

const REJECTION_MESSAGES: Record<CreateEventRejection, string> = {
  notLoggedIn:
    'ログインの状態を確認できませんでした。ログインし直してから、もう一度お試しください。',
  profileRequired: '募集を作るには、プロフィールの登録が必要です。',
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
  // 作成の可否は取得の窓口（本番はDB）が判定する。
  // プロフィール未登録の人は、経路の RequireProfile が入力画面へ移す
  return <CreateEventForm />;
}

function CreateEventForm() {
  const repository = useEventRepository();
  const navigate = useNavigate();
  const location = useLocation();
  const [clientRequestId] = useState(createRequestId);
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<EventFormErrors>({});
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

  const updateMany = (changes: Partial<EventFormValues>) => {
    const next = { ...values, ...changes };
    setValues(next);
    // 一度送ろうとした後は、入力に合わせて誤りの表示を直す
    if (validated) {
      const result = validateEventForm(next, new Date(), clientRequestId);
      setErrors(result.ok ? {} : result.errors);
    }
  };
  const update = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) => {
    updateMany({ [field]: value });
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

  const schedule = scheduleFromForm(values);

  return (
    <div className="mx-auto w-full max-w-160 px-4 pt-4">
      <h1 className="mb-2 text-2xl font-bold">募集を作る</h1>
      <p className="mb-4 text-muted">
        <RequiredMark required /> の項目は、入力が必要です。
      </p>

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
                placeholder="例：初心者歓迎！土曜午後の練習"
                value={values.title}
                onChange={(event) => {
                  update('title', event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <ScheduleField
            values={values}
            errors={errors}
            nextDay={schedule?.nextDay ?? false}
            onChange={(field, value) => {
              update(field, value);
            }}
          />

          <FormField
            id="event-municipality"
            label="開催地（市町村）"
            required
            error={errors.municipality}
          >
            {(control) => (
              <select
                {...control}
                value={values.municipality}
                onChange={(event) => {
                  const value = event.target.value;
                  const municipality = isMunicipality(value) ? value : '';
                  // 名古屋市以外に変えたら、区の選択を外す
                  updateMany({
                    municipality,
                    ward: municipality === 'nagoya' ? values.ward : '',
                  });
                }}
                className={INPUT_CLASS}
              >
                <option value="">選んでください</option>
                {MUNICIPALITIES.map((municipality) => (
                  <option key={municipality} value={municipality}>
                    {municipalityLabel(municipality)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {values.municipality === 'nagoya' && (
            <FormField id="event-ward" label="区" required error={errors.ward}>
              {(control) => (
                <select
                  {...control}
                  value={values.ward}
                  onChange={(event) => {
                    const value = event.target.value;
                    update('ward', isNagoyaWard(value) ? value : '');
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="">選んでください</option>
                  {NAGOYA_WARDS.map((ward) => (
                    <option key={ward} value={ward}>
                      {wardLabel(ward)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}

          <TargetLevelField
            value={values.targetLevels}
            error={errors.targetLevels}
            onChange={(levels) => {
              update('targetLevels', levels);
            }}
          />

          <FormField id="event-capacity" label="募集人数" required error={errors.capacity}>
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
            hint="アプリの中では支払えません。"
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
            hint="住所や連絡先は書かないでください。"
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
            // 「公開する」を目立たせ、「やめる」は下に控えめに置く（2026-11-26）
            <div className="flex flex-col gap-1">
              <Button type="submit" disabled={submitting}>
                {submitting ? '公開しています' : '公開する'}
              </Button>
              <Button variant="text" disabled={submitting} onClick={leave}>
                やめる
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

interface FieldSectionProps {
  id: string;
  title: string;
  badge: ReactNode;
  tone: 'public' | 'private';
  children: ReactNode;
}

/** 公開する項目と、承認された人だけの項目を、見た目ではっきり分ける。 */
function FieldSection({ id, title, badge, tone, children }: FieldSectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={`rounded-2xl p-4 ${
        tone === 'private'
          ? 'border-2 border-accent bg-accent-tint'
          : 'border border-line bg-surface'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 id={`${id}-heading`} className="text-lg font-bold">
          {title}
        </h2>
        {badge}
      </div>
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
    <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-1">
      <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
        対象レベル
        <RequiredMark required />
      </legend>
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

const jstToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface ScheduleFieldProps {
  values: EventFormValues;
  errors: EventFormErrors;
  nextDay: boolean;
  onChange: (field: 'date' | 'startTime' | 'endTime', value: string) => void;
}

/**
 * 日時は「日付」「開始時刻」「終了時刻」で選ぶ。時刻は15分刻み。
 * 終了が開始より前なら翌日として扱い、「翌日」と示す。24時間以内・開始は1年以内の決まりは変えない。
 */
function ScheduleField({ values, errors, nextDay, onChange }: ScheduleFieldProps) {
  const today = jstToday.format(new Date());
  const describedBy = (field: 'date' | 'startTime' | 'endTime') =>
    errors[field] ? `event-${field}-error` : undefined;
  const fieldError = (field: 'date' | 'startTime' | 'endTime') =>
    errors[field] && (
      <p id={`event-${field}-error`} className="font-bold text-danger">
        {errors[field]}
      </p>
    );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 flex flex-wrap items-center gap-2 font-bold">
        日時
        <RequiredMark required />
      </legend>
      <label className="flex flex-col gap-1">
        <span className="text-sub">日付</span>
        <input
          id="event-date"
          type="date"
          min={today}
          value={values.date}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={describedBy('date')}
          onChange={(event) => {
            onChange('date', event.target.value);
          }}
          className={INPUT_CLASS}
        />
      </label>
      {fieldError('date')}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sub">開始時刻</span>
          <TimeSelect
            id="event-startTime"
            value={values.startTime}
            invalid={Boolean(errors.startTime)}
            describedBy={describedBy('startTime')}
            onChange={(value) => {
              onChange('startTime', value);
            }}
          />
        </label>
        <span aria-hidden="true" className="pt-9">
          〜
        </span>
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sub">
            終了時刻
            {nextDay && <Badge tone="accent">翌日</Badge>}
          </span>
          <TimeSelect
            id="event-endTime"
            value={values.endTime}
            invalid={Boolean(errors.endTime)}
            describedBy={
              [nextDay ? 'event-endTime-nextDay' : '', describedBy('endTime') ?? '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(value) => {
              onChange('endTime', value);
            }}
          />
        </label>
      </div>
      {nextDay && (
        <p id="event-endTime-nextDay" className="text-sub">
          終了時刻が開始より前のため、翌日の{values.endTime}に終わります。
        </p>
      )}
      {fieldError('startTime')}
      {fieldError('endTime')}
    </fieldset>
  );
}

interface TimeSelectProps {
  id: string;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}

function TimeSelect({ id, value, invalid, describedBy, onChange }: TimeSelectProps) {
  return (
    <select
      id={id}
      value={value}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className={INPUT_CLASS}
    >
      <option value="">選ぶ</option>
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
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
