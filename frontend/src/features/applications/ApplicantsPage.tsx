import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { EventStateBadge } from '../events/EventStateBadge';
import { formatDateTimeRange } from '../events/format';
import { Avatar } from '../profiles/Avatar';
import { displayName, experienceLabel } from '../profiles/format';
import { formatAppliedAt } from './format';
import { useApplicationRepository } from './repositoryContext';
import type { Applicant, ApplicantList, DecisionRejection } from './types';
import { SegmentedControl } from './SegmentedControl';

type Tab = 'pending' | 'approved' | 'other';

const TAB_LABELS: Record<Tab, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  other: 'そのほか',
};

const EMPTY_MESSAGES: Record<Tab, string> = {
  pending: '承認待ちの申請はありません。',
  approved: '承認済みの人はいません。',
  other: '却下した申請はありません。',
};

function tabOf(applicant: Applicant): Tab {
  return applicant.status === 'rejected' ? 'other' : applicant.status;
}

/**
 * SCR-008 申請者一覧（APP-02〜05）。主催者だけが見られる。
 * 承認の取り消し（APP-11）と会話の開始（MSG-06）は、サイクル1では作らない（docs/10の7-3）。
 */
export function ApplicantsPage() {
  const { eventId = '' } = useParams();
  const repository = useApplicationRepository();
  const { result, retry, reload } = useResource(`applicants:${eventId}`, () =>
    repository.listApplicants(eventId),
  );

  switch (result.status) {
    case 'loading':
      return <Loading />;
    case 'error':
      return <LoadError onRetry={retry} />;
    case 'ready':
      switch (result.value.status) {
        case 'notFound':
          return <NotFoundPage />;
        case 'forbidden':
          return <Forbidden eventId={eventId} reason={result.value.reason} />;
        case 'ready':
          return <Applicants key={eventId} list={result.value.list} onChanged={reload} />;
      }
  }
}

