import { useEffect, useEffectEvent } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { formatAppliedAt } from '../applications/format';
import { formatDateTimeRange } from '../events/format';
import { notificationLink, notificationText } from './format';
import { useNotificationRepository } from './repositoryContext';
import type { NotificationItem } from './types';
import { useUnreadNotifications } from './unreadContext';

/**
 * SCR-012 通知一覧（NTF-01〜04、CND-04）。アプリ内だけで知らせ、通知詳細の画面は設けない（docs/10の5-6）。
 * 開いた時点で未読だった通知に「未読」を示し、表示したものを既読にする。
 */
export function NotificationsPage() {
  useDocumentTitle('通知');
  const repository = useNotificationRepository();
  const { result, retry } = useResource('my-notifications', () => repository.listMine());

  return (
    <div className="mx-auto w-full max-w-200 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">通知</h1>
      {result.status === 'loading' && (
        <p role="status" className="py-6 text-center text-muted">
          通知を読み込んでいます
        </p>
      )}
      {result.status === 'error' && (
        <StatusMessage title="通知を読み込めませんでした" role="alert">
          <p>通信の状態を確認して、もう一度お試しください。</p>
          <Button onClick={retry}>もう一度読み込む</Button>
        </StatusMessage>
      )}
      {result.status === 'ready' && <NotificationList items={result.value} />}
    </div>
  );
}

function NotificationList({ items }: { items: NotificationItem[] }) {
  const repository = useNotificationRepository();
  const unread = useUnreadNotifications();
  const unreadIds = items.filter((item) => !item.read).map((item) => item.id);
  const unreadKey = unreadIds.join(',');

  // 表示した未読を既読にし、主な移動の数を読み込み直す。失敗しても、次に開いたときにまた試す
  const markShownAsRead = useEffectEvent(() => {
    if (unreadIds.length === 0) return;
    repository.markRead(unreadIds).then(unread.refresh, () => undefined);
  });
  useEffect(() => {
    markShownAsRead();
  }, [unreadKey]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-muted">まだ通知はありません。</p>
        <ButtonLink to="/" variant="secondary" size="small">
          募集を探す
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} />
        ))}
      </ul>
      {/* 作成から90日で削除する（DB-02） */}
      <p className="mt-6 text-center text-muted">通知は、届いてから90日で消えます。</p>
    </>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const link = notificationLink(item);
  const { event } = item;
  const text = notificationText(item);

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 ${item.read ? 'border-line' : 'border-main'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!item.read && (
          // 色だけに頼らず、文字でも示す（docs/11の5-1）
          <span className="inline-flex items-center gap-1 font-bold text-main-strong">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-main" />
            未読
          </span>
        )}
        <p className="font-bold">
          {link ? (
            <Link
              to={link}
              className="inline-flex min-h-11 items-center text-main-strong underline"
            >
              {text}
            </Link>
          ) : (
            text
          )}
        </p>
      </div>
      {/* 非表示の募集は、名前の代わりに「非表示になった募集」と開催日時だけを示す（docs/11の4-4） */}
      <p className="text-sub">
        {event.hidden ? '非表示になった募集' : event.title}
        <span className="mx-1">・</span>
        {formatDateTimeRange(event.startsAt, event.endsAt)}
      </p>
      <p className="mt-1 text-muted">
        <time dateTime={item.createdAt}>{formatAppliedAt(item.createdAt)}</time>
      </p>
    </li>
  );
}
