import { describe, expect, it } from 'vitest';
import { RATE_LIMITS, reachedLimit } from '../features/safety/rateLimits';
import { reportLimitReached } from './devRateLimits';

const NOW = new Date('2026-11-25T03:00:00Z');
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const ago = (ms: number) => new Date(NOW.getTime() - ms);
const times = (count: number, msAgo: number) => Array.from({ length: count }, () => ago(msAgo));

describe('回数の上限（docs/11の3-1・4-5）', () => {
  it('数値は、決定のとおり', () => {
    expect(RATE_LIMITS.messagePerMinute).toEqual({ max: 10, windowMs: MINUTE_MS });
    expect(RATE_LIMITS.messagePerHour).toEqual({ max: 60, windowMs: HOUR_MS });
    expect(RATE_LIMITS.conversationStart).toEqual({ max: 10, windowMs: 24 * HOUR_MS });
    expect(RATE_LIMITS.report).toEqual({ max: 10, windowMs: 24 * HOUR_MS });
  });

  it('直近の期間の回数が上限に達したら、次を断る', () => {
    const limit = RATE_LIMITS.messagePerMinute;

    expect(reachedLimit(times(9, 10_000), limit, NOW)).toBe(false);
    expect(reachedLimit(times(10, 10_000), limit, NOW)).toBe(true);
  });

  it('期間より前の操作は数えない', () => {
    const limit = RATE_LIMITS.messagePerMinute;

    expect(reachedLimit(times(10, MINUTE_MS), limit, NOW)).toBe(false);
    expect(reachedLimit([...times(9, MINUTE_MS + 1), ...times(9, 1000)], limit, NOW)).toBe(false);
  });
});

describe('通報の上限の判定（サイクル4で使う）', () => {
  it('直近24時間に10件で、次を断る', () => {
    expect(reportLimitReached(times(9, HOUR_MS), NOW)).toBe(false);
    expect(reportLimitReached(times(10, HOUR_MS), NOW)).toBe(true);
    expect(reportLimitReached(times(10, 24 * HOUR_MS), NOW)).toBe(false);
  });
});
