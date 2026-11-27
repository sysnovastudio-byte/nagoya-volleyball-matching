import { describe, expect, it } from 'vitest';
import {
  areaLabel,
  formatDateTimeRange,
  formatFee,
  formatTimeRange,
  levelsLabel,
  toDateParts,
} from './format';

describe('日時の表示', () => {
  it('UTCの日時を、日本時間で表示する', () => {
    expect(formatDateTimeRange('2026-12-05T04:00:00Z', '2026-12-05T07:00:00Z')).toBe(
      '12月5日（土）13:00〜16:00',
    );
  });

  it('UTCでは前の日でも、日本時間の日付で表示する', () => {
    expect(toDateParts('2026-12-05T15:30:00Z')).toEqual({
      month: '12',
      day: '6',
      weekday: '日',
      time: '0:30',
    });
  });

  it('日をまたぐ場合は、終わりに日付を付ける', () => {
    expect(formatTimeRange('2026-12-05T13:00:00Z', '2026-12-05T15:30:00Z')).toBe(
      '22:00〜12月6日（日）0:30',
    );
  });
});

describe('そのほかの表示', () => {
  it('参加費を、桁区切りで表示する', () => {
    expect(formatFee(0)).toBe('0円');
    expect(formatFee(50000)).toBe('50,000円');
  });

  it('開催地と対象レベルを、日本語で表示する。名古屋市は区まで示す', () => {
    expect(areaLabel({ municipality: 'nagoya', ward: 'tempaku' })).toBe('名古屋市天白区');
    expect(areaLabel({ municipality: 'kitanagoya', ward: null })).toBe('北名古屋市');
    expect(levelsLabel(['inexperienced', 'beginner'])).toBe('未経験者・初心者');
  });
});
