import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { BackLink, type BackState } from '../../app/BackLink';
import { useToast } from '../../app/toastContext';
import { StartConversationButton } from '../conversations/StartConversationButton';
import { useFlashToast } from '../../app/useFlashToast';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { useApplicationRepository } from '../applications/repositoryContext';
import type { ApplyRejection } from '../applications/types';
import { loginPath } from '../auth/loginRedirect';
import { useViewer } from '../auth/sessionContext';
import { EventStateBadge } from './EventStateBadge';
import { areaLabel, formatDateTimeRange, formatFee, levelsLabel } from './format';
import type { EventDetail as EventDetailData, EventState, PublicEvent } from './types';
import { useEvent } from './useEvent';
import { useEventLocation } from './useEventLocation';

/** 作成の直後に、募集詳細へ渡す印。 */
export interface EventDetailLocationState extends BackState {
  justCreated?: boolean;
}

/**
 * SCR-006 募集詳細（EVT-03・APP-01）。立場ごとの表示は docs/10の5-3。
 * 取り下げ・キャンセル・質問・通報は、サイクル1では作らない（docs/10の7-3）。
 */
export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const { result, retry, reload } = useEvent(eventId);

  switch (result.status) {
    case 'loading':
      return <LoadingMessage />;
    case 'error':
      return <ErrorMessage onRetry={retry} />;
    case 'ready':
      return result.value ? (
        // 別の募集へ移ったときに、前の募集の案内を残さない
        <EventDetail key={result.value.id} event={result.value} onChanged={reload} />
      ) : (
        <NotFoundPage />
      );
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
  /** 申請などで、募集の内容が変わったときに呼ぶ */
  onChanged: () => void;
}

function EventDetail({ event, onChanged }: EventDetailProps) {
  useDocumentTitle(event.title);
  // 作成した直後は「募集を公開しました」を通知で示す
  useFlashToast('justCreated', '募集を公開しました。');
  const apply = useApply(event.id, onChanged);
  const showLocation = event.isHost || canSeeLocation(event);

  return (
    <article className="flex grow flex-col">
      <div className="mx-auto w-full max-w-288 grow px-4 pt-2 pb-8">
        {/* 申請と募集などから来た場合は、その画面に戻る */}
        <BackLink fallback={{ to: '/', label: '募集一覧へ' }} />

        {apply.error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-danger bg-surface px-4 py-3 font-bold text-danger"
          >
            {apply.error}
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
              <EventActions event={event} apply={apply} />
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
              <p className="mb-3 font-bold">{event.hostNickname}</p>
              {/* 申請の前でも、主催者に質問できる（docs/11の3-1） */}
              <StartConversationButton event={event} />
            </section>
            {showLocation ? (
              <LocationSection eventId={event.id} isHost={event.isHost} />
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
          <EventActions event={event} apply={apply} />
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
  ended: 'この募集は終了しました。',
  cancelled: 'この募集は中止されました。',
};

/** 承認済みの参加者が住所を見られるか（docs/06の5-4）。最終的な判定は取得の窓口が行う。 */
function canSeeLocation(event: EventDetailData) {
  return (
    event.myApplication === 'approved' && event.state !== 'ended' && event.state !== 'cancelled'
  );
}

interface EventActionsProps {
  event: EventDetailData;
  apply: ApplyControl;
}

/** 立場ごとの操作（docs/10の5-3）。1つだけを目立たせる。 */
function EventActions({ event, apply }: EventActionsProps) {
  const viewer = useViewer();

  if (event.isHost) {
    // 件数の表示・編集・締切・中止は、限定公開までに加える
    return <ButtonLink to={`/events/${event.id}/applicants`}>申請者を見る</ButtonLink>;
  }
  if (event.myApplication) {
    return <MyApplicationStatus event={event} />;
  }
  if (event.state !== 'open') {
    return <p className="text-center font-bold text-sub">{CLOSED_REASONS[event.state]}</p>;
  }
  if (!viewer) return <GuestActions eventId={event.id} />;
  if (!viewer.profile) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-sub">申請するには、プロフィールの登録が必要です。</p>
        {/* 登録した後は、この画面に戻る（docs/11の追加-10） */}
        <ButtonLink
          to={`/profile/edit?${new URLSearchParams({ next: `/events/${event.id}` }).toString()}`}
        >
          プロフィールを登録する
        </ButtonLink>
      </div>
    );
  }
  return (
    <Button
      disabled={apply.submitting}
      onClick={() => {
        void apply.submit();
      }}
    >
      {apply.submitting ? '申請しています' : '参加を申請する'}
    </Button>
  );
}

/** 自分の申請の状態（docs/11の2-3）。開始後に残った承認待ちは「受付終了」と示す（docs/10の5-3）。 */
function MyApplicationStatus({ event }: { event: EventDetailData }) {
  const started = event.state === 'ongoing' || event.state === 'ended';
  const view = (() => {
    switch (event.myApplication) {
      case 'approved':
        return {
          label: '承認済み',
          text: canSeeLocation(event)
            ? '参加が承認されました。くわしい住所を表示しています。'
            : '参加が承認されていました。',
        };
      case 'pending':
        return started || event.state === 'cancelled'
          ? { label: '受付終了', text: '承認されないまま、受付が終わりました。' }
          : { label: '承認待ち', text: '申請しました。主催者の承認を待っています。' };
      case 'rejected':
        return { label: '却下', text: 'この募集への申請は却下されました。' };
      case null:
        return null;
    }
  })();
  if (!view) return null;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p>
        <span className="sr-only">あなたの申請：</span>
        <Badge tone={event.myApplication === 'approved' ? 'main' : 'neutral'}>{view.label}</Badge>
      </p>
      <p className="font-bold text-sub">{view.text}</p>
    </div>
  );
}

interface ApplyControl {
  submitting: boolean;
  /** 申請できなかった理由。申請できた場合は通知で示し、状態（承認待ち）は画面に残る */
  error: string | null;
  submit: () => Promise<void>;
}

const APPLY_ERRORS: Record<ApplyRejection, string> = {
  notLoggedIn: 'ログインしてから申請してください。',
  profileRequired: '申請するには、プロフィールの登録が必要です。',
  ownEvent: '自分の募集には申請できません。',
  alreadyApplied: 'この募集には、すでに申請しています。',
  notReapplicable: 'この募集には、もう申請できません。',
  notAccepting: '受付が終わったため、申請できませんでした。',
  full: '満員になったため、申請できませんでした。',
  rateLimited: '申請の回数の上限（1日20件）に達しました。時間をおいてお試しください。',
  notFound: 'この募集は見つかりませんでした。',
};

/** 参加の申請。結果は同じ画面に示す（docs/11の追加-09）。 */
function useApply(eventId: string, onChanged: () => void): ApplyControl {
  const repository = useApplicationRepository();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await repository.applyToEvent(eventId);
      if (result.status === 'applied') toast('参加を申請しました。');
      else setError(APPLY_ERRORS[result.reason]);
      // 申請の状態や残り枠が変わるため、読み込み直す
      onChanged();
    } catch {
      setError('申請できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, error, submit };
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

interface LocationSectionProps {
  eventId: string;
  isHost: boolean;
}

/** 主催者と承認済みの参加者に見せる住所・施設名・集合場所。取得の窓口が許可した場合だけ表示する。 */
function LocationSection({ eventId, isHost }: LocationSectionProps) {
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
              {isHost
                ? '主催者のあなたと、参加が承認された人だけに表示されます。'
                : '主催者と、参加が承認された人だけに表示されます。'}
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
