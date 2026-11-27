import type { BadgeTone } from '../../components/ui/Badge';
import { toDateParts } from '../events/format';
import type { ReportStatus } from '../reports/types';
import type { AdminUserStatus, ModerationActionType } from './types';

export const USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: '利用中',
  suspended: '利用停止中',
  withdrawn: '退会',
};

/** 通報の状態の色（docs/11の5-2「状態の色」）。 */
export const REPORT_STATUS_TONES: Record<ReportStatus, BadgeTone> = {
  open: 'accent',
  inProgress: 'mainTint',
  resolved: 'successTint',
  dismissed: 'neutral',
};

/** 利用者の状態の色（docs/11の5-2「状態の色」）。 */
export const USER_STATUS_TONES: Record<AdminUserStatus, BadgeTone> = {
  active: 'successTint',
  suspended: 'danger',
  withdrawn: 'outline',
};

export const ACTION_LABELS: Record<ModerationActionType, string> = {
  suspend: '利用停止',
  unsuspend: '停止の解除',
  hideEvent: '募集の非表示',
  cancelEventBySuspension: '停止による募集の中止',
};

/** 「11/25（水） 9:05」の形（日本時間）。 */
export function adminDateTime(iso: string) {
  const parts = toDateParts(iso);
  return `${parts.month}/${parts.day}（${parts.weekday}） ${parts.time}`;
}

const HOUR_MS = 60 * 60 * 1000;

/** 受付からの経過。出会い目的の通報を1日以内に確かめるため（docs/11の7-4）。 */
export function elapsedSince(iso: string, now: Date) {
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / HOUR_MS);
  if (hours < 1) return '1時間以内';
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

/** 1日以上、未対応のままか。 */
export function isOverdue(iso: string, now: Date) {
  return now.getTime() - new Date(iso).getTime() >= 24 * HOUR_MS;
}
