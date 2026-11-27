import { useEffect, useState } from 'react';
import { useEventRepository } from './repositoryContext';
import type { EventLocation } from './types';

type LocationResult =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; location: EventLocation | null };

/** 開催場所住所。見てよいかは取得の窓口が決め、許可されない場合は null が返る。 */
export function useEventLocation(eventId: string, enabled: boolean) {
  const repository = useEventRepository();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: LocationResult } | null>(null);
  const key = `${attempt}:${eventId}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    repository.getLocation(eventId).then(
      (location) => {
        if (active) setLoaded({ key, result: { status: 'ready', location } });
      },
      () => {
        if (active) setLoaded({ key, result: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [repository, eventId, key, enabled]);

  const result: LocationResult = loaded?.key === key ? loaded.result : { status: 'loading' };
  const retry = () => {
    setAttempt((current) => current + 1);
  };

  return { result, retry };
}
