import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { loginPath } from '../auth/loginRedirect';
import { useViewer } from '../auth/sessionContext';
import { EventStateBadge } from './EventStateBadge';
import { areaLabel, formatDateTimeRange, formatFee, levelsLabel } from './format';
import type { EventDetail as EventDetailData, EventState, PublicEvent } from './types';
import { useEvent } from './useEvent';
import { useEventLocation } from './useEventLocation';

/** 作成の直後に、募集詳細へ渡す印。 */
export interface EventDetailLocationState {
  justCreated?: boolean;
}

/** SCR-006 募集詳細（EVT-03）。未ログインと主催者の表示。申請などは次の段階で加える。 */
export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const { result, retry } = useEvent(eventId);

  switch (result.status) {
    case 'loading':
      return <LoadingMessage />;
    case 'error':
      return <ErrorMessage onRetry={retry} />;
    case 'notFound':
      return <NotFoundPage />;
    case 'ready':
      return <EventDetail event={result.event} />;
  }
}

function LoadingMessage() {
  useDocumentTitle('募集詳細');

  return (
    <div role="status" className="px-4 py-12 text-center text-muted">
      募集を読み込んでいます
    </div>
  );
}

interface ErrorMessageProps {
  onRetry: () => void;
}

function ErrorMessage({ onRetry }: ErrorMessageProps) {
  useDocumentTitle('募集詳細');

  return (
    <StatusMessage title="募集を読み込めませんでした" headingLevel="h1" role="alert">
      <p>通信の状態を確認して、もう一度お試しください。</p>
      <Button onClick={onRetry}>もう一度読み込む</Button>
      <ButtonLink to="/" variant="text">
        募集一覧へ戻る
      </ButtonLink>
    </StatusMessage>
  );
}

interface EventDetailProps {
  event: EventDetailData;
}

function EventDetail({ event }: EventDetailProps) {
  useDocumentTitle(event.title);
  const state = useLocation().state as EventDetailLocationState | null;

  return (
    <article className="flex grow flex-col">
      <div className="mx-auto w-full max-w-288 grow px-4 pt-2 pb-8">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-bold text-main-strong hover:underline"
        >
          <span aria-hidden="true" className="mr-1">
            ‹
          </span>
          募集一覧へ
        </Link>

        {state?.justCreated && event.isHost && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-main bg-main-tint px-4 py-3 font-bold text-main-strong"
          >
            募集を公開しました。
          </p>
        )}

        <div className="mt-1 mb-5 flex flex-col items-start gap-2">
          <EventStateBadge state={event.state} />
          <h1 className="text-2xl leading-snug font-bold">{event.title}</h1>
        </div>

        {/* 並び順は docs/11の5-1。スマートフォンは1列、PCは左に内容、右に日時・残り枠・操作 */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
          <aside
            aria-label="開催の情報と申し込み"
            className="rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:p-6"
          >
            <EventFacts event={event} />
            <div className="mt-5 hidden lg:block">
              <EventActions event={event} />
            </div>
          </aside>

          <div className="flex max-w-160 flex-col gap-6 lg:col-start-1 lg:row-start-1">
            {event.description !== null && (
              <TextSection title="説明">{event.description}</TextSection>
            )}
            {event.belongings !== null && (
              <TextSection title="持ち物">{event.belongings}</TextSection>
            )}
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-medium text-muted">主催者</h2>
              <p className="font-bold">{event.hostNickname}</p>
            </section>
            {event.isHost ? (
              <HostLocation eventId={event.id} />
            ) : (
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="text-lg font-bold">くわしい住所</h2>
                <p className="text-muted">参加が承認された人だけに表示されます。</p>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* 下部の移動の上に固定し、重ねない */}
      <div className="sticky bottom-(--member-nav-h) z-10 border-t border-line bg-surface px-4 py-3 lg:hidden">
        <div className="mx-auto max-w-160">
          <EventActions event={event} />
        </div>
      </div>
    </article>
  );
}

function EventFacts({ event }: { event: PublicEvent }) {
  const filledRatio = (event.capacity - event.remaining) / event.capacity;

  return (
    <dl className="flex flex-col gap-3.5">
      <Fact term="開催日時">{formatDateTimeRange(event.startsAt, event.endsAt)}</Fact>
      <Fact term="開催エリア">{areaLabel(event.area)}</Fact>
      <Fact term="残り枠">
        <span className="text-2xl text-main-strong">{event.remaining}枠</span>
        <span className="ml-2 font-normal text-sub">募集{event.capacity}人</span>
        <span
          aria-hidden="true"
          className="mt-1 block h-2.5 overflow-hidden rounded-full bg-main-tint"
        >
          <span
            className="block h-full rounded-full bg-main"
            style={{ width: `${filledRatio * 100}%` }}
          />
        </span>
      </Fact>
      <Fact term="参加費">{formatFee(event.fee)}</Fact>
      <Fact term="対象レベル">{levelsLabel(event.targetLevels)}</Fact>
    </dl>
  );
}

interface FactProps {
  term: string;
  children: ReactNode;
}

function Fact({ term, children }: FactProps) {
  return (
    <div>
      <dt className="text-muted">{term}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}

interface TextSectionProps {
  title: string;
  children: string;
}

function TextSection({ title, children }: TextSectionProps) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-bold">{title}</h2>
      <p className="whitespace-pre-line">{children}</p>
    </section>
  );
}

