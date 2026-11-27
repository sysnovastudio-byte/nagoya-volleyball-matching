import { describe, expect, it } from 'vitest';
import type { EventState } from '../events/types';
import { participationGroup } from './participationFilter';
import type { ApplicationStatus, MyParticipation } from './types';

const NOW = new Date('2026-12-01T00:00:00Z');

function item(status: ApplicationStatus, state: EventState): MyParticipation {
  return {
    applicationId: `${status}-${state}`,
    status,
    event: {
      hidden: false,
      id: 'event-1',
      title: '募集',
      startsAt: '2026-12-05T04:00:00Z',
      endsAt: '2026-12-05T07:00:00Z',
      state,
    },
  };
}

function hidden(endsAt: string): MyParticipation {
  return {
    applicationId: `hidden-${endsAt}`,
    status: 'approved',
    event: { hidden: true, startsAt: '2026-11-01T04:00:00Z', endsAt },
  };
}

describe('申請と募集の絞り込み（参加する側）', () => {
  it.each([
    ['pending', 'open', 'pending'],
    ['pending', 'full', 'pending'],
    ['pending', 'closed', 'pending'],
    ['approved', 'open', 'approved'],
    ['approved', 'ongoing', 'approved'],
    ['rejected', 'open', 'other'],
    ['cancelled', 'full', 'other'],
    ['revoked', 'open', 'other'],
    ['retracted', 'open', 'other'],
  ] as const)('%s の申請（募集は %s）は %s に入る', (status, state, group) => {
    expect(participationGroup(item(status, state), NOW)).toBe(group);
  });

  it('開始後に残った承認待ち（受付終了）は、承認待ちに入れない', () => {
    expect(participationGroup(item('pending', 'ongoing'), NOW)).toBe('other');
  });

  it.each(['ended', 'cancelled'] as const)(
    '募集が %s なら、申請の状態によらず「終わったもの」に入る',
    (state) => {
      expect(participationGroup(item('approved', state), NOW)).toBe('past');
      expect(participationGroup(item('pending', state), NOW)).toBe('past');
    },
  );

  it('非表示の募集は、終了日時の前なら「そのほか」、後なら「終わったもの」に入る', () => {
    expect(participationGroup(hidden('2026-12-02T00:00:00Z'), NOW)).toBe('other');
    expect(participationGroup(hidden('2026-11-30T00:00:00Z'), NOW)).toBe('past');
  });
});
