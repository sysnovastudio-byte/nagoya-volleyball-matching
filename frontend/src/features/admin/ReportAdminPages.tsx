import { useId, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useToast } from '../../app/toastContext';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { formatDateTimeRange, levelLabel, stateLabel } from '../events/format';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TRANSITIONS,
  REPORT_TARGET_LABELS,
  normalizeReportDetail,
  reportReasonLabel,
} from '../reports/reportRules';
import type { ReportReason, ReportStatus } from '../reports/types';
import { AdminDenied, AdminPage, LoadError, Loading } from './AdminParts';
import { USER_STATUS_LABELS, adminDateTime, elapsedSince, isOverdue } from './format';
import { useAdminRepository } from './repositoryContext';
import type {
  AdminActionResult,
  AdminEventView,
  AdminReportDetail,
  AdminReportSummary,
  ReportSnapshot,
  ReportStatusChange,
} from './types';

const FILTERS: readonly (ReportStatus | 'all')[] = [
  'open',
  'inProgress',
  'resolved',
  'dismissed',
  'all',
];

function filterLabel(filter: ReportStatus | 'all') {
  return filter === 'all' ? 'すべて' : REPORT_STATUS_LABELS[filter];
}

function isFilter(value: string | null): value is ReportStatus | 'all' {
  return FILTERS.includes(value as ReportStatus | 'all');
}

function statusTone(status: ReportStatus) {
  return status === 'open' ? 'accent' : status === 'inProgress' ? 'main' : 'neutral';
}

/**
 * SCR-021 通報管理の一覧（SAFE-06）。未対応の件数を示し、状態で絞り込む（追加-13）。
 * 未対応・対応中は古い順、終わった通報は新しい順に並ぶ。
 */
export function ReportListPage() {
  const repository = useAdminRepository();
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('status');
  const filter = isFilter(param) ? param : 'open';
  const { result, retry } = useResource(`admin-reports:${filter}`, () =>
    repository.listReports(filter),
  );

  return (
    <AdminPage title="通報管理">
      {result.status === 'loading' && <Loading />}
      {result.status === 'error' && <LoadError onRetry={retry} />}
      {result.status === 'ready' &&
        (result.value.status === 'denied' ? (
          <AdminDenied reason={result.value.reason} />
        ) : (
          <>
            <p className="mb-4 text-lg">
              未対応 <strong className="text-2xl">{result.value.value.openCount}</strong>件
            </p>
            <div role="group" aria-label="状態で絞り込む" className="mb-4 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <Button
                  key={item}
                  size="small"
                  variant={item === filter ? 'primary' : 'secondary'}
                  aria-pressed={item === filter}
                  onClick={() => {
                    setSearchParams(item === 'open' ? {} : { status: item });
                  }}
                >
                  {filterLabel(item)}
                </Button>
              ))}
            </div>
            <ReportList reports={result.value.value.reports} filter={filter} />
          </>
        ))}
    </AdminPage>
  );
}

