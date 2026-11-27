import { textLength } from '../../lib/text';
import type { CreateEventInput, Municipality, NagoyaWard, TargetLevel } from './types';

/** 募集の入力の上限（docs/11の2-1・3-3・4-5）。数値はここだけで管理する。 */
export const EVENT_LIMITS = {
  titleMax: 50,
  descriptionMax: 1000,
  belongingsMax: 200,
  venueNameMax: 50,
  addressMax: 200,
  noteMax: 300,
  capacityMin: 1,
  capacityMax: 100,
  feeMin: 0,
  feeMax: 50000,
  maxDurationHours: 24,
  /** 直近24時間に作成できる件数（DB-05） */
  dailyCreateLimit: 5,
} as const;

/**
 * 愛知県の市町村（docs/11の2-1）。選択肢の並び順でもある（全国地方公共団体コードの順）。
 * 一覧にない場所は選べないため、県外の募集は作成できない。
 */
export const MUNICIPALITIES: readonly Municipality[] = [
  'nagoya',
  'toyohashi',
  'okazaki',
  'ichinomiya',
  'seto',
  'handa',
  'kasugai',
  'toyokawa',
  'tsushima',
  'hekinan',
  'kariya',
  'toyota',
  'anjo',
  'nishio',
  'gamagori',
  'inuyama',
  'tokoname',
  'konan',
  'komaki',
  'inazawa',
  'shinshiro',
  'tokai',
  'obu',
  'chita',
  'chiryu',
  'owariasahi',
  'takahama',
  'iwakura',
  'toyoake',
  'nisshin',
  'tahara',
  'aisai',
  'kiyosu',
  'kitanagoya',
  'yatomi',
  'miyoshi',
  'ama',
  'nagakute',
  'togo',
  'toyoyama',
  'oguchi',
  'fuso',
  'oharu',
  'kanie',
  'tobishima',
  'agui',
  'higashiura',
  'minamichita',
  'mihama',
  'taketoyo',
  'kota',
  'shitara',
  'toei',
  'toyone',
];

/** 名古屋市の16区（docs/11の2-1）。選択肢の並び順でもある。 */
export const NAGOYA_WARDS: readonly NagoyaWard[] = [
  'chikusa',
  'higashi',
  'kita',
  'nishi',
  'nakamura',
  'naka',
  'showa',
  'mizuho',
  'atsuta',
  'nakagawa',
  'minato',
  'minami',
  'moriyama',
  'midori',
  'meito',
  'tempaku',
];

export function isMunicipality(value: unknown): value is Municipality {
  return (MUNICIPALITIES as readonly unknown[]).includes(value);
}

export function isNagoyaWard(value: unknown): value is NagoyaWard {
  return (NAGOYA_WARDS as readonly unknown[]).includes(value);
}

/** 開催地の誤り。名古屋市は区が必要で、ほかの市町村は区を持たない（docs/11の2-1）。 */
export function checkArea(area: { municipality: unknown; ward: unknown }) {
  const errors: Partial<Record<'municipality' | 'ward', string>> = {};
  if (!isMunicipality(area.municipality)) {
    errors.municipality = '市町村を選んでください。';
  } else if (area.municipality === 'nagoya') {
    if (!isNagoyaWard(area.ward)) errors.ward = '区を選んでください。';
  } else if (area.ward !== null) {
    errors.ward = '区は、名古屋市の場合だけ選べます。';
  }
  return errors;
}

export const TARGET_LEVELS: readonly TargetLevel[] = ['inexperienced', 'beginner', 'experienced'];

export type EventField =
  | 'title'
  | 'startsAt'
  | 'endsAt'
  | 'municipality'
  | 'ward'
  | 'targetLevels'
  | 'capacity'
  | 'fee'
  | 'description'
  | 'belongings'
  | 'address'
  | 'venueName'
  | 'note';

export type EventFieldErrors = Partial<Record<EventField, string>>;

const HOUR_MS = 60 * 60 * 1000;

