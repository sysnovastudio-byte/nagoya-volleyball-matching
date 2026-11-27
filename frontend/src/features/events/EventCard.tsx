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
import type { PublicEvent } from './types';

interface EventCardProps {
  event: PublicEvent;
}

/** 募集一覧の一件（docs/10の11-3）。開催場所住所は扱わない。 */
export function EventCard({ event }: EventCardProps) {
  const start = toDateParts(event.startsAt);
  const isOpen = event.state === 'open';

  return (
    <article className="relative flex h-full gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-xs hover:border-main">
      <p
        className={`flex w-16 shrink-0 flex-col items-center self-start rounded-xl py-2.5 leading-tight font-bold ${
          isOpen ? 'bg-main-tint text-main-strong' : 'bg-canvas text-sub'
        }`}
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
          <span className={isOpen ? 'text-main-strong' : 'text-muted'}>
            残り{event.remaining}／{event.capacity}人
          </span>
        </p>
        <p className="text-muted">主催：{event.hostNickname}</p>
      </div>
    </article>
  );
}
