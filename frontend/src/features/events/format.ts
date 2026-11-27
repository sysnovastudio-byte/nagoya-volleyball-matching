import type { EventArea, EventState, Municipality, NagoyaWard, TargetLevel } from './types';

const TIME_ZONE = 'Asia/Tokyo';

const MUNICIPALITY_LABELS: Record<Municipality, string> = {
  nagoya: '名古屋市',
  toyohashi: '豊橋市',
  okazaki: '岡崎市',
  ichinomiya: '一宮市',
  seto: '瀬戸市',
  handa: '半田市',
  kasugai: '春日井市',
  toyokawa: '豊川市',
  tsushima: '津島市',
  hekinan: '碧南市',
  kariya: '刈谷市',
  toyota: '豊田市',
  anjo: '安城市',
  nishio: '西尾市',
  gamagori: '蒲郡市',
  inuyama: '犬山市',
  tokoname: '常滑市',
  konan: '江南市',
  komaki: '小牧市',
  inazawa: '稲沢市',
  shinshiro: '新城市',
  tokai: '東海市',
  obu: '大府市',
  chita: '知多市',
  chiryu: '知立市',
  owariasahi: '尾張旭市',
  takahama: '高浜市',
  iwakura: '岩倉市',
  toyoake: '豊明市',
  nisshin: '日進市',
  tahara: '田原市',
  aisai: '愛西市',
  kiyosu: '清須市',
  kitanagoya: '北名古屋市',
  yatomi: '弥富市',
  miyoshi: 'みよし市',
  ama: 'あま市',
  nagakute: '長久手市',
  togo: '東郷町',
  toyoyama: '豊山町',
  oguchi: '大口町',
  fuso: '扶桑町',
  oharu: '大治町',
  kanie: '蟹江町',
  tobishima: '飛島村',
  agui: '阿久比町',
  higashiura: '東浦町',
  minamichita: '南知多町',
  mihama: '美浜町',
  taketoyo: '武豊町',
  kota: '幸田町',
  shitara: '設楽町',
  toei: '東栄町',
  toyone: '豊根村',
};

const WARD_LABELS: Record<NagoyaWard, string> = {
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

export function municipalityLabel(municipality: Municipality) {
  return MUNICIPALITY_LABELS[municipality];
}

export function wardLabel(ward: NagoyaWard) {
  return WARD_LABELS[ward];
}

/** 開催地。名古屋市は「名古屋市中区」のように区まで示す。 */
export function areaLabel(area: EventArea) {
  return area.ward === null
    ? municipalityLabel(area.municipality)
    : `${municipalityLabel(area.municipality)}${wardLabel(area.ward)}`;
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