function ReportList({
  reports,
  filter,
}: {
  reports: AdminReportSummary[];
  filter: ReportStatus | 'all';
}) {
  const now = new Date();
  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-muted">「{filterLabel(filter)}」の通報はありません。</p>
    );
  }
  return (
    <ul aria-label="通報の一覧" className="flex flex-col gap-2">
      {reports.map((report) => (
        <li key={report.id}>
          <Link
            to={`/admin/reports/${report.id}`}
            className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-canvas"
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(report.status)}>{REPORT_STATUS_LABELS[report.status]}</Badge>
              <span className="font-bold">
                {REPORT_TARGET_LABELS[report.kind]}の通報：{reportReasonLabel(report.reason)}
              </span>
              {report.status === 'open' && isOverdue(report.createdAt, now) && (
                <Badge tone="accent">1日以上経過</Badge>
              )}
            </span>
            <span className="text-sub">
              通報された人：{report.subjectNickname ?? '退会したユーザー'}
            </span>
            <span className="text-sm text-muted">
              受付 {adminDateTime(report.createdAt)}（{elapsedSince(report.createdAt, now)}）
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** SCR-021 通報の内容。控え・今の対象・対応の記録・募集の非表示（SAFE-06・07）。 */
export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const repository = useAdminRepository();
  const { result, retry, reload } = useResource(`admin-report:${reportId}`, () =>
    repository.getReport(reportId),
  );

  return (
    <AdminPage title="通報の内容">
      <p className="mb-4">
        <Link to="/admin/reports" className="font-bold text-main-strong underline">
          通報の一覧へ戻る
        </Link>
      </p>
      {result.status === 'loading' && <Loading />}
      {result.status === 'error' && <LoadError onRetry={retry} />}
      {result.status === 'ready' &&
        (result.value.status === 'denied' ? (
          <AdminDenied reason={result.value.reason} />
        ) : result.value.value === null ? (
          <StatusMessage title="通報が見つかりません" />
        ) : (
          <ReportDetail report={result.value.value} onChanged={reload} />
        ))}
    </AdminPage>
  );
}

function ReportDetail({ report, onChanged }: { report: AdminReportDetail; onChanged: () => void }) {
  const subjectName = report.subject.nickname ?? '退会したユーザー';
  return (
    <div className="flex flex-col gap-5">
      <Section title="受け付けた内容">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
          <Term label="状態">
            <Badge tone={statusTone(report.status)}>{REPORT_STATUS_LABELS[report.status]}</Badge>
          </Term>
          <Term label="受付">{adminDateTime(report.createdAt)}</Term>
          <Term label="対象">{REPORT_TARGET_LABELS[report.kind]}</Term>
          <Term label="理由">{reportReasonLabel(report.reason)}</Term>
          <Term label="補足">
            <span className="break-words whitespace-pre-line">
              {report.detail ?? <span className="text-muted">なし</span>}
            </span>
          </Term>
          <Term label="通報された人">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{subjectName}</span>
              <Badge tone="neutral">{USER_STATUS_LABELS[report.subject.status]}</Badge>
              <Link
                to={`/admin/users/${report.subject.userId}?${new URLSearchParams({ report: report.id }).toString()}`}
                className="inline-flex min-h-11 items-center font-bold text-main-strong underline"
              >
                利用者管理で見る
              </Link>
            </span>
          </Term>
        </dl>
      </Section>

      <Section title="控え（通報したときの内容）">
        <Snapshot snapshot={report.snapshot} />
      </Section>

      {report.event && (
        <Section title="今の募集">
          <EventView event={report.event} />
        </Section>
      )}
      {report.kind === 'user' && (
        <Section title="今のプロフィール">
          {report.profile ? (
            <dl className="flex flex-col gap-2">
              <Term label="ニックネーム">{report.profile.nickname}</Term>
              <Term label="経験レベル">{levelLabel(report.profile.experienceLevel)}</Term>
              <Term label="自己紹介">
                <span className="break-words whitespace-pre-line">
                  {report.profile.bio ?? <span className="text-muted">なし</span>}
                </span>
              </Term>
            </dl>
          ) : (
            <p className="text-muted">退会したため、プロフィールはありません。</p>
          )}
        </Section>
      )}

      <Section title="対応の記録">
        <StatusControl report={report} onChanged={onChanged} />
      </Section>

      {report.event && report.event.state !== 'hidden' && (
        <Section title="募集の非表示">
          <HideEventControl report={report} event={report.event} onChanged={onChanged} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="mb-3 text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** 控え。メッセージは本文だけ（M-05）。住所は含まれない。 */
function Snapshot({ snapshot }: { snapshot: ReportSnapshot }) {
  const quote = (text: string | null) =>
    text === null ? (
      <span className="text-muted">なし</span>
    ) : (
      <blockquote className="border-l-4 border-line pl-3 break-words whitespace-pre-line">
        {text}
      </blockquote>
    );
  switch (snapshot.kind) {
    case 'message':
      return quote(snapshot.body);
    case 'event':
      return (
        <dl className="flex flex-col gap-2">
          <Term label="タイトル">{snapshot.title}</Term>
          <Term label="説明">{quote(snapshot.description)}</Term>
        </dl>
      );
    case 'user':
      return (
        <dl className="flex flex-col gap-2">
          <Term label="ニックネーム">{snapshot.nickname}</Term>
          <Term label="自己紹介">{quote(snapshot.bio)}</Term>
        </dl>
      );
  }
}

/** 今の募集の公開項目と状態（終了・中止・非表示を含む）。住所・参加者は見せない。 */
function EventView({ event }: { event: AdminEventView }) {
  return (
    <dl className="flex flex-col gap-2">
      <Term label="状態">
        <Badge tone="neutral">
          {event.state === 'hidden' ? '非表示' : stateLabel(event.state)}
        </Badge>
      </Term>
      <Term label="タイトル">{event.title}</Term>
      <Term label="開催日時">{formatDateTimeRange(event.startsAt, event.endsAt)}</Term>
      <Term label="主催者">{event.hostNickname ?? '退会したユーザー'}</Term>
      <Term label="説明">
        <span className="break-words whitespace-pre-line">
          {event.description ?? <span className="text-muted">なし</span>}
        </span>
      </Term>
    </dl>
  );
}

const ACTION_FAILED = '記録できませんでした。通信の状態を確認して、もう一度お試しください。';

function actionError(result: Exclude<AdminActionResult, { status: 'done' }>) {
  if (result.status === 'denied') {
    return result.reason === 'mfaRequired'
      ? '多要素認証が切れました。認証し直してから、もう一度お試しください。'
      : 'この操作はできません。';
  }
  switch (result.reason) {
    case 'notFound':
      return '対象が見つかりません。';
    case 'invalidState':
      return '状態が変わったため、この操作はできません。画面を読み込み直してください。';
    case 'invalid':
      return '入力の内容を確認してください。';
  }
}

const STATUS_ACTION_LABELS: Record<ReportStatusChange, string> = {
  inProgress: '対応中にする',
  resolved: '対応済みにする',
  dismissed: '対応不要にする',
};

/** 状態の記録（docs/11の4-3）。終わった通報を対応中に戻す操作は公開後（M-05）。 */
function StatusControl({
  report,
  onChanged,
}: {
  report: AdminReportDetail;
  onChanged: () => void;
}) {
  const repository = useAdminRepository();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = REPORT_STATUS_TRANSITIONS[report.status];
  const noteError =
    normalizeReportDetail(note) === undefined
      ? `対応の記録は${REPORT_DETAIL_MAX}文字以内にしてください。`
      : undefined;

  const change = async (status: ReportStatusChange) => {
    const normalized = normalizeReportDetail(note);
    if (busy || normalized === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.updateReportStatus(report.id, { status, note: normalized });
      if (result.status === 'done') {
        toast(`「${REPORT_STATUS_LABELS[status]}」にしました。`);
        setNote('');
      } else {
        setError(actionError(result));
      }
      onChanged();
    } catch {
      setError(ACTION_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {report.resolutionNote && (
        <p className="break-words whitespace-pre-line">{report.resolutionNote}</p>
      )}
      {report.handledAt && (
        <p className="text-muted">対応が終わった日時：{adminDateTime(report.handledAt)}</p>
      )}
      {actions.length === 0 ? (
        <p className="text-muted">対応が終わった通報は、状態を戻せません。</p>
      ) : (
        <>
          <FormField
            id="report-resolution-note"
            label="対応の記録"
            hint="判断の理由など。通報者・通報された人には見えません。"
            error={noteError}
            counter={{ value: note, max: REPORT_DETAIL_MAX }}
          >
            {(control) => (
              <textarea
                {...control}
                rows={3}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                className={INPUT_CLASS}
              />
            )}
          </FormField>
          {error && (
            <p role="alert" className="font-bold text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {actions.map((status) => (
              <Button
                key={status}
                size="small"
                variant={status === 'dismissed' ? 'secondary' : 'primary'}
                disabled={busy || noteError !== undefined}
                onClick={() => {
                  void change(status);
                }}
              >
                {STATUS_ACTION_LABELS[status]}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted">対応済み・対応不要にした通報は、戻せません。</p>
        </>
      )}
    </div>
  );
}

/**
 * 募集の非表示（SAFE-07）。開催開始前の募集は同時に中止し、戻せない（M-08）。
 * 通知は、承認待ち・承認済みの人と主催者へ。終了・中止した募集では主催者だけ（DB-24）。
 */
function HideEventControl({
  report,
  event,
  onChanged,
}: {
  report: AdminReportDetail;
  event: AdminEventView;
  onChanged: () => void;
}) {
  const repository = useAdminRepository();
  const toast = useToast();
  const [reasonCode, setReasonCode] = useState<ReportReason>(report.reason);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostOnly = event.state === 'ended' || event.state === 'cancelled';
  const noteError =
    normalizeReportDetail(note) === undefined
      ? `補足は${REPORT_DETAIL_MAX}文字以内にしてください。`
      : undefined;

  const hide = async () => {
    const normalized = normalizeReportDetail(note);
    if (busy || normalized === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.hideReportedEvent(report.id, {
        reasonCode,
        reasonNote: normalized,
      });
      if (result.status === 'done') {
        toast(
          event.cancelsOnHide ? '募集を非表示にし、中止しました。' : '募集を非表示にしました。',
        );
      } else {
        setError(actionError(result));
      }
      onChanged();
    } catch {
      setError(ACTION_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="list-disc pl-5 text-sub">
        <li>一般の利用者に見えなくなります。主催者も、住所を含めて見られなくなります。</li>
        {event.cancelsOnHide && <li>開催前のため、同時に中止します。</li>}
        <li>
          {hostOnly ? '主催者にだけ通知します。' : '承認待ち・承認済みの人と、主催者に通知します。'}
        </li>
        <li className="font-bold text-danger">非表示は戻せません。</li>
      </ul>
      <label className="flex flex-col gap-1">
        <span className="font-bold">理由の分類</span>
        <select
          value={reasonCode}
          onChange={(change) => {
            setReasonCode(change.target.value as ReportReason);
          }}
          className={INPUT_CLASS}
        >
          {REPORT_REASONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <FormField
        id="hide-event-note"
        label="補足"
        error={noteError}
        counter={{ value: note, max: REPORT_DETAIL_MAX }}
      >
        {(control) => (
          <textarea
            {...control}
            rows={3}
            value={note}
            onChange={(change) => {
              setNote(change.target.value);
            }}
            className={INPUT_CLASS}
          />
        )}
      </FormField>
      {error && (
        <p role="alert" className="font-bold text-danger">
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label="非表示の確認"
          className="rounded-xl border border-danger bg-surface p-3"
        >
          <p className="mb-3 font-bold">
            「{event.title}」を非表示に{event.cancelsOnHide ? 'し、中止' : ''}しますか？戻せません。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={() => {
                void hide();
              }}
            >
              {busy ? '非表示にしています' : '非表示にする'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="danger"
            size="small"
            disabled={noteError !== undefined}
            onClick={() => {
              setConfirming(true);
            }}
          >
            この募集を非表示にする
          </Button>
        </div>
      )}
    </div>
  );
}
