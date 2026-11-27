import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useToast } from '../../app/toastContext';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  normalizeReportDetail,
  reportReasonLabel,
} from '../reports/reportRules';
import type { ReportReason } from '../reports/types';
import { AdminDenied, AdminPage, LoadError, Loading } from './AdminParts';
import { ACTION_LABELS, USER_STATUS_LABELS, adminDateTime } from './format';
import { useAdminRepository } from './repositoryContext';
import type { AdminActionResult, AdminUserDetail, AdminUserStatus, SuspendResult } from './types';

function statusTone(status: AdminUserStatus) {
  return status === 'suspended' ? 'accent' : 'neutral';
}

/**
 * SCR-022 利用者管理の検索（SAFE-05・CND-07）。ニックネームの一部で探し、1回20件まで示す。
 * 管理者・退会した人は出ない。通報からも移れる（SCR-021）。
 */
export function UserSearchPage() {
  const repository = useAdminRepository();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [input, setInput] = useState(query);
  const { result, retry } = useResource(`admin-users:${query}`, () =>
    repository.searchUsers(query),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    setSearchParams(next === '' ? {} : { q: next });
  };

  return (
    <AdminPage title="利用者管理">
      <form role="search" onSubmit={submit} className="mb-5 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 grow flex-col gap-1">
          <span className="font-bold">ニックネーム</span>
          <input
            type="search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <Button type="submit">検索</Button>
      </form>
      {query === '' ? (
        <p className="text-muted">ニックネームの一部を入れて、検索してください。</p>
      ) : result.status === 'loading' ? (
        <Loading />
      ) : result.status === 'error' ? (
        <LoadError onRetry={retry} />
      ) : result.value.status === 'denied' ? (
        <AdminDenied reason={result.value.reason} />
      ) : result.value.value.length === 0 ? (
        <p className="py-8 text-center text-muted">「{query}」に当てはまる利用者はいません。</p>
      ) : (
        <ul aria-label="検索の結果" className="flex flex-col gap-2">
          {result.value.value.map((user) => (
            <li key={user.userId}>
              <Link
                to={`/admin/users/${user.userId}`}
                className="flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4 hover:bg-canvas"
              >
                <span className="font-bold break-words">{user.nickname}</span>
                <Badge tone={statusTone(user.status)}>{USER_STATUS_LABELS[user.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}

/**
 * SCR-022 利用者の状態と措置の履歴、停止・解除。
 * 通報されていない人は、ニックネーム・利用状態・措置の履歴だけを示す（docs/10の5-10）。
 */
export function UserDetailPage() {
  const { userId = '' } = useParams();
  const [searchParams] = useSearchParams();
  // 通報から移ってきた場合は、その通報を措置の記録に残す
  const reportId = searchParams.get('report');
  const repository = useAdminRepository();
  const { result, retry, reload } = useResource(`admin-user:${userId}`, () =>
    repository.getUser(userId),
  );

  return (
    <AdminPage title="利用者の状態">
      {result.status === 'loading' && <Loading />}
      {result.status === 'error' && <LoadError onRetry={retry} />}
      {result.status === 'ready' &&
        (result.value.status === 'denied' ? (
          <AdminDenied reason={result.value.reason} />
        ) : result.value.value === null ? (
          <StatusMessage title="利用者が見つかりません" />
        ) : (
          <UserDetail user={result.value.value} reportId={reportId} onChanged={reload} />
        ))}
    </AdminPage>
  );
}

function UserDetail({
  user,
  reportId,
  onChanged,
}: {
  user: AdminUserDetail;
  reportId: string | null;
  onChanged: () => void;
}) {
  const name = user.nickname ?? '退会したユーザー';
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-xl font-bold break-words">
          {name}
          <Badge tone={statusTone(user.status)}>{USER_STATUS_LABELS[user.status]}</Badge>
        </h2>
        {reportId && (
          <p className="text-sub">
            <Link
              to={`/admin/reports/${reportId}`}
              className="font-bold text-main-strong underline"
            >
              きっかけの通報へ戻る
            </Link>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-bold">措置の履歴</h2>
        {user.actions.length === 0 ? (
          <p className="text-muted">措置の記録はありません。</p>
        ) : (
          <ul aria-label="措置の履歴" className="flex flex-col gap-3">
            {user.actions.map((action) => (
              <li key={action.id} className="border-l-4 border-line pl-3">
                <p className="font-bold">
                  {ACTION_LABELS[action.action]}
                  {action.eventTitle && `：${action.eventTitle}`}
                </p>
                <p className="text-sm text-muted">{adminDateTime(action.createdAt)}</p>
                {action.reasonCode && <p>理由：{reportReasonLabel(action.reasonCode)}</p>}
                {action.reasonNote && (
                  <p className="break-words whitespace-pre-line text-sub">{action.reasonNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {user.status === 'active' && user.suspensionImpact && (
        <SuspendForm user={user} name={name} reportId={reportId} onChanged={onChanged} />
      )}
      {user.status === 'suspended' && (
        <UnsuspendForm user={user} name={name} onChanged={onChanged} />
      )}
    </div>
  );
}

const ACTION_FAILED = '操作できませんでした。通信の状態を確認して、もう一度お試しください。';

function actionError(result: Exclude<AdminActionResult | SuspendResult, { status: 'done' }>) {
  if (result.status === 'denied') {
    return result.reason === 'mfaRequired'
      ? '多要素認証が切れました。認証し直してから、もう一度お試しください。'
      : 'この操作はできません。';
  }
  switch (result.reason) {
    case 'notFound':
      return '利用者が見つかりません。';
    case 'invalidState':
      return '状態が変わったため、この操作はできません。画面を読み込み直してください。';
    case 'invalid':
      return '理由と補足を確認してください。';
  }
}

interface FormProps {
  user: AdminUserDetail;
  name: string;
  onChanged: () => void;
}

/**
 * 利用停止（SAFE-05）。理由の分類と補足が必須（docs/11の4-2）。
 * 開催開始前の参加・申請を取り消し、主催する開催前の募集を必ず中止する（M-03）。解除しても戻らない。
 */
function SuspendForm({ user, name, reportId, onChanged }: FormProps & { reportId: string | null }) {
  const repository = useAdminRepository();
  const toast = useToast();
  const [reasonCode, setReasonCode] = useState<ReportReason | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const impact = user.suspensionImpact;

  const validate = () => {
    const normalized = normalizeReportDetail(note);
    const next: typeof errors = {};
    if (reasonCode === '') next.reason = '理由の分類を選んでください。';
    if (normalized === null) next.note = '補足を入力してください。';
    if (normalized === undefined) next.note = `補足は${REPORT_DETAIL_MAX}文字以内にしてください。`;
    setErrors(next);
    return reasonCode !== '' && normalized ? { reasonCode, reasonNote: normalized } : null;
  };

  const suspend = async () => {
    const input = validate();
    if (busy || !input) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.suspendUser(user.userId, { ...input, reportId });
      if (result.status === 'done') {
        const { cancelledParticipations, retractedApplications, cancelledEvents } = result.impact;
        toast(
          `${name}さんを利用停止にしました。参加のキャンセル${cancelledParticipations}件・申請の取り下げ${retractedApplications}件・募集の中止${cancelledEvents}件。`,
        );
        setConfirming(false);
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

  if (!impact) return null;
  return (
    <section
      aria-labelledby="suspend-heading"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="suspend-heading" className="mb-3 text-lg font-bold">
        利用停止
      </h2>
      <p className="mb-2">停止すると、すぐに次のようになります。</p>
      <ul className="mb-3 list-disc pl-5 text-sub">
        <li>公開されている募集の閲覧と、ログアウトだけができるようになります。</li>
        <li>
          開催前の参加 <strong className="text-ink">{impact.cancelledParticipations}件</strong>
          をキャンセルし、主催者へ通知します（停止のことは伝えません）。
        </li>
        <li>
          承認待ちの申請 <strong className="text-ink">{impact.retractedApplications}件</strong>
          を取り下げます。
        </li>
        <li>
          主催する開催前の募集 <strong className="text-ink">{impact.cancelledEvents}件</strong>
          を中止し、参加者へ通知します。
        </li>
        <li className="font-bold text-danger">キャンセルと中止は、停止を解除しても戻りません。</li>
      </ul>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold">理由の分類（必須）</span>
          <select
            value={reasonCode}
            aria-invalid={errors.reason ? true : undefined}
            onChange={(event) => {
              setReasonCode(event.target.value as ReportReason | '');
            }}
            className={INPUT_CLASS}
          >
            <option value="">選んでください</option>
            {REPORT_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {errors.reason && <span className="font-bold text-danger">{errors.reason}</span>}
        </label>
        <FormField
          id="suspend-note"
          label="補足"
          required
          hint="停止の理由を記録します。本人には示しません。"
          error={errors.note}
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
        {confirming ? (
          <div
            role="group"
            aria-label="利用停止の確認"
            className="rounded-xl border border-danger bg-surface p-3"
          >
            <p className="mb-3 font-bold">
              {name}さんを利用停止にしますか？キャンセルと中止は戻せません。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="small"
                disabled={busy}
                onClick={() => {
                  void suspend();
                }}
              >
                {busy ? '停止しています' : '利用停止にする'}
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
              onClick={() => {
                if (validate()) setConfirming(true);
              }}
            >
              利用停止にする
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** 停止の解除（CND-07）。補足が必須。取り消した参加・中止した募集は戻さない（docs/11の4-2）。 */
function UnsuspendForm({ user, name, onChanged }: FormProps) {
  const repository = useAdminRepository();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsuspend = async () => {
    if (busy) return;
    const normalized = normalizeReportDetail(note);
    if (!normalized) {
      setNoteError(
        normalized === null
          ? '補足を入力してください。'
          : `補足は${REPORT_DETAIL_MAX}文字以内にしてください。`,
      );
      return;
    }
    setNoteError(undefined);
    setBusy(true);
    setError(null);
    try {
      const result = await repository.unsuspendUser(user.userId, { reasonNote: normalized });
      if (result.status === 'done') toast(`${name}さんの利用停止を解除しました。`);
      else setError(actionError(result));
      onChanged();
    } catch {
      setError(ACTION_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="unsuspend-heading"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="unsuspend-heading" className="mb-3 text-lg font-bold">
        停止の解除
      </h2>
      <p className="mb-3 text-sub">停止のときにキャンセルした参加と、中止した募集は戻りません。</p>
      <div className="flex flex-col gap-3">
        <FormField
          id="unsuspend-note"
          label="補足"
          required
          hint="解除の理由を記録します。"
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
        <div>
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() => {
              void unsuspend();
            }}
          >
            {busy ? '解除しています' : '停止を解除する'}
          </Button>
        </div>
      </div>
    </section>
  );
}
