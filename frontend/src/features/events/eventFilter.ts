import { isMunicipality, isNagoyaWard } from './eventRules';
import type { EventArea, Municipality, NagoyaWard } from './types';

/**
 * 募集の絞り込みの条件（EVT-05）。日付の範囲と開催地（docs/11の2-1）。対象レベル・種別は作らない。
 * 日付は日本時間の「YYYY-MM-DD」。開始日・終了日を含む。未指定は null。
 * 区は、市町村が名古屋市のときだけ指定できる。名古屋市で区が null なら、名古屋市のすべての区。
 */
export interface EventFilter {
  dateFrom: string | null;
  dateTo: string | null;
  municipality: Municipality | null;
  ward: NagoyaWard | null;
}

export const EMPTY_FILTER: EventFilter = {
  dateFrom: null,
  dateTo: null,
  municipality: null,
  ward: null,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** アドレスに入れる名前。戻ったときにも条件が残るよう、条件はアドレスに持つ。 */
const PARAMS = { dateFrom: 'from', dateTo: 'to', municipality: 'city', ward: 'ward' } as const;

/** アドレスから条件を読む。形の正しくない値は、指定がないものとして扱う。 */
export function filterFromParams(params: URLSearchParams): EventFilter {
  const date = (name: string) => {
    const value = params.get(name);
    return value !== null && isDate(value) ? value : null;
  };
  const municipality = params.get(PARAMS.municipality);
  const ward = params.get(PARAMS.ward);
  const validMunicipality = isMunicipality(municipality) ? municipality : null;
  return {
    dateFrom: date(PARAMS.dateFrom),
    dateTo: date(PARAMS.dateTo),
    municipality: validMunicipality,
    // 区は名古屋市のときだけ読む
    ward: validMunicipality === 'nagoya' && isNagoyaWard(ward) ? ward : null,
  };
}

export function filterToParams(filter: EventFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.dateFrom) params.set(PARAMS.dateFrom, filter.dateFrom);
  if (filter.dateTo) params.set(PARAMS.dateTo, filter.dateTo);
  if (filter.municipality) params.set(PARAMS.municipality, filter.municipality);
  if (filter.municipality === 'nagoya' && filter.ward) params.set(PARAMS.ward, filter.ward);
  return params;
}

export function activeFilterCount(filter: EventFilter) {
  return [filter.dateFrom !== null || filter.dateTo !== null, filter.municipality !== null].filter(
    Boolean,
  ).length;
}

export function filterKey(filter: EventFilter) {
  return filterToParams(filter).toString();
}

/** 入力の誤り。開始日が終了日より後の場合だけ。 */
export function checkFilter(filter: EventFilter): string | null {
  if (filter.dateFrom && filter.dateTo && filter.dateFrom > filter.dateTo) {
    return '終わりの日は、始まりの日と同じか、それより後にしてください。';
  }
  return null;
}

const jstDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 開催日（日本時間の開始日）が条件に合うか。 */
export function matchesFilter(event: { startsAt: string; area: EventArea }, filter: EventFilter) {
  if (filter.municipality && event.area.municipality !== filter.municipality) return false;
  if (filter.municipality === 'nagoya' && filter.ward && event.area.ward !== filter.ward) {
    return false;
  }
  const day = jstDate.format(new Date(event.startsAt));
  if (filter.dateFrom && day < filter.dateFrom) return false;
  if (filter.dateTo && day > filter.dateTo) return false;
  return true;
}
