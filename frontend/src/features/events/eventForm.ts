import { checkCapacity, checkEventInput, checkFee, type EventField } from './eventRules';
import type {
  CreateEventInput,
  EventArea,
  EventKind,
  Municipality,
  NagoyaWard,
  TargetLevel,
} from './types';

/** 募集作成の入力欄の値。入力の途中の値も持てるよう、すべて文字列で持つ。 */
export interface EventFormValues {
  title: string;
  /** 開催日。日本時間の「2026-12-05」の形 */
  date: string;
  /** 開始・終了の時刻。「13:00」の形で、15分刻み */
  startTime: string;
  endTime: string;
  /** 開催地の市町村。名古屋市のときだけ区も選ぶ（docs/11の2-1） */
  municipality: Municipality | '';
  ward: NagoyaWard | '';
  targetLevels: TargetLevel[];
  /** 種別。任意で、未選択は空 */
  kind: EventKind | '';
  capacity: string;
  fee: string;
  description: string;
  belongings: string;
  address: string;
  venueName: string;
  note: string;
}

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  municipality: '',
  ward: '',
  targetLevels: [],
  kind: '',
  capacity: '',
  fee: '',
  description: '',
  belongings: '',
  address: '',
  venueName: '',
  note: '',
};

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 時刻の刻み（分）。 */
export const TIME_STEP_MINUTES = 15;

/** 選べる時刻（00:00〜23:45、15分刻み）。 */
export const TIME_OPTIONS: readonly string[] = Array.from(
  { length: (24 * 60) / TIME_STEP_MINUTES },
  (_, index) => {
    const minutes = index * TIME_STEP_MINUTES;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  },
);

/** 入力された日時を、日本時間として読む。端末の時間帯の設定によらない。 */
export function parseJstDateTime(value: string): Date | null {
  if (!LOCAL_DATE_TIME.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 開催日と開始・終了の時刻から、開始・終了の日時を作る。
 * 終了の時刻が開始より前なら、翌日として扱う（docs/11の2-1）。どれかが欠けていれば null。
 */
export function scheduleFromForm(values: Pick<EventFormValues, 'date' | 'startTime' | 'endTime'>) {
  if (!LOCAL_DATE.test(values.date)) return null;
  if (!TIME_OPTIONS.includes(values.startTime) || !TIME_OPTIONS.includes(values.endTime))
    return null;
  const startsAt = parseJstDateTime(`${values.date}T${values.startTime}`);
  const sameDayEnd = parseJstDateTime(`${values.date}T${values.endTime}`);
  if (!startsAt || !sameDayEnd) return null;
  const nextDay = values.endTime < values.startTime;
  const endsAt = nextDay ? new Date(sameDayEnd.getTime() + DAY_MS) : sameDayEnd;
  return { startsAt, endsAt, nextDay };
}

/** 数字の入力を読む。全角の数字と桁区切りを受け付ける。 */
export function parseInteger(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function isEventFormDirty(values: EventFormValues) {
  return (Object.keys(EMPTY_EVENT_FORM) as (keyof EventFormValues)[]).some((key) => {
    const value = values[key];
    return Array.isArray(value) ? value.length > 0 : value.trim() !== '';
  });
}

/** 画面の入力欄。開始・終了の日時は、開催日・開始時刻・終了時刻の3つで入力する。 */
export type EventFormField =
  Exclude<EventField, 'startsAt' | 'endsAt'> | 'date' | 'startTime' | 'endTime';
export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type EventFormResult =
  { ok: true; input: CreateEventInput } | { ok: false; errors: EventFormErrors };

/** 入力欄の値を検証し、送る内容に変える。 */
export function validateEventForm(
  values: EventFormValues,
  now: Date,
  clientRequestId: string,
): EventFormResult {
  const schedule = scheduleFromForm(values);
  const capacity = parseInteger(values.capacity);
  const fee = parseInteger(values.fee);

  const input: CreateEventInput = {
    clientRequestId,
    title: values.title.trim(),
    startsAt: schedule?.startsAt.toISOString() ?? '',
    endsAt: schedule?.endsAt.toISOString() ?? '',
    // 未選択は、選択肢にない値として検証で誤りにする
    area: {
      municipality: values.municipality,
      ward: values.municipality === 'nagoya' ? values.ward : null,
    } as EventArea,
    targetLevels: values.targetLevels,
    kind: values.kind === '' ? null : values.kind,
    description: optionalText(values.description),
    belongings: optionalText(values.belongings),
    capacity: capacity ?? Number.NaN,
    fee: fee ?? Number.NaN,
    location: {
      address: values.address.trim(),
      venueName: optionalText(values.venueName),
      note: optionalText(values.note),
    },
  };

  const { startsAt: startError, endsAt: endError, ...rest } = checkEventInput(input, now);
  const errors: EventFormErrors = rest;
  if (values.date === '') errors.date = '日付を選んでください。';
  if (values.startTime === '') errors.startTime = '開始時刻を選んでください。';
  if (values.endTime === '') errors.endTime = '終了時刻を選んでください。';
  if (values.startTime !== '' && values.startTime === values.endTime) {
    errors.endTime = '終了時刻は、開始時刻と違う時刻にしてください。';
  }
  // 開始の日時の誤り（今より後・1年以内）は開始時刻の欄に、終了の誤りは終了時刻の欄に示す
  if (schedule && startError) errors.startTime = startError;
  if (schedule && endError && !errors.endTime) errors.endTime = endError;
  // 数字として読めなかった場合は、空か形の誤りかで案内を変える
  if (capacity === null) {
    errors.capacity =
      values.capacity.trim() === '' ? '入力してください。' : checkCapacity(Number.NaN);
  }
  if (fee === null) {
    errors.fee = values.fee.trim() === '' ? '入力してください。' : checkFee(Number.NaN);
  }

  return Object.keys(errors).length === 0 ? { ok: true, input } : { ok: false, errors };
}
