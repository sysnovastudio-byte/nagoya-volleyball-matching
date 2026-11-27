import { Link } from 'react-router';
import { EventStateBadge } from './EventStateBadge';
import {
  areaLabel,
  formatFee,
  formatTimeRange,
  kindLabel,
  levelsLabel,
  toDateParts,
} from './format';
import type { EventState, PublicEvent } from './types';

/**
 * 受付中と満員を、札のほかに日付の面と残り枠の色でも分ける（docs/11の5-2「状態の色」）。
 * 受付中はメイン、満員はアクセントの色み。そのほかの状態は灰色にする。
 */
const AVAILABILITY_LOOKS: Partial<Record<EventState, { date: string; remaining: string }>> = {
  open: { date: 'bg-main-tint text-main-strong', remaining: 'text-main-strong' },
  full: { date: 'bg-accent-tint text-accent-ink', remaining: 'text-accent-ink' },
};

const OTHER_LOOK = { date: 'bg-canvas text-sub', remaining: 'text-muted' };

interface EventCardProps {
  event: PublicEvent;
}

/** 募集一覧の一件（docs/10の11-3）。開催場所住所は扱わない。 */
export function EventCard({ event }: EventCardProps) {
  const start = toDateParts(event.startsAt);
  const look = AVAILABILITY_LOOKS[event.state] ?? OTHER_LOOK;

  return (
    <article className="relative flex h-full gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-xs hover:border-main">
      <p
        className={`flex w-16 shrink-0 flex-col items-center self-start rounded-xl py-2.5 leading-tight font-bold ${look.date}`}
      >
        <span className="text-xl">
          {start.month}/{start.day}
        </span>
        <span>
          <span className="sr-only">（</span>
          {start.weekday}
          <span className="sr-only">曜日）</span>
        </span>
      </p>
      <div className="flex min-w-0 grow flex-col items-start gap-1">
        <EventStateBadge state={event.state} />
        <h3 className="text-lg leading-normal font-bold">
          {/* カード全体を押せるようにする */}
          <Link
            to={`/events/${event.id}`}
            className="after:absolute after:inset-0 after:rounded-2xl"
          >
            {event.title}
          </Link>
        </h3>
        <p className="flex flex-wrap gap-x-4 font-medium text-sub">
          <span>{formatTimeRange(event.startsAt, event.endsAt)}</span>
          <span>{areaLabel(event.area)}</span>
        </p>
        <p className="flex flex-wrap gap-x-3 text-muted">
          {event.kind && <span>{kindLabel(event.kind)}</span>}
          <span>{levelsLabel(event.targetLevels)}</span>
        </p>
        <p className="flex w-full flex-wrap justify-between gap-x-3 font-bold">
          <span>{formatFee(event.fee)}</span>
          <span className={look.remaining}>
            {event.state === 'full'
              ? `満員（募集${event.capacity}人）`
              : `残り${event.remaining}／${event.capacity}人`}
          </span>
        </p>
        <p className="text-muted">主催：{event.hostNickname}</p>
      </div>
    </article>
  );
}
