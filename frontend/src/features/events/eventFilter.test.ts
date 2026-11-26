import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  checkFilter,
  EMPTY_FILTER,
  filterFromParams,
  filterToParams,
  matchesFilter,
} from './eventFilter';

describe('絞り込みの条件', () => {
  it('アドレスとの間で、条件を読み書きできる', () => {
    const filter = { dateFrom: '2026-12-01', dateTo: '2026-12-07', area: 'naka' as const };
    expect(filterToParams(filter).toString()).toBe('from=2026-12-01&to=2026-12-07&area=naka');
    expect(filterFromParams(filterToParams(filter))).toEqual(filter);
    expect(filterToParams(EMPTY_FILTER).toString()).toBe('');
  });

  it('形の正しくない値は、指定がないものとして扱う', () => {
    expect(filterFromParams(new URLSearchParams('from=2026-02-30&to=abc&area=tokyo'))).toEqual(
      EMPTY_FILTER,
    );
  });

  it('始まりの日が終わりの日より後なら誤り。同じ日はよい', () => {
    expect(
      checkFilter({ ...EMPTY_FILTER, dateFrom: '2026-12-08', dateTo: '2026-12-07' }),
    ).not.toBeNull();
    expect(
      checkFilter({ ...EMPTY_FILTER, dateFrom: '2026-12-07', dateTo: '2026-12-07' }),
    ).toBeNull();
  });

  it('日付の範囲と区で、指定した数を数える', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, dateTo: '2026-12-07' })).toBe(1);
    expect(activeFilterCount({ dateFrom: '2026-12-01', dateTo: null, area: 'naka' })).toBe(2);
  });

  it('開催日は日本時間の開始日で比べ、範囲の両端の日を含む', () => {
    // 日本時間の12月1日 0:30（UTCでは11月30日）
    const event = { startsAt: '2026-11-30T15:30:00Z', area: 'naka' as const };
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateFrom: '2026-12-01' })).toBe(true);
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateTo: '2026-12-01' })).toBe(true);
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateTo: '2026-11-30' })).toBe(false);
    expect(matchesFilter(event, { ...EMPTY_FILTER, area: 'naka' })).toBe(true);
    expect(matchesFilter(event, { ...EMPTY_FILTER, area: 'kita' })).toBe(false);
  });
});
