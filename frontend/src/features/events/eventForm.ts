import { checkCapacity, checkEventInput, checkFee, type EventFieldErrors } from './eventRules';
import type { Area, CreateEventInput, TargetLevel } from './types';

/** 募集作成の入力欄の値。入力の途中の値も持てるよう、すべて文字列で持つ。 */
export interface EventFormValues {
  title: string;
  /** 日本時間の「2026-12-05T13:00」の形（datetime-local の値） */
  startsAt: string;
  endsAt: string;
  area: Area | '';
  targetLevels: TargetLevel[];
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
  startsAt: '',
  endsAt: '',
  area: '',
  targetLevels: [],
  capacity: '',
  fee: '',
  description: '',
  belongings: '',
  address: '',
  venueName: '',
  note: '',
};

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** 入力された日時を、日本時間として読む。端末の時間帯の設定によらない。 */
export function parseJstDateTime(value: string): Date | null {
  if (!LOCAL_DATE_TIME.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

export type EventFormResult =
  { ok: true; input: CreateEventInput } | { ok: false; errors: EventFieldErrors };

/** 入力欄の値を検証し、送る内容に変える。 */
export function validateEventForm(
  values: EventFormValues,
  now: Date,
  clientRequestId: string,
): EventFormResult {
  const startsAt = parseJstDateTime(values.startsAt);
  const endsAt = parseJstDateTime(values.endsAt);
  const capacity = parseInteger(values.capacity);
  const fee = parseInteger(values.fee);

  const input: CreateEventInput = {
    clientRequestId,
    title: values.title.trim(),
    startsAt: startsAt?.toISOString() ?? '',
    endsAt: endsAt?.toISOString() ?? '',
    // 未選択は、選択肢にない値として検証で誤りにする
    area: values.area as Area,
    targetLevels: values.targetLevels,
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

  const errors = checkEventInput(input, now);
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
