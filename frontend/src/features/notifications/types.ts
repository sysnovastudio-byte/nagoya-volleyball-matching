import type { PublicProfile } from '../profiles/types';

/**
 * 通知の種類（docs/06の4-11・14-1）。MVPでは、募集の変更（event_changed）と
 * 非表示の取り消し（event_unhidden）を作らない（M-02・M-08、2026-11-26）。
 */
export type NotificationType =
  /** 参加申請（NTF-01）。主催者へ */
  | 'application_received'
  /** キャンセル（NTF-02）。主催者へ */
  | 'participation_cancelled'
  /** 承認の取り消し（NTF-03）。参加者へ */
  | 'approval_revoked'
  /** 承認・却下（CND-04）。申請者へ */
  | 'application_approved'
  | 'application_rejected'
  /** 中止（NTF-04）。承認待ち・承認済みの人へ */
  | 'event_cancelled'
  /** 管理者による非表示（NTF-04）。承認待ち・承認済みの人と主催者へ */
  | 'event_hidden';

/** 通知に出す募集。非表示の募集は開催日時だけ（docs/11の4-4）。 */
export type NotificationEvent =
  | { hidden: false; id: string; title: string; startsAt: string; endsAt: string }
  | { hidden: true; startsAt: string; endsAt: string };

/**
 * 通知1件。文章は保存せず、種類と募集から画面で組み立てる（docs/06の4-11）。
 * 住所・メールアドレス・停止の理由は含めない（docs/11の3-2）。
 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  event: NotificationEvent;
  /**
   * 申請した人・キャンセルした人。主催者への通知（参加申請・キャンセル）だけに入れ、ほかは null。
   * 主催者は申請者一覧で同じ人を見られるため、新しく見せる情報はない
   */
  applicant: PublicProfile | null;
  createdAt: string;
  read: boolean;
}

/**
 * 通知の窓口。将来は notifications の読み取り（本人だけ、RLS）と、
 * docs/06の6-5の mark_notifications_read を呼ぶ実装に置き換える。
 * 受け取る人は、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 */
export interface NotificationRepository {
  /** 自分の通知。新しい順。作成から90日を過ぎたものは返さない（DB-02）。未ログインは空を返す。 */
  listMine(): Promise<NotificationItem[]>;
  /** 自分の未読の数。主な移動に示す */
  countUnread(): Promise<number>;
  /** 自分の通知を既読にする。他人の通知のIDは無視する */
  markRead(notificationIds: string[]): Promise<void>;
}
