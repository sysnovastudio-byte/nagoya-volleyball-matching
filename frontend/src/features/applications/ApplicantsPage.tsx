import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { BackLink, backState } from '../../app/BackLink';
import { useToast } from '../../app/toastContext';
import { NotFoundPage } from '../../app/NotFoundPage';
import { PC_QUERY, useMediaQuery } from '../../app/useMediaQuery';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { EventStateBadge } from '../events/EventStateBadge';
import { EVENT_LIMITS } from '../events/eventRules';
import { ageGroupLabel } from '../profiles/profileRules';
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
 * SCR-008 申請者一覧（APP-02〜05）。主催者だけが見られる。スマートフォンはカード、PC（1024px以上）は表。
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
  full: '定員が変わったため、承認できませんでした。もう一度お試しください。',
  capacityLimit: `定員が上限の${EVENT_LIMITS.capacityMax}人のため、これ以上増やせません。`,
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
  const [confirming, setConfirming] = useState<{ id: string; kind: ConfirmKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const { event, applicants } = list;
  const isFull = event.approvedCount >= event.capacity;
  // 満員のときは、承認と同時に定員を1人増やす。上限を超える場合は承認できない
  const expandTo = isFull && event.capacity < EVENT_LIMITS.capacityMax ? event.capacity + 1 : null;
  const remaining = Math.max(event.capacity - event.approvedCount, 0);
  const counts = { pending: 0, approved: 0, other: 0 };
  for (const applicant of applicants) counts[tabOf(applicant)] += 1;
  const shown = applicants.filter((applicant) => tabOf(applicant) === tab);
  const locked = event.canDecide ? null : lockedReason(list);

  const decide = async (applicant: Applicant, decision: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(applicant.applicationId);
    setError(null);
    const name = displayName(applicant.profile);
    try {
      const result =
        decision === 'approve'
          ? await repository.approveApplication(
              applicant.applicationId,
              expandTo === null ? undefined : { expandCapacityTo: expandTo },
            )
          : await repository.rejectApplication(applicant.applicationId);
      if (result.status === 'done') {
        toast(
          decision === 'approve'
            ? expandTo === null
              ? `${name}さんの参加を承認しました。`
              : `定員を${expandTo}人に増やして、${name}さんの参加を承認しました。`
            : `${name}さんの申請を却下しました。`,
        );
      } else {
        setError(DECISION_ERRORS[result.reason]);
      }
      setConfirming(null);
      onChanged();
    } catch {
      setError('操作できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-200 px-4 pt-2 pb-8 lg:max-w-280">
      <BackLink fallback={{ to: `/events/${event.id}`, label: '募集詳細へ' }} />

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
            {expandTo === null
              ? `定員が上限の${EVENT_LIMITS.capacityMax}人に達しているため、これ以上は承認できません。`
              : '定員に達しています。承認すると、定員を1人増やします。'}
          </p>
        )}
        {locked && <p className="mt-1 text-sub">{locked}</p>}
      </section>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger bg-surface px-4 py-3 font-bold text-danger"
        >
          {error}
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
          setConfirming(null);
        }}
      />

      {shown.length === 0 ? (
        <p className="py-8 text-center text-muted">{EMPTY_MESSAGES[tab]}</p>
      ) : (
        <ApplicantCollection
          applicants={shown}
          renderActions={(applicant) => (
            <DecisionActions
              name={displayName(applicant.profile)}
              visible={event.canDecide && applicant.status === 'pending'}
              canApprove={!isFull || expandTo !== null}
              expandTo={expandTo}
              busy={busyId === applicant.applicationId}
              disabled={busyId !== null}
              confirming={confirming?.id === applicant.applicationId ? confirming.kind : null}
              onApprove={() => {
                // 定員を増やす場合は、確認してから承認する
                if (expandTo === null) void decide(applicant, 'approve');
                else setConfirming({ id: applicant.applicationId, kind: 'expand' });
              }}
              onConfirmApprove={() => void decide(applicant, 'approve')}
              onAskReject={() => {
                setConfirming({ id: applicant.applicationId, kind: 'reject' });
              }}
              onCancel={() => {
                setConfirming(null);
              }}
              onReject={() => void decide(applicant, 'reject')}
            />
          )}
        />
      )}
    </div>
  );
}

const STATUS_LABELS = { pending: '承認待ち', approved: '承認済み', rejected: '却下' } as const;

interface ApplicantCollectionProps {
  applicants: Applicant[];
  renderActions: (applicant: Applicant) => ReactNode;
}

