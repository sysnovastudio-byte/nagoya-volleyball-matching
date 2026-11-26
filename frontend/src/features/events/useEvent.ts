import { useEffect, useState } from 'react';
import { useSession } from '../auth/sessionContext';
import { useEventRepository } from './repositoryContext';
import type { EventDetail } from './types';

type EventResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'ready'; event: EventDetail };

export function useEvent(eventId: string) {
  const repository = useEventRepository();
  // 見ている人が変わると、主催者かどうかなどが変わるため、読み込み直す
  const session = useSession();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    session: typeof session;
    result: EventResult;
  } | null>(null);
  // 別の募集へ移ったときや、やり直したときに、前の結果を表示しない
  const key = `${attempt}:${eventId}`;

  useEffect(() => {
    if (session.status === 'loading') return;
    let active = true;
    repository.getEvent(eventId).then(
      (event) => {
        if (!active) return;
        setLoaded({
          key,
          session,
          result: event ? { status: 'ready', event } : { status: 'notFound' },
        });
      },
      () => {
        if (active) setLoaded({ key, session, result: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [repository, eventId, key, session]);

  const result: EventResult =
    loaded?.key === key && loaded.session === session ? loaded.result : { status: 'loading' };
  const retry = () => {
    setAttempt((current) => current + 1);
  };

  return { result, retry };
}
