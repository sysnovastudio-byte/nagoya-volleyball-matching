import type { Area, EventState, TargetLevel } from './types';

const TIME_ZONE = 'Asia/Tokyo';

const AREA_LABELS: Record<Area, string> = {
  chikusa: '千種区',
  higashi: '東区',
  kita: '北区',
  nishi: '西区',
  nakamura: '中村区',
  naka: '中区',
  showa: '昭和区',
  mizuho: '瑞穂区',
  atsuta: '熱田区',
  nakagawa: '中川区',
  minato: '港区',
  minami: '南区',
  moriyama: '守山区',
  midori: '緑区',
  meito: '名東区',
  tempaku: '天白区',
};

const LEVEL_LABELS: Record<TargetLevel, string> = {
  inexperienced: '未経験者',
  beginner: '初心者',
  experienced: '経験者',
};

const STATE_LABELS: Record<EventState, string> = {
  open: '受付中',
  full: '満員',
  closed: '受付終了',
  ongoing: '開催中',
  ended: '終了',
  cancelled: '中止',
};

const partsFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

const feeFormat = new Intl.NumberFormat('ja-JP');

interface DateParts {
  month: string;
  day: string;
  weekday: string;
  /** 「9:00」の形 */
  time: string;
}

/** 日時を、日本時間の月・日・曜日・時刻に分ける。 */
export function toDateParts(iso: string): DateParts {
  const parts = partsFormat.formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    month: pick('month'),
    day: pick('day'),
    weekday: pick('weekday'),
    time: `${Number(pick('hour'))}:${pick('minute').padStart(2, '0')}`,
  };
}

function isSameDay(a: DateParts, b: DateParts) {
  return a.month === b.month && a.day === b.day;
}

function formatDay(parts: DateParts) {
  return `${parts.month}月${parts.day}日（${parts.weekday}）`;
}

/** 時間の範囲。日をまたぐ場合は、終わりに日付を付ける。 */
export function formatTimeRange(startsAt: string, endsAt: string) {
  const start = toDateParts(startsAt);
  const end = toDateParts(endsAt);
  const endText = isSameDay(start, end) ? end.time : `${formatDay(end)}${end.time}`;
  return `${start.time}〜${endText}`;
}

export function formatDateTimeRange(startsAt: string, endsAt: string) {
  return `${formatDay(toDateParts(startsAt))}${formatTimeRange(startsAt, endsAt)}`;
}

export function formatFee(fee: number) {
  return `${feeFormat.format(fee)}円`;
}

export function areaLabel(area: Area) {
  return AREA_LABELS[area];
}

export function levelLabel(level: TargetLevel) {
  return LEVEL_LABELS[level];
}

export function levelsLabel(levels: TargetLevel[]) {
  return levels.map(levelLabel).join('・');
}

export function stateLabel(state: EventState) {
  return STATE_LABELS[state];
}
