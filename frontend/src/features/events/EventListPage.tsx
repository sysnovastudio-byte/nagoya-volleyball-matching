import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { PC_QUERY, useMediaQuery } from '../../app/useMediaQuery';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { isMemberViewer, useViewer } from '../auth/sessionContext';
import { EventCard } from './EventCard';
import { EventFilterPanel } from './EventFilterPanel';
import {
  activeFilterCount,
  EMPTY_FILTER,
  filterFromParams,
  filterKey,
  filterToParams,
  type EventFilter,
} from './eventFilter';
import { municipalityLabel, wardLabel } from './format';
import { HeroBand } from './HeroBand';
import { useEventList } from './useEventList';

const SKELETON_COUNT = 3;

/**
 * SCR-005 ホーム・募集一覧（EVT-02）と絞り込み（EVT-05）。
 * 条件はスマートフォンでは上部の「条件」ボタンで開き、PCでは左に出す（docs/11の5-1）。
 * 条件はアドレスに持つ。詳細から戻ったときも、同じ条件の一覧に戻る。
 */
export function EventListPage() {
  useDocumentTitle('募集一覧');
  const viewer = useViewer();
  const isPc = useMediaQuery(PC_QUERY);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromParams(searchParams);
  const [panelOpen, setPanelOpen] = useState(false);
  const count = activeFilterCount(filter);

  const apply = (next: EventFilter) => {
    setSearchParams(filterToParams(next));
    setPanelOpen(false);
  };
  const panel = <EventFilterPanel key={filterKey(filter)} filter={filter} onApply={apply} />;
  // 表示の切り替えだけ。作成の可否は取得の窓口（本番はDB）が判定する
  const canCreate = isMemberViewer(viewer);

  return (
    <>
      <HeroBand />
      <section
        aria-labelledby="event-list-heading"
        className="mx-auto w-full max-w-288 grow px-4 pt-5 pb-10"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="event-list-heading" className="text-xl font-bold md:text-2xl">
            これからの募集
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-muted">開催日の順</p>
            {!isPc && (
              <Button
                variant="secondary"
                size="small"
                aria-expanded={panelOpen}
                aria-controls="event-filter"
                onClick={() => {
                  setPanelOpen((open) => !open);
                }}
              >
                {count > 0 ? `条件（${count}）` : '条件'}
              </Button>
            )}
            {canCreate && (
              <div className="hidden lg:block">
                <ButtonLink to="/events/new">募集を作る</ButtonLink>
              </div>
            )}
          </div>
        </div>
        {!isPc && panelOpen && (
          <div id="event-filter" className="mb-4">
            {panel}
          </div>
        )}
        <FilterSummary
          filter={filter}
          onClear={() => {
            apply(EMPTY_FILTER);
          }}
        />
        {isPc ? (
          <div className="grid grid-cols-[16rem_minmax(0,1fr)] items-start gap-6">
            <aside aria-label="絞り込みの条件" className="sticky top-4">
              {panel}
            </aside>
            <EventList
              key={filterKey(filter)}
              filter={filter}
              onClear={() => {
                apply(EMPTY_FILTER);
              }}
            />
          </div>
        ) : (
          <EventList
            key={filterKey(filter)}
            filter={filter}
            onClear={() => {
              apply(EMPTY_FILTER);
            }}
          />
        )}
      </section>
      {canCreate && (
        // スマートフォンでは下部の移動の上に固定し、重ねない
        <div className="sticky bottom-(--member-nav-h) z-10 border-t border-line bg-surface px-4 py-3 lg:hidden">
          <div className="mx-auto flex max-w-160 flex-col">
            <ButtonLink to="/events/new">募集を作る</ButtonLink>
          </div>
        </div>
      )}
    </>
  );
}

const shortDate = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'UTC',
  month: 'numeric',
  day: 'numeric',
});

function dateLabel(value: string) {
  return shortDate.format(new Date(`${value}T00:00:00Z`));
}

/** 今の条件。読み上げでも、絞り込んでいることが分かるようにする。 */
function FilterSummary({ filter, onClear }: { filter: EventFilter; onClear: () => void }) {
  if (activeFilterCount(filter) === 0) return null;
  const parts: string[] = [];
  if (filter.dateFrom || filter.dateTo) {
    parts.push(
      `${filter.dateFrom ? dateLabel(filter.dateFrom) : ''}〜${filter.dateTo ? dateLabel(filter.dateTo) : ''}`,
    );
  }
  if (filter.municipality) {
    parts.push(
      `${municipalityLabel(filter.municipality)}${filter.ward ? wardLabel(filter.ward) : ''}`,
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="font-bold">
        条件：<span className="text-main-strong">{parts.join('・')}</span>
      </p>
      <Button variant="text" size="small" onClick={onClear}>
        条件をクリア
      </Button>
    </div>
  );
}

function EventList({ filter, onClear }: { filter: EventFilter; onClear: () => void }) {
  const { state, retry, loadMore } = useEventList(filter);

  if (state.status === 'loading') return <EventListSkeleton />;

  if (state.status === 'error') {
    return (
      <StatusMessage title="募集を読み込めませんでした" role="alert">
        <p>通信の状態を確認して、もう一度お試しください。</p>
        <Button onClick={retry}>もう一度読み込む</Button>
      </StatusMessage>
    );
  }

  if (state.items.length === 0 && activeFilterCount(filter) > 0) {
    return (
      <StatusMessage title="条件に合う募集はありません">
        <p>日付や開催地を変えて、もう一度お試しください。</p>
        <Button variant="secondary" onClick={onClear}>
          条件をクリア
        </Button>
      </StatusMessage>
    );
  }

  if (state.items.length === 0) {
    return (
      <StatusMessage title="募集はまだありません">
        <p>新しい募集が公開されると、ここに表示されます。</p>
      </StatusMessage>
    );
  }

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
        {state.items.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
      {state.nextCursor !== null && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {state.more === 'error' && <p role="alert">続きを読み込めませんでした。</p>}
          <Button
            variant="text"
            disabled={state.more === 'loading'}
            onClick={() => {
              void loadMore();
            }}
          >
            {state.more === 'loading' ? '読み込んでいます' : '続きを読み込む'}
          </Button>
        </div>
      )}
    </>
  );
}

function EventListSkeleton() {
  return (
    <div role="status">
      <p className="sr-only">募集を読み込んでいます</p>
      <div aria-hidden="true" className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div
            key={index}
            className="flex gap-3.5 rounded-2xl border border-line bg-surface p-4 motion-safe:animate-pulse"
          >
            <div className="size-16 shrink-0 rounded-xl bg-main-tint" />
            <div className="flex grow flex-col gap-3 py-1">
              <div className="h-4 w-1/3 rounded-full bg-line" />
              <div className="h-4 w-4/5 rounded-full bg-line" />
              <div className="h-4 w-3/5 rounded-full bg-line" />
              <div className="h-4 w-2/5 rounded-full bg-line" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
