import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useSession } from '../auth/sessionContext';
import { useNotificationRepository } from './repositoryContext';
import { UnreadNotificationsContext } from './unreadContext';

/**
 * 主な移動に示す、未読の通知の数（docs/10の11-5）。
 * リアルタイム配信はない（M-07）ため、画面を移るたびと、既読にした後に読み込み直す。
 * 読み込み直す間も、前の数を示したままにする（数がちらつかないように）。
 */
export function UnreadNotificationsProvider({ children }: { children: ReactNode }) {
  const repository = useNotificationRepository();
  const session = useSession();
  const { pathname } = useLocation();
  const [count, setCount] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const isMember = session.status === 'ready' && session.viewer !== null;

  useEffect(() => {
    if (!isMember) return;
    let active = true;
    repository.countUnread().then(
      (value) => {
        if (active) setCount(value);
      },
      () => {
        if (active) setCount(null);
      },
    );
    return () => {
      active = false;
    };
  }, [repository, isMember, session, pathname, revision]);

  const value = useMemo(
    () => ({
      // ログアウトした後に、前の人の数を残さない
      count: isMember ? count : null,
      refresh: () => {
        setRevision((current) => current + 1);
      },
    }),
    [isMember, count],
  );

  return <UnreadNotificationsContext value={value}>{children}</UnreadNotificationsContext>;
}
