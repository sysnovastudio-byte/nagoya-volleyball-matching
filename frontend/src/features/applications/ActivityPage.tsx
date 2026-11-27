import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource, type Resource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EventStateBadge } from '../events/EventStateBadge';
import { formatDateTimeRange } from '../events/format';
import { useEventRepository } from '../events/repositoryContext';
import type { MyEvent } from '../events/types';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { OwnApplicationActions } from './OwnApplicationActions';
import {
  isPast,
  matchesParticipationFilter,
  PARTICIPATION_FILTER_LABELS,
  PARTICIPATION_FILTERS,
  type ParticipationFilter,
} from './participationFilter';
import { useApplicationRepository } from './repositoryContext';
import { SegmentedControl } from './SegmentedControl';
import type { EventSummary, MyParticipation } from './types';

type Side = 'participant' | 'host';

const HIDDEN_TITLE = '非表示になった募集';

/** 開催前は日時の早い順、終了は新しい順に並べて分ける。 */
function splitByTime<T>(items: T[], eventOf: (item: T) => EventSummary | MyEvent) {
  const upcoming = items.filter((item) => !isPast(eventOf(item)));
  const past = items.filter((item) => isPast(eventOf(item))).reverse();
  return { upcoming, past };
}

/**
 * SCR-009 申請・募集の管理（APP-07・APP-08・CND-10・EVT-06）。
 * 自分の申請の状態と、主催した募集を示す。承認待ちは取り下げ、承認済みはキャンセルできる。
 */
export function ActivityPage() {
  useDocumentTitle('申請と募集');
  const [side, setSide] = useState<Side>('participant');
  // 読み込み直しても、選んだ絞り込みを保つ
  const [filter, setFilter] = useState<ParticipationFilter>('all');
  const applications = useApplicationRepository();
  const events = useEventRepository();
  const participations = useResource('my-participations', () => applications.getMyParticipations());
  const hosted = useResource('my-events', () => events.getMyEvents());

  return (
    <div className="mx-auto w-full max-w-280 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">申請と募集</h1>

      {/* スマートフォンは切り替え、PCは2列（docs/11の5-1） */}
      <div className="mb-4 lg:hidden">
        <SegmentedControl
          label="表示する側"
          options={[
            { value: 'participant', label: '参加する側' },
            { value: 'host', label: '主催する側' },
          ]}
          value={side}
          onChange={setSide}
        />
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section
          aria-labelledby="activity-participant"
          className={side === 'participant' ? '' : 'hidden lg:block'}
        >
          <h2 id="activity-participant" className="mb-3 text-xl font-bold">
            参加する側
          </h2>
          <ResourceView resource={participations} onRetry={participations.retry}>
            {(items) => (
              <ParticipationList
                items={items}
                filter={filter}
                onFilterChange={setFilter}
                onChanged={participations.reload}
              />
            )}
          </ResourceView>
        </section>

        <section
          aria-labelledby="activity-host"
          className={side === 'host' ? '' : 'hidden lg:block'}
        >
          <h2 id="activity-host" className="mb-3 text-xl font-bold">
            主催する側
          </h2>
          <ResourceView resource={hosted} onRetry={hosted.retry}>
            {(items) => <HostedList items={items} />}
          </ResourceView>
        </section>
      </div>
    </div>
  );
}

interface ResourceViewProps<T> {
  resource: { result: Resource<T> };
  onRetry: () => void;
  children: (value: T) => ReactNode;
}

function ResourceView<T>({ resource, onRetry, children }: ResourceViewProps<T>) {
  const { result } = resource;
  if (result.status === 'loading') {
    return (
      <p role="status" className="py-6 text-center text-muted">
        読み込んでいます
      </p>
    );
  }
  if (result.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
        <p>読み込めませんでした。通信の状態を確認して、もう一度お試しください。</p>
        <Button variant="secondary" size="small" onClick={onRetry}>
          もう一度読み込む
        </Button>
      </div>
    );
  }
  return children(result.value);
}

interface GroupProps<T> {
  title: string;
  items: T[];
  render: (item: T, index: number) => ReactNode;
}

function Group<T>({ title, items, render }: GroupProps<T>) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 font-bold text-sub">{title}</h3>
      <ul className="flex flex-col gap-3">{items.map(render)}</ul>
    </div>
  );
}

interface ParticipationListProps {
  items: MyParticipation[];
  filter: ParticipationFilter;
  onFilterChange: (filter: ParticipationFilter) => void;
  onChanged: () => void;
}

