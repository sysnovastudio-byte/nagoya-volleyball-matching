import { useId, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useToast } from '../../app/toastContext';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { FormField, INPUT_CLASS, RequiredMark } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { messageDay, messageTime } from '../conversations/format';
import { RATE_LIMITS } from '../safety/rateLimits';
import { REPORT_DETAIL_MAX, REPORT_REASONS, normalizeReportDetail } from './reportRules';
import { useReportRepository } from './repositoryContext';
import type { ReportReason, ReportTarget, ReportTargetKind, SubmitReportResult } from './types';

const KINDS: readonly ReportTargetKind[] = ['user', 'event', 'message'];

function isTargetKind(value: string | undefined): value is ReportTargetKind {
  return KINDS.includes(value as ReportTargetKind);
}

/**
 * SCR-019 通報（SAFE-01〜03）。ユーザー・募集・メッセージで同じ画面を使う（docs/10の追加-05）。
 * 受け付けた後は、通報を始めた画面に戻る（docs/10の6-6）。通報者が後から確かめる画面はない。
 */
export function ReportPage() {
  useDocumentTitle('通報する');
  const { kind, targetId = '' } = useParams();
  if (!isTargetKind(kind)) return <NotFoundPage />;
  return <ReportLoader key={`${kind}:${targetId}`} kind={kind} targetId={targetId} />;
}

function ReportLoader({ kind, targetId }: { kind: ReportTargetKind; targetId: string }) {
  const repository = useReportRepository();
  const { result, retry } = useResource(`report-target:${kind}:${targetId}`, () =>
    repository.getReportTarget(kind, targetId),
  );

  if (result.status === 'loading') {
    return (
      <div role="status" className="px-4 py-12 text-center text-muted">
        読み込んでいます
      </div>
    );
  }
  if (result.status === 'error') {
    return (
      <StatusMessage title="読み込めませんでした" headingLevel="h1" role="alert">
        <p>通信の状態を確認して、もう一度お試しください。</p>
        <Button onClick={retry}>もう一度読み込む</Button>
      </StatusMessage>
    );
  }
  // 見られない・自分のもの・退会した人などは、理由を分けずに示す
  if (result.value.status === 'rejected') {
    return (
      <StatusMessage title="この対象は通報できません" headingLevel="h1">
        <ButtonLink to="/" variant="secondary">
          ホームへ
        </ButtonLink>
      </StatusMessage>
    );
  }
  return <ReportForm target={result.value.target} />;
}

/** 受け付けた後に戻る画面。 */
function returnPath(target: ReportTarget) {
  switch (target.kind) {
    case 'user':
      return `/users/${target.id}`;
    case 'event':
      return `/events/${target.id}`;
    case 'message':
      return `/conversations/${target.conversationId}`;
  }
}

const SUBMIT_ERRORS: Record<Extract<SubmitReportResult, { status: 'rejected' }>['reason'], string> =
  {
    notLoggedIn: 'ログインし直してから、もう一度お試しください。',
    notFound: 'この対象は通報できません。',
    duplicate: 'この対象への通報は、すでに受け付けています。運営者の確認をお待ちください。',
    rateLimited: `通報できるのは、24時間に${RATE_LIMITS.report.max}件までです。時間をおいてお試しください。`,
    invalid: '入力の内容を確認してください。',
  };

const FAILED = '送信できませんでした。通信の状態を確認して、もう一度お試しください。';

function ReportForm({ target }: { target: ReportTarget }) {
  const repository = useReportRepository();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; detail?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const back = returnPath(target);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const normalized = normalizeReportDetail(detail);
    const next: typeof errors = {};
    if (reason === null) next.reason = '理由を選んでください。';
    if (normalized === undefined) {
      next.detail = `補足は${REPORT_DETAIL_MAX}文字以内にしてください。`;
    }
    setErrors(next);
    if (reason === null || normalized === undefined) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await repository.submitReport({
        kind: target.kind,
        targetId: target.id,
        reason,
        detail: normalized,
      });
      if (result.status === 'done') {
        toast('通報を受け付けました。');
        void navigate(back);
        return;
      }
      setFormError(SUBMIT_ERRORS[result.reason]);
    } catch {
      setFormError(FAILED);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">通報する</h1>

      {/* 緊急時の案内（docs/11の4-3） */}
      <aside
        aria-labelledby="report-emergency"
        className="mb-5 rounded-2xl border-2 border-danger bg-surface p-4"
      >
        <h2 id="report-emergency" className="mb-1 text-lg font-bold text-danger">
          身の危険を感じたときは
        </h2>
        <p>
          すぐに<strong>110番</strong>
          に連絡してください。通報は、運営者が確認するまで時間がかかることがあります。
        </p>
      </aside>

      <section aria-labelledby="report-target" className="mb-5">
        <h2 id="report-target" className="mb-2 font-bold text-muted">
          通報する対象
        </h2>
        <TargetSummary target={target} />
      </section>

      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <fieldset aria-describedby={errors.reason ? `${reasonId}-error` : undefined}>
          <legend className="mb-2 flex flex-wrap items-center gap-2 font-bold">
            理由
            <RequiredMark required />
          </legend>
          <div className="flex flex-col gap-1">
            {REPORT_REASONS.map((item) => (
              <label key={item.value} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="reason"
                  value={item.value}
                  checked={reason === item.value}
                  aria-invalid={errors.reason ? true : undefined}
                  onChange={() => {
                    setReason(item.value);
                  }}
                  className="size-5"
                />
                {item.label}
              </label>
            ))}
          </div>
          {errors.reason && (
            <p id={`${reasonId}-error`} className="font-bold text-danger">
              {errors.reason}
            </p>
          )}
        </fieldset>

        <FormField
          id="report-detail"
          label="補足"
          hint="どのような問題か、分かる範囲で書いてください。"
          error={errors.detail}
          counter={{ value: detail, max: REPORT_DETAIL_MAX }}
        >
          {(control) => (
            <textarea
              {...control}
              rows={5}
              value={detail}
              onChange={(event) => {
                setDetail(event.target.value);
              }}
              className={INPUT_CLASS}
            />
          )}
        </FormField>

        <ul className="list-disc pl-5 text-sub">
          <li>通報したことと内容は、相手に知らされません。</li>
          <li>対応の結果は、お知らせしません。</li>
        </ul>

        {formError && (
          <p role="alert" className="font-bold text-danger">
            {formError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? '送信しています' : '通報する'}
          </Button>
          <ButtonLink to={back} variant="secondary">
            やめる
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}

function TargetSummary({ target }: { target: ReportTarget }) {
  const boxClass = 'rounded-2xl border border-line bg-surface p-4';
  switch (target.kind) {
    case 'user':
      return (
        <p className={boxClass}>
          <span className="text-muted">ユーザー：</span>
          <span className="font-bold break-words">{target.nickname}</span>
        </p>
      );
    case 'event':
      return (
        <p className={boxClass}>
          <span className="text-muted">募集：</span>
          <span className="font-bold break-words">{target.title}</span>
        </p>
      );
    case 'message':
      return (
        <div className={boxClass}>
          <p className="mb-2 text-muted">
            メッセージ：{target.senderNickname ?? '退会したユーザー'}（
            {messageDay(target.createdAt)} {messageTime(target.createdAt)}）
          </p>
          <blockquote className="border-l-4 border-line pl-3 break-words whitespace-pre-line">
            {target.body}
          </blockquote>
        </div>
      );
  }
}
