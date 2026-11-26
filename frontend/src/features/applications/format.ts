import { toDateParts } from '../events/format';
import type { ApplicationStatus } from './types';

/** 申請の状態の表示（docs/11の2-3）。 */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
  cancelled: 'キャンセル',
  revoked: '承認取り消し',
  retracted: '取り下げ',
};

/** 申請の日時。「11月25日（水）12:00」の形。 */
export function formatAppliedAt(iso: string) {
  const parts = toDateParts(iso);
  return `${parts.month}月${parts.day}日（${parts.weekday}）${parts.time}`;
}
