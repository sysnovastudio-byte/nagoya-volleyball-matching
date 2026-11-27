import { useId, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useToast } from '../../app/toastContext';
import { NotFoundPage } from '../../app/NotFoundPage';
import { PC_QUERY, useMediaQuery } from '../../app/useMediaQuery';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { StartApplicantConversationButton } from '../conversations/StartApplicantConversationButton';
import { EventStateBadge } from '../events/EventStateBadge';
import { EVENT_LIMITS } from '../events/eventRules';
import { ageGroupLabel, genderLabel } from '../profiles/profileRules';
import { formatDateTimeRange } from '../events/format';
import { Avatar } from '../profiles/Avatar';
import { displayName, experienceLabel } from '../profiles/format';
import { APPLICATION_STATUS_LABELS, formatAppliedAt, REVOKE_REASON_LABELS } from './format';
import { useApplicationRepository } from './repositoryContext';
import {
  REVOKE_REASONS,
  type Applicant,
  type ApplicantList,
  type DecisionRejection,
  type RevokeReason,
  type RevokeRejection,
} from './types';
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
  other: 'そのほかの申請はありません。',
};

/** 却下・キャンセル・承認取り消し・取り下げは「そのほか」に示す（docs/10の11-3）。 */
function tabOf(applicant: Applicant): Tab {
  return applicant.status === 'pending' || applicant.status === 'approved'
    ? applicant.status
    : 'other';
}

