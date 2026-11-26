import { displayName } from '../profiles/format';
import type { NotificationItem } from './types';

/** 通知の文章。種類と募集から組み立てる（docs/06の4-11）。住所・停止の理由は含めない。 */
export function notificationText(item: NotificationItem) {
  const name = !item.applicant
    ? '申請した人'
    : item.applicant.isWithdrawn
      ? displayName(item.applicant)
      : `${displayName(item.applicant)}さん`;
  switch (item.type) {
    case 'application_received':
      return `${name}が参加を申請しました。`;
    case 'participation_cancelled':
      return `${name}が参加をキャンセルしました。`;
    case 'approval_revoked':
      return '参加の承認が取り消されました。';
    case 'application_approved':
      return '参加が承認されました。';
    case 'application_rejected':
      return '参加の申請は却下されました。';
    case 'event_cancelled':
      return '募集が中止されました。';
    case 'event_hidden':
      return '募集が非表示になりました。';
  }
}

/**
 * 通知から移る先（docs/10の6-4）。参加申請・キャンセルは申請者一覧、ほかは募集詳細。
 * 非表示の募集は詳細を見られないため、移る先を示さない。
 */
export function notificationLink(item: NotificationItem) {
  if (item.event.hidden) return null;
  return item.type === 'application_received' || item.type === 'participation_cancelled'
    ? `/events/${item.event.id}/applicants`
    : `/events/${item.event.id}`;
}