function ParticipationList({ items, filter, onFilterChange, onChanged }: ParticipationListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-muted">まだ申請した募集はありません。</p>
        <ButtonLink to="/" variant="secondary" size="small">
          募集を探す
        </ButtonLink>
      </div>
    );
  }
  const now = new Date();
  const shown = items.filter((item) => matchesParticipationFilter(item, filter, now));
  const { upcoming, past } = splitByTime(shown, (item) => item.event);
  const render = (item: MyParticipation) => (
    <ParticipationItem key={item.applicationId} item={item} onChanged={onChanged} />
  );
  return (
    <>
      {/* 状態で絞り込む（2026-11-27 ユーザーの決定）。幅360pxでは折り返す */}
      <div role="group" aria-label="申請の状態で絞り込む" className="mb-4 flex flex-wrap gap-2">
        {PARTICIPATION_FILTERS.map((item) => {
          const count = items.filter((candidate) =>
            matchesParticipationFilter(candidate, item, now),
          ).length;
          return (
            <Button
              key={item}
              size="small"
              variant={item === filter ? 'primary' : 'secondary'}
              aria-pressed={item === filter}
              onClick={() => {
                onFilterChange(item);
              }}
            >
              {PARTICIPATION_FILTER_LABELS[item]}
              <span className="ml-1 font-normal">
                {count}
                <span className="sr-only">件</span>
              </span>
            </Button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-muted">
          「{PARTICIPATION_FILTER_LABELS[filter]}」の申請はありません。
        </p>
      ) : (
        <>
          <Group title="これからの募集" items={upcoming} render={render} />
          <Group title="終わった募集" items={past} render={render} />
        </>
      )}
    </>
  );
}

function ParticipationItem({ item, onChanged }: { item: MyParticipation; onChanged: () => void }) {
  const { event } = item;

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <EventHeading event={event} />
      {/* 非表示の募集は開催日時だけを示す（docs/11の4-4） */}
      {!event.hidden && (
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sub">あなたの申請</span>
          {/* 開始後に残った承認待ちは「受付終了」と示す（docs/10の5-3） */}
          <ApplicationStatusBadge status={item.status} eventState={event.state} />
        </p>
      )}
      {!event.hidden && (
        <div className="mt-2 flex empty:hidden">
          <OwnApplicationActions
            applicationId={item.applicationId}
            status={item.status}
            eventState={event.state}
            onChanged={onChanged}
          />
        </div>
      )}
    </li>
  );
}

function HostedList({ items }: { items: MyEvent[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-muted">まだ主催した募集はありません。</p>
        <ButtonLink to="/events/new" variant="secondary" size="small">
          募集を作る
        </ButtonLink>
      </div>
    );
  }
  const { upcoming, past } = splitByTime(items, (item) => item);
  const render = (item: MyEvent, index: number) => (
    <HostedItem key={item.hidden ? `hidden-${index}-${item.startsAt}` : item.id} item={item} />
  );
  return (
    <>
      <Group title="これからの募集" items={upcoming} render={render} />
      <Group title="終わった募集" items={past} render={render} />
    </>
  );
}

function HostedItem({ item }: { item: MyEvent }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <EventHeading event={item} />
      {!item.hidden && (
        <>
          <p className="mt-2 text-sub">
            承認済み <span className="font-bold text-ink">{item.approvedCount}</span>／
            {item.capacity}人・承認待ち{' '}
            <span className="font-bold text-ink">{item.pendingCount}</span>人
          </p>
          <div className="mt-2">
            <ButtonLink to={`/events/${item.id}/applicants`} variant="secondary" size="small">
              申請者を見る
            </ButtonLink>
          </div>
        </>
      )}
    </li>
  );
}

/** 募集の名前・状態・日時。非表示の募集は、名前の代わりに「非表示になった募集」と示す。 */
function EventHeading({ event }: { event: EventSummary | MyEvent }) {
  const dates = <p className="text-sub">{formatDateTimeRange(event.startsAt, event.endsAt)}</p>;
  if (event.hidden) {
    return (
      <>
        <p className="font-bold">{HIDDEN_TITLE}</p>
        {dates}
      </>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <EventStateBadge state={event.state} />
        <Link
          to={`/events/${event.id}`}
          className="inline-flex min-h-11 items-center font-bold text-main-strong underline"
        >
          {event.title}
        </Link>
      </div>
      {dates}
    </>
  );
}
