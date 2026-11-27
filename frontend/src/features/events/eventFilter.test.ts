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
    const filter = {
      dateFrom: '2026-12-01',
      dateTo: '2026-12-07',
      municipality: 'nagoya' as const,
      ward: 'naka' as const,
    };
    expect(filterToParams(filter).toString()).toBe(
      'from=2026-12-01&to=2026-12-07&city=nagoya&ward=naka',
    );
    expect(filterFromParams(filterToParams(filter))).toEqual(filter);
    const outside = { ...EMPTY_FILTER, municipality: 'toyota' as const };
    expect(filterToParams(outside).toString()).toBe('city=toyota');
    expect(filterFromParams(filterToParams(outside))).toEqual(outside);
    expect(filterToParams(EMPTY_FILTER).toString()).toBe('');
  });

  it('形の正しくない値は、指定がないものとして扱う', () => {
    expect(
      filterFromParams(new URLSearchParams('from=2026-02-30&to=abc&city=tokyo&ward=naka')),
    ).toEqual(EMPTY_FILTER);
  });

  it('区は、市町村が名古屋市のときだけ読む', () => {
    expect(filterFromParams(new URLSearchParams('city=toyota&ward=naka'))).toEqual({
      ...EMPTY_FILTER,
      municipality: 'toyota',
    });
    expect(filterFromParams(new URLSearchParams('ward=naka'))).toEqual(EMPTY_FILTER);
    expect(filterFromParams(new URLSearchParams('city=nagoya&ward=shibuya'))).toEqual({
      ...EMPTY_FILTER,
      municipality: 'nagoya',
    });
  });

  it('始まりの日が終わりの日より後なら誤り。同じ日はよい', () => {
    expect(
      checkFilter({ ...EMPTY_FILTER, dateFrom: '2026-12-08', dateTo: '2026-12-07' }),
    ).not.toBeNull();
    expect(
      checkFilter({ ...EMPTY_FILTER, dateFrom: '2026-12-07', dateTo: '2026-12-07' }),
    ).toBeNull();
  });

  it('日付の範囲と開催地で、指定した数を数える。市町村と区は合わせて1つ', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, dateTo: '2026-12-07' })).toBe(1);
    expect(
      activeFilterCount({
        dateFrom: '2026-12-01',
        dateTo: null,
        municipality: 'nagoya',
        ward: 'naka',
      }),
    ).toBe(2);
  });

  it('開催日は日本時間の開始日で比べ、範囲の両端の日を含む', () => {
    // 日本時間の12月1日 0:30（UTCでは11月30日）
    const event = {
      startsAt: '2026-11-30T15:30:00Z',
      area: { municipality: 'nagoya' as const, ward: 'naka' as const },
    };
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateFrom: '2026-12-01' })).toBe(true);
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateTo: '2026-12-01' })).toBe(true);
    expect(matchesFilter(event, { ...EMPTY_FILTER, dateTo: '2026-11-30' })).toBe(false);
  });

  it('開催地は市町村で比べ、名古屋市で区を指定したときだけ区も比べる', () => {
    const nagoya = {
      startsAt: '2026-12-01T03:00:00Z',
      area: { municipality: 'nagoya' as const, ward: 'naka' as const },
    };
    const toyota = {
      startsAt: '2026-12-01T03:00:00Z',
      area: { municipality: 'toyota' as const, ward: null },
    };
    const inNagoya = { ...EMPTY_FILTER, municipality: 'nagoya' as const };
    expect(matchesFilter(nagoya, inNagoya)).toBe(true);
    expect(matchesFilter(toyota, inNagoya)).toBe(false);
    expect(matchesFilter(nagoya, { ...inNagoya, ward: 'naka' })).toBe(true);
    expect(matchesFilter(nagoya, { ...inNagoya, ward: 'kita' })).toBe(false);
    expect(matchesFilter(toyota, { ...EMPTY_FILTER, municipality: 'toyota' })).toBe(true);
  });
});
