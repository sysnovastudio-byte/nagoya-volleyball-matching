import type { EventState } from '../events/types';
import { isClosedPending } from './ApplicationStatusBadge';
import type { MyParticipation } from './types';

/**
 * SCR-009 の参加する側の絞り込み（2026-11-27 ユーザーの決定）。
 * 区分は SCR-008 のタブ（承認待ち・承認済み・そのほか）に、終わったものを加える。
 */
export const PARTICIPATION_FILTERS = ['all', 'pending', 'approved', 'other', 'past'] as const;

export type ParticipationFilter = (typeof PARTICIPATION_FILTERS)[number];

export const PARTICIPATION_FILTER_LABELS: Record<ParticipationFilter, string> = {
  all: 'すべて',
  pending: '承認待ち',
  approved: '承認済み',
  other: 'そのほか',
  past: '終わったもの',
};

/** 終わった募集か。非表示の募集は状態を返さないため、終了日時で決める。 */
export function isPast(
  event: { hidden: true; endsAt: string } | { hidden: false; state: EventState },
  now = new Date(),
) {
  return event.hidden
    ? new Date(event.endsAt) < now
    : event.state === 'ended' || event.state === 'cancelled';
}

/**
 * 申請がどの区分に入るか。終わった募集は状態によらず「終わったもの」。
 * 開始後に残った承認待ち（受付終了）と、非表示の募集は「そのほか」に入れる。
 */
export function participationGroup(
  item: MyParticipation,
  now = new Date(),
): Exclude<ParticipationFilter, 'all'> {
  const { event, status } = item;
  if (isPast(event, now)) return 'past';
  if (event.hidden) return 'other';
  if (status === 'pending') return isClosedPending(status, event.state) ? 'other' : 'pending';
  if (status === 'approved') return 'approved';
  return 'other';
}

export function matchesParticipationFilter(
  item: MyParticipation,
  filter: ParticipationFilter,
  now = new Date(),
) {
  return filter === 'all' || participationGroup(item, now) === filter;
}