export function tooLongMessage(max: number, length: number) {
  return `${max.toLocaleString('ja-JP')}文字以内で入力してください（今は${length.toLocaleString('ja-JP')}文字）。`;
}

/** 開始から1年後。DBの now() + interval '1 year' に合わせ、暦の上で1年を足す。 */
function oneYearLater(now: Date) {
  const limit = new Date(now);
  limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  return limit;
}

/** 開始・終了の日時の誤り（docs/11の2-1、DB-04）。 */
export function checkSchedule(startsAt: Date | null, endsAt: Date | null, now: Date) {
  const errors: EventFieldErrors = {};
  if (startsAt) {
    if (startsAt <= now) errors.startsAt = '開始は、今より後の日時にしてください。';
    else if (startsAt > oneYearLater(now))
      errors.startsAt = '開始は、1年以内の日時にしてください。';
  }
  if (startsAt && endsAt) {
    if (endsAt <= startsAt) errors.endsAt = '終了は、開始より後の日時にしてください。';
    else if (endsAt.getTime() - startsAt.getTime() > EVENT_LIMITS.maxDurationHours * HOUR_MS) {
      errors.endsAt = `開催時間は、${EVENT_LIMITS.maxDurationHours}時間以内にしてください。`;
    }
  }
  return errors;
}

export function checkCapacity(capacity: number) {
  return Number.isInteger(capacity) &&
    capacity >= EVENT_LIMITS.capacityMin &&
    capacity <= EVENT_LIMITS.capacityMax
    ? undefined
    : `${EVENT_LIMITS.capacityMin}〜${EVENT_LIMITS.capacityMax}の数字で入力してください。`;
}

export function checkFee(fee: number) {
  return Number.isInteger(fee) && fee >= EVENT_LIMITS.feeMin && fee <= EVENT_LIMITS.feeMax
    ? undefined
    : `${EVENT_LIMITS.feeMin}〜${EVENT_LIMITS.feeMax.toLocaleString('ja-JP')}の数字で入力してください。`;
}

function toValidDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function checkText(value: string | null, max: number, required: boolean) {
  if (value === null || value.trim() === '') return required ? '入力してください。' : undefined;
  const length = textLength(value);
  return length > max ? tooLongMessage(max, length) : undefined;
}

/**
 * 送る内容の検証。画面の入力の検証と、開発用の窓口での再検証に使う。
 * 本番では、同じ条件をDBでも必ず検証する（docs/08の3章）。
 */
export function checkEventInput(input: CreateEventInput, now: Date): EventFieldErrors {
  const startsAt = toValidDate(input.startsAt);
  const endsAt = toValidDate(input.endsAt);
  const errors: EventFieldErrors = {
    ...(startsAt ? {} : { startsAt: '開始の日時を入力してください。' }),
    ...(endsAt ? {} : { endsAt: '終了の日時を入力してください。' }),
    ...checkSchedule(startsAt, endsAt, now),
  };
  const set = (field: EventField, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  set('title', checkText(input.title, EVENT_LIMITS.titleMax, true));
  Object.assign(errors, checkArea(input.area));
  set(
    'targetLevels',
    input.targetLevels.length > 0 &&
      new Set(input.targetLevels).size === input.targetLevels.length &&
      input.targetLevels.every((level) => TARGET_LEVELS.includes(level))
      ? undefined
      : '1つ以上選んでください。',
  );
  set('capacity', checkCapacity(input.capacity));
  set('fee', checkFee(input.fee));
  set('description', checkText(input.description, EVENT_LIMITS.descriptionMax, false));
  set('belongings', checkText(input.belongings, EVENT_LIMITS.belongingsMax, false));
  set('address', checkText(input.location.address, EVENT_LIMITS.addressMax, true));
  set('venueName', checkText(input.location.venueName, EVENT_LIMITS.venueNameMax, false));
  set('note', checkText(input.location.note, EVENT_LIMITS.noteMax, false));
  return errors;
}