const CLOSED_REASONS: Record<Exclude<EventState, 'open'>, string> = {
  full: '満員のため、今は申請できません。',
  closed: '受付は終了しました。',
  ongoing: '開催中のため、申請できません。',
};

/** 立場ごとの操作（docs/10の11-3）。1つだけを目立たせる。 */
function EventActions({ event }: EventDetailProps) {
  const viewer = useViewer();

  if (event.isHost) {
    // 件数の表示・編集・締切・中止は、申請者管理（SCR-008）と合わせて加える
    return <ButtonLink to={`/events/${event.id}/applicants`}>申請者を見る</ButtonLink>;
  }
  if (event.state !== 'open') {
    return <p className="text-center font-bold text-sub">{CLOSED_REASONS[event.state]}</p>;
  }
  if (viewer) {
    // 参加の申請と質問は、次の段階（SCR-008・009）で加える
    return <p className="text-center font-bold text-sub">参加の申請は準備中です。</p>;
  }
  return <GuestActions eventId={event.id} />;
}

interface GuestActionsProps {
  eventId: string;
}

/** 未ログインの操作。ログインと新規登録への移動だけを置く（docs/10の5-3）。 */
function GuestActions({ eventId }: GuestActionsProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* ログインした後は、この画面に戻る（docs/11の追加-10） */}
      <ButtonLink to={loginPath(`/events/${eventId}`)}>ログインして申請する</ButtonLink>
      <ButtonLink to="/signup" variant="secondary">
        新規登録
      </ButtonLink>
    </div>
  );
}

interface HostLocationProps {
  eventId: string;
}

/** 主催者に見せる住所・施設名・集合場所。取得の窓口が許可した場合だけ表示する。 */
function HostLocation({ eventId }: HostLocationProps) {
  const { result, retry } = useEventLocation(eventId, true);

  return (
    <section
      aria-labelledby="event-location-heading"
      className="rounded-2xl border border-accent bg-accent-tint p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="event-location-heading" className="text-lg font-bold">
          くわしい住所
        </h2>
        <Badge tone="accent">承認された人だけ</Badge>
      </div>
      {result.status === 'loading' && (
        <p role="status" className="text-muted">
          住所を読み込んでいます
        </p>
      )}
      {result.status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>住所を読み込めませんでした。</p>
          <Button variant="secondary" size="small" onClick={retry}>
            もう一度読み込む
          </Button>
        </div>
      )}
      {result.status === 'ready' &&
        (result.location ? (
          <>
            <p className="mb-3 text-accent-ink">
              主催者のあなたと、参加が承認された人だけに表示されます。
            </p>
            <dl className="flex flex-col gap-3">
              {result.location.venueName !== null && (
                <Fact term="施設名">{result.location.venueName}</Fact>
              )}
              <Fact term="住所">{result.location.address}</Fact>
              {result.location.note !== null && (
                <Fact term="集合場所など">
                  <span className="whitespace-pre-line">{result.location.note}</span>
                </Fact>
              )}
            </dl>
          </>
        ) : (
          <p className="text-muted">住所を表示できません。</p>
        ))}
    </section>
  );
}