/**
 * SCR-008 申請者一覧（APP-02〜05・APP-11・MSG-06）。主催者だけが見られる。
 * スマートフォンはカード、PC（1024px以上）は表。
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

const REVOKE_ERRORS: Record<RevokeRejection, string> = {
  notFound: '申請が見つかりませんでした。',
  notApproved: 'この参加は、すでにキャンセルまたは取り消しされています。',
  reasonRequired: '取り消しの理由を選んでください。',
  notAccepting: '開催が始まったか、受付ができない状態のため、操作できませんでした。',
};

/** 承認・却下できない理由（docs/06の5-12）。 */
function lockedReason(list: ApplicantList) {
  switch (list.event.state) {
    case 'ongoing':
    case 'ended':
      return '開催が始まったため、承認・却下・承認の取り消しはできません。';
    case 'cancelled':
      return '中止した募集のため、承認・却下・承認の取り消しはできません。';
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

  const revoke = async (applicant: Applicant, reason: RevokeReason) => {
    if (busyId) return;
    setBusyId(applicant.applicationId);
    setError(null);
    try {
      const result = await repository.revokeApproval(applicant.applicationId, reason);
      if (result.status === 'done') {
        toast(`${displayName(applicant.profile)}さんの承認を取り消しました。`);
      } else {
        setError(REVOKE_ERRORS[result.reason]);
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
          renderActions={(applicant) => {
            const isConfirming = confirming?.id === applicant.applicationId;
            // 主催者からの会話は、承認待ち・承認済みの人とだけ始められる（docs/11の3-1）
            const conversation = (applicant.status === 'pending' ||
              applicant.status === 'approved') &&
              !applicant.profile.isWithdrawn && (
                <StartApplicantConversationButton
                  applicationId={applicant.applicationId}
                  name={displayName(applicant.profile)}
                  eventEndsAt={event.endsAt}
                />
              );
            if (applicant.status === 'approved') {
              return (
                <>
                  <RevokeActions
                    name={displayName(applicant.profile)}
                    visible={event.canDecide}
                    busy={busyId === applicant.applicationId}
                    disabled={busyId !== null}
                    confirming={isConfirming && confirming.kind === 'revoke'}
                    onAsk={() => {
                      setConfirming({ id: applicant.applicationId, kind: 'revoke' });
                    }}
                    onCancel={() => {
                      setConfirming(null);
                    }}
                    onRevoke={(reason) => void revoke(applicant, reason)}
                  />
                  {conversation}
                </>
              );
            }
            return (
              <>
                <DecisionActions
                  name={displayName(applicant.profile)}
                  visible={event.canDecide && applicant.status === 'pending'}
                  canApprove={!isFull || expandTo !== null}
                  expandTo={expandTo}
                  busy={busyId === applicant.applicationId}
                  disabled={busyId !== null}
                  confirming={isConfirming ? confirming.kind : null}
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
                {conversation}
              </>
            );
          }}
        />
      )}
    </div>
  );
}

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
            <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
              性別
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
                <OptionalItem applicant={applicant} item="ageGroup" />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <OptionalItem applicant={applicant} item="gender" />
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
              <td className="w-64 px-4 py-3">
                <div className="flex flex-col items-start gap-2">{renderActions(applicant)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicantName({ applicant }: { applicant: Applicant }) {
  const { profile } = applicant;
  const name = displayName(profile);
  return profile.isWithdrawn ? (
    <span className="font-bold">{name}</span>
  ) : (
    <Link
      to={`/users/${profile.userId}`}
      className="inline-flex min-h-11 items-center font-bold text-main-strong underline"
    >
      {name}
    </Link>
  );
}

/**
 * 年代・性別（任意の項目）。ログインした人全員に公開する（2026-11-27の決定）。
 * 退会した人は「－」、未選択は「未選択」とする。
 */
function OptionalItem({ applicant, item }: { applicant: Applicant; item: 'ageGroup' | 'gender' }) {
  const { profile } = applicant;
  if (profile.isWithdrawn) return <span className="text-muted">－</span>;
  const label =
    item === 'ageGroup'
      ? profile.ageGroup && ageGroupLabel(profile.ageGroup)
      : profile.gender && genderLabel(profile.gender);
  if (!label) return <span className="text-muted">未選択</span>;
  return <span className="font-bold text-ink">{label}</span>;
}

function ApplicantBio({ applicant }: { applicant: Applicant }) {
  const { profile } = applicant;
  if (profile.isWithdrawn) return null;
  return profile.bio ?? <span className="text-muted">自己紹介はありません。</span>;
}

function StatusBadge({ applicant }: { applicant: Applicant }) {
  return (
    <Badge tone={applicant.status === 'approved' ? 'main' : 'neutral'}>
      {APPLICATION_STATUS_LABELS[applicant.status]}
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
            {!applicant.profile.isWithdrawn && (
              <>
                <div className="flex gap-2">
                  <dt>年代</dt>
                  <dd>
                    <OptionalItem applicant={applicant} item="ageGroup" />
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt>性別</dt>
                  <dd>
                    <OptionalItem applicant={applicant} item="gender" />
                  </dd>
                </div>
              </>
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
      <div className="mt-3 flex flex-col items-start gap-2 empty:hidden">{children}</div>
    </li>
  );
}

type ConfirmKind = 'reject' | 'expand' | 'revoke';

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

interface RevokeActionsProps {
  name: string;
  /** 承認済みで、操作できる期間の場合だけ出す */
  visible: boolean;
  busy: boolean;
  disabled: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onRevoke: (reason: RevokeReason) => void;
}

/**
 * 承認の取り消し（APP-11）。理由を選び、確認してから行う（docs/10の11-3）。
 * 相手が再申請できなくなることと、住所を見られなくなることを示す。
 */
function RevokeActions({
  name,
  visible,
  busy,
  disabled,
  confirming,
  onAsk,
  onCancel,
  onRevoke,
}: RevokeActionsProps) {
  const [reason, setReason] = useState<RevokeReason | null>(null);
  const groupName = useId();
  if (!visible) return null;
  if (!confirming) {
    return (
      <Button
        variant="secondary"
        size="small"
        disabled={disabled}
        aria-label={`${name}さんの承認を取り消す`}
        onClick={() => {
          setReason(null);
          onAsk();
        }}
      >
        承認を取り消す
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={`${name}さんの承認の取り消しの確認`}
      className="rounded-xl border border-danger p-3"
    >
      <p className="mb-2 font-bold">
        取り消すと、{name}
        さんはくわしい住所を見られなくなり、この募集にもう申請できません。{name}さんに通知します。
      </p>
      <fieldset className="mb-3">
        <legend className="mb-1 font-bold">
          取り消しの理由<span className="ml-1 text-danger">（必須）</span>
        </legend>
        <p className="mb-1 text-sub">理由は記録に残り、{name}さんへの通知には含めません。</p>
        <div className="flex flex-col">
          {REVOKE_REASONS.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={groupName}
                value={value}
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                }}
                className="size-5"
              />
              {REVOKE_REASON_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="small"
          disabled={disabled || reason === null}
          onClick={() => {
            if (reason) onRevoke(reason);
          }}
        >
          {busy ? '取り消しています' : '承認を取り消す'}
        </Button>
        <Button variant="secondary" size="small" disabled={disabled} onClick={onCancel}>
          やめる
        </Button>
      </div>
      {reason === null && <p className="mt-2 text-sub">理由を選ぶと、取り消せます。</p>}
    </div>
  );
}
