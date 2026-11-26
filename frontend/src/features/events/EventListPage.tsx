import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { useViewer } from '../auth/sessionContext';
import { EventCard } from './EventCard';
import { HeroBand } from './HeroBand';
import { useEventList } from './useEventList';

const SKELETON_COUNT = 3;

/** SCR-005 ホーム・募集一覧（EVT-02）。検索（EVT-05）は限定公開までに加える。 */
export function EventListPage() {
  useDocumentTitle('募集一覧');
  const viewer = useViewer();
  // 表示の切り替えだけ。作成の可否は取得の窓口（本番はDB）が判定する
  const canCreate = viewer !== null && viewer.ageCategory === 'adult';

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
            {canCreate && (
              <div className="hidden lg:block">
                <ButtonLink to="/events/new">募集を作る</ButtonLink>
              </div>
            )}
          </div>
        </div>
        {viewer?.ageCategory === 'minor' && (
          <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3">
            18歳未満の方は、募集を作成できません。参加の申請と、主催者への質問はできます。
          </p>
        )}
        <EventList />
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

function EventList() {
  const { state, retry, loadMore } = useEventList();

  if (state.status === 'loading') return <EventListSkeleton />;

  if (state.status === 'error') {
    return (
      <StatusMessage title="募集を読み込めませんでした" role="alert">
        <p>通信の状態を確認して、もう一度お試しください。</p>
        <Button onClick={retry}>もう一度読み込む</Button>
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
      <ul className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
      <div aria-hidden="true" className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