function Loading() {
  useDocumentTitle('申請者一覧');
  return (
    <div role="status" className="px-4 py-12 text-center text-muted">
      申請者を読み込んでいます
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  useDocumentTitle('申請者一覧');
  return (
    <StatusMessage title="申請者を読み込めませんでした" headingLevel="h1" role="alert">
      <p>通信の状態を確認して、もう一度お試しください。</p>
      <Button onClick={onRetry}>もう一度読み込む</Button>
    </StatusMessage>
  );
}

interface ForbiddenProps {
  eventId: string;
  reason: 'notHost' | 'hidden';
}

/** 権限がない場合の表示（docs/11の追加-08）。 */
function Forbidden({ eventId, reason }: ForbiddenProps) {
  useDocumentTitle('申請者一覧');
  return (
    <StatusMessage title="申請者一覧を表示できません" headingLevel="h1">
      {reason === 'hidden' ? (
        <>
          <p>この募集は非表示になったため、申請者一覧を表示できません。</p>
          <ButtonLink to="/activity">申請と募集へ</ButtonLink>
        </>
      ) : (
        <>
          <p>申請者一覧は、募集の主催者だけが見られます。</p>
          <ButtonLink to={`/events/${eventId}`}>募集詳細へ</ButtonLink>
        </>
      )}
    </StatusMessage>
  );
}

const DECISION_ERRORS: Record<DecisionRejection, string> = {
  notFound: '申請が見つかりませんでした。',
  notPending: 'この申請は、すでに承認または却下されています。',
  full: '定員に達しているため、承認できませんでした。',
  notAccepting: '開催が始まったか、受付ができない状態のため、操作できませんでした。',
};

/** 承認・却下できない理由（docs/06の5-12）。 */
function lockedReason(list: ApplicantList) {
  switch (list.event.state) {
    case 'ongoing':
    case 'ended':
      return '開催が始まったため、承認・却下はできません。';
    case 'cancelled':
      return '中止した募集のため、承認・却下はできません。';
    default:
      return null;
  }
}

interface ApplicantsProps {
  list: ApplicantList;
  onChanged: () => void;
}

function Applicants({ list, onChanged }: ApplicantsProps) {
  useDocumentTitle(`申請者一覧：${list.event.title}`);
  const repository = useApplicationRepository();
  const [tab, setTab] = useState<Tab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const { event, applicants } = list;
  const isFull = event.approvedCount >= event.capacity;
  const remaining = Math.max(event.capacity - event.approvedCount, 0);
  const counts = { pending: 0, approved: 0, other: 0 };
  for (const applicant of applicants) counts[tabOf(applicant)] += 1;
  const shown = applicants.filter((applicant) => tabOf(applicant) === tab);
  const locked = event.canDecide ? null : lockedReason(list);

  const decide = async (applicant: Applicant, decision: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(applicant.applicationId);
    setNotice(null);
    const name = displayName(applicant.profile);
    try {
      const result =
        decision === 'approve'
          ? await repository.approveApplication(applicant.applicationId)
          : await repository.rejectApplication(applicant.applicationId);
      setNotice(
        result.status === 'done'
          ? {
              tone: 'success',
              text:
                decision === 'approve'
                  ? `${name}さんの参加を承認しました。`
                  : `${name}さんの申請を却下しました。`,
            }
          : { tone: 'error', text: DECISION_ERRORS[result.reason] },
      );
      setConfirmingId(null);
      onChanged();
    } catch {
      setNotice({
        tone: 'error',
        text: '操作できませんでした。通信の状態を確認して、もう一度お試しください。',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-200 px-4 pt-2 pb-8">
      <Link
        to={`/events/${event.id}`}
        className="inline-flex min-h-11 items-center font-bold text-main-strong hover:underline"
      >
        <span aria-hidden="true" className="mr-1">
          ‹
        </span>
        募集詳細へ
      </Link>

      <h1 className="mt-1 text-2xl font-bold">申請者一覧</h1>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <EventStateBadge state={event.state} />
        <p className="font-bold">{event.title}</p>
        <p className="text-sub">{formatDateTimeRange(event.startsAt, event.endsAt)}</p>
      </div>

      {/* 上部に定員と承認済みの数（docs/11の5-1）。定員に数えるのは承認済みだけ */}
      <section
        aria-label="定員と承認済みの数"
        className="mb-4 rounded-2xl border border-line bg-surface p-4"
      >
        <p className="font-bold">
          承認済み <span className="text-2xl text-main-strong">{event.approvedCount}</span>人
          <span className="text-sub"> ／ 定員{event.capacity}人</span>
          <span className="ml-3">残り{remaining}枠</span>
        </p>
        {isFull && counts.pending > 0 && event.canDecide && (
          <p className="mt-1 text-sub">
            定員に達したため、今は承認できません。承認待ちの申請は残り、空きが出れば承認できます。
          </p>
        )}
        {locked && <p className="mt-1 text-sub">{locked}</p>}
      </section>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-xl border px-4 py-3 font-bold ${
            notice.tone === 'error'
              ? 'border-danger bg-surface text-danger'
              : 'border-main bg-main-tint text-main-strong'
          }`}
        >
          {notice.text}
        </p>
      )}

      <SegmentedControl
        label="申請の状態"
        options={(Object.keys(TAB_LABELS) as Tab[]).map((value) => ({
          value,
          label: TAB_LABELS[value],
          detail: `${counts[value]}人`,
        }))}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setConfirmingId(null);
        }}
      />

      {shown.length === 0 ? (
        <p className="py-8 text-center text-muted">{EMPTY_MESSAGES[tab]}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((applicant) => (
            <ApplicantItem
              key={applicant.applicationId}
              applicant={applicant}
              canDecide={event.canDecide}
              canApprove={!isFull}
              busy={busyId === applicant.applicationId}
              disabled={busyId !== null}
              confirming={confirmingId === applicant.applicationId}
              onApprove={() => void decide(applicant, 'approve')}
              onAskReject={() => {
                setConfirmingId(applicant.applicationId);
              }}
              onCancelReject={() => {
                setConfirmingId(null);
              }}
              onReject={() => void decide(applicant, 'reject')}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ApplicantItemProps {
  applicant: Applicant;
  canDecide: boolean;
  canApprove: boolean;
  busy: boolean;
  disabled: boolean;
  confirming: boolean;
  onApprove: () => void;
  onAskReject: () => void;
  onCancelReject: () => void;
  onReject: () => void;
}

const STATUS_LABELS = { pending: '承認待ち', approved: '承認済み', rejected: '却下' } as const;

function ApplicantItem({
  applicant,
  canDecide,
  canApprove,
  busy,
  disabled,
  confirming,
  onApprove,
  onAskReject,
  onCancelReject,
  onReject,
}: ApplicantItemProps) {
  const { profile } = applicant;
  const name = displayName(profile);
  const experience = experienceLabel(profile);
  const showActions = canDecide && applicant.status === 'pending';

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar />
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {profile.isWithdrawn ? (
              <p className="font-bold">{name}</p>
            ) : (
              <Link
                to={`/users/${profile.userId}`}
                className="inline-flex min-h-11 items-center font-bold text-main-strong underline"
              >
                {name}
              </Link>
            )}
            <Badge tone={applicant.status === 'approved' ? 'main' : 'neutral'}>
              {STATUS_LABELS[applicant.status]}
            </Badge>
          </div>
          <dl className="mt-1 text-sub">
            {experience && (
              <div className="flex gap-2">
                <dt>経験レベル</dt>
                <dd className="font-bold text-ink">{experience}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt>申請日時</dt>
              <dd>{formatAppliedAt(applicant.appliedAt)}</dd>
            </div>
          </dl>
          {!profile.isWithdrawn && (
            <p className="mt-2 break-words whitespace-pre-line">
              {profile.bio ?? <span className="text-muted">自己紹介はありません。</span>}
            </p>
          )}
        </div>
      </div>

      {showActions &&
        (confirming ? (
          <div
            role="group"
            aria-label={`${name}さんの申請の却下の確認`}
            className="mt-3 rounded-xl border border-danger p-3"
          >
            <p className="mb-2 font-bold">
              却下すると、{name}さんはこの募集にもう申請できません。却下しますか？
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="small" disabled={disabled} onClick={onReject}>
                {busy ? '却下しています' : '却下する'}
              </Button>
              <Button variant="secondary" size="small" disabled={disabled} onClick={onCancelReject}>
                やめる
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="small"
              disabled={disabled || !canApprove}
              aria-label={`${name}さんを承認する`}
              onClick={onApprove}
            >
              {busy ? '承認しています' : '承認する'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={disabled}
              aria-label={`${name}さんの申請を却下する`}
              onClick={onAskReject}
            >
              却下する
            </Button>
          </div>
        ))}
    </li>
  );
}
