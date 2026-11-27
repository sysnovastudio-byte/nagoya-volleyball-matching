import { textLength } from '../../lib/text';
import type { ReportReason, ReportStatus, ReportTargetKind } from './types';

/** 補足の上限（docs/06の4-10）。 */
export const REPORT_DETAIL_MAX = 500;

/** 理由の選択肢と、画面の文言（docs/11の4-3）。この順に示す。 */
export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: '迷惑行為・嫌がらせ' },
  { value: 'solicitation', label: '勧誘・宣伝' },
  { value: 'falseInformation', label: '虚偽の内容' },
  { value: 'dating', label: '出会い目的' },
  { value: 'dangerousOrIllegal', label: '危険・違法な内容' },
  { value: 'personalInformation', label: '個人情報の掲載' },
  { value: 'other', label: 'その他' },
];

export function reportReasonLabel(reason: ReportReason) {
  return REPORT_REASONS.find((item) => item.value === reason)?.label ?? '';
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: '未対応',
  inProgress: '対応中',
  resolved: '対応済み',
  dismissed: '対応不要',
};

export const REPORT_TARGET_LABELS: Record<ReportTargetKind, string> = {
  user: 'ユーザー',
  event: '募集',
  message: 'メッセージ',
};

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.some((item) => item.value === value);
}

/** 補足を保存する形にする。前後の空白を除き、空なら null。上限を超えれば undefined。 */
export function normalizeReportDetail(detail: string): string | null | undefined {
  const trimmed = detail.trim();
  if (trimmed === '') return null;
  return textLength(trimmed) > REPORT_DETAIL_MAX ? undefined : trimmed;
}
