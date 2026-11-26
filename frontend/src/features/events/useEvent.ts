import { useEffect, useState } from 'react';
import { useEventRepository } from './repositoryContext';
import type { PublicEvent } from './types';

type EventResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'ready'; event: PublicEvent };

export function useEvent(eventId: string) {
  const repository = useEventRepository();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: EventResult } | null>(null);
  // 別の募集へ移ったときや、やり直したときに、前の結果を表示しない
  const key = `${attempt}:${eventId}`;

  useEffect(() => {
    let active = true;
    repository.get(eventId).then(
      (event) => {
        if (!active) return;
        setLoaded({ key, result: event ? { status: 'ready', event } : { status: 'notFound' } });
      },
      () => {
        if (active) setLoaded({ key, result: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [repository, eventId, key]);

  const result: EventResult = loaded?.key === key ? loaded.result : { status: 'loading' };
  const retry = () => {
    setAttempt((current) => current + 1);
  };

  return { result, retry };
}