/** スマートフォンはカード、PCは表で示す（docs/11の5-1）。同じ内容を二重に置かないよう、どちらか一方だけを出す。 */
function ApplicantCollection({ applicants, renderActions }: ApplicantCollectionProps) {
  const isPc = useMediaQuery(PC_QUERY);

  if (!isPc) {
    return (
      <ul className="mt-4 flex flex-col gap-3">
        {applicants.map((applicant) => (
          <ApplicantCard key={applicant.applicationId} applicant={applicant}>
            {renderActions(applicant)}
          </ApplicantCard>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">申請者</caption>
        <thead className="border-b border-line text-sub">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              ニックネーム
            </th>
            <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
              経験レベル
            </th>
            <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
              年代
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              自己紹介
            </th>
            <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
              申請日時
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              状態
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {applicants.map((applicant) => (
            <tr
              key={applicant.applicationId}
              className="border-b border-line align-top last:border-b-0"
            >
              <th scope="row" className="px-4 py-3 text-left">
                <span className="flex items-center gap-2">
                  <Avatar />
                  <ApplicantName applicant={applicant} />
                </span>
              </th>
              <td className="px-4 py-3 font-bold whitespace-nowrap">
                {experienceLabel(applicant.profile) ?? '－'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <AgeGroupText applicant={applicant} />
              </td>
              <td className="max-w-96 min-w-48 px-4 py-3 break-words whitespace-pre-line">
                <ApplicantBio applicant={applicant} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sub">
                {formatAppliedAt(applicant.appliedAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge applicant={applicant} />
              </td>
              <td className="w-64 px-4 py-3">{renderActions(applicant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicantName({ applicant }: { applicant: Applicant }) {
  const { eventId = '' } = useParams();
  const { profile } = applicant;
  const name = displayName(profile);
  return profile.isWithdrawn ? (
    <span className="font-bold">{name}</span>
  ) : (
    <Link
      to={`/users/${profile.userId}`}
      // プロフィールから、この申請者一覧に戻れるようにする
      state={backState(`/events/${eventId}/applicants`, '申請者一覧へ')}
      className="inline-flex min-h-11 items-center font-bold text-main-strong underline"
    >
      {name}
    </Link>
  );
}

/**
 * 年代は主催者だけに、承認待ち・承認済みの人の分を終了日時まで示す（docs/06の4-13）。
 * 見られない場合は「－」、未選択は「未選択」とする。
 */
function AgeGroupText({ applicant }: { applicant: Applicant }) {
  const { hostOnly } = applicant;
  if (!hostOnly) return <span className="text-muted">－</span>;
  if (!hostOnly.ageGroup) return <span className="text-muted">未選択</span>;
  return <span className="font-bold text-ink">{ageGroupLabel(hostOnly.ageGroup)}</span>;
}

function ApplicantBio({ applicant }: { applicant: Applicant }) {
  const { profile } = applicant;
  if (profile.isWithdrawn) return null;
  return profile.bio ?? <span className="text-muted">自己紹介はありません。</span>;
}

function StatusBadge({ applicant }: { applicant: Applicant }) {
  return (
    <Badge tone={applicant.status === 'approved' ? 'main' : 'neutral'}>
      {STATUS_LABELS[applicant.status]}
    </Badge>
  );
}

interface ApplicantCardProps {
  applicant: Applicant;
  /** 承認・却下の操作 */
  children: ReactNode;
}

function ApplicantCard({ applicant, children }: ApplicantCardProps) {
  const experience = experienceLabel(applicant.profile);

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar />
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ApplicantName applicant={applicant} />
            <StatusBadge applicant={applicant} />
          </div>
          <dl className="mt-1 text-sub">
            {experience && (
              <div className="flex gap-2">
                <dt>経験レベル</dt>
                <dd className="font-bold text-ink">{experience}</dd>
              </div>
            )}
            {applicant.hostOnly && (
              <div className="flex gap-2">
                <dt>年代</dt>
                <dd>
                  <AgeGroupText applicant={applicant} />
                </dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt>申請日時</dt>
              <dd>{formatAppliedAt(applicant.appliedAt)}</dd>
            </div>
          </dl>
          <p className="mt-2 break-words whitespace-pre-line">
            <ApplicantBio applicant={applicant} />
          </p>
        </div>
      </div>
      <div className="mt-3 empty:hidden">{children}</div>
    </li>
  );
}

type ConfirmKind = 'reject' | 'expand';

interface DecisionActionsProps {
  name: string;
  /** 承認待ちで、承認・却下できる期間の場合だけ出す */
  visible: boolean;
  canApprove: boolean;
  /** 満員の場合に、承認と同時に増やした後の定員。満員でなければ null */
  expandTo: number | null;
  busy: boolean;
  disabled: boolean;
  confirming: ConfirmKind | null;
  onApprove: () => void;
  onConfirmApprove: () => void;
  onAskReject: () => void;
  onCancel: () => void;
  onReject: () => void;
}

/**
 * 承認・却下。却下は取り消せないため確認を挟む（docs/11の5-1）。
 * 満員の募集で承認するときは、定員を増やすことを確認する（docs/11の2-2）。
 */
function DecisionActions({
  name,
  visible,
  canApprove,
  expandTo,
  busy,
  disabled,
  confirming,
  onApprove,
  onConfirmApprove,
  onAskReject,
  onCancel,
  onReject,
}: DecisionActionsProps) {
  if (!visible) return null;
  if (confirming === 'reject') {
    return (
      <div
        role="group"
        aria-label={`${name}さんの申請の却下の確認`}
        className="rounded-xl border border-danger p-3"
      >
        <p className="mb-2 font-bold">
          却下すると、{name}さんはこの募集にもう申請できません。却下しますか？
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="small" disabled={disabled} onClick={onReject}>
            {busy ? '却下しています' : '却下する'}
          </Button>
          <Button variant="secondary" size="small" disabled={disabled} onClick={onCancel}>
            やめる
          </Button>
        </div>
      </div>
    );
  }
  if (confirming === 'expand' && expandTo !== null) {
    return (
      <div
        role="group"
        aria-label={`${name}さんの承認の確認`}
        className="rounded-xl border border-main p-3"
      >
        <p className="mb-2 font-bold">定員を{expandTo}人に増やして承認します。よろしいですか？</p>
        <div className="flex flex-wrap gap-2">
          <Button size="small" disabled={disabled} onClick={onConfirmApprove}>
            {busy ? '承認しています' : `定員を${expandTo}人にして承認する`}
          </Button>
          <Button variant="secondary" size="small" disabled={disabled} onClick={onCancel}>
            やめる
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
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
  );
}
