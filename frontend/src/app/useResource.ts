import { useEffect, useEffectEvent, useState } from 'react';
import { useSession } from '../features/auth/sessionContext';

export type Resource<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

/**
 * 取得の窓口から読み込む。見ている人が変わると、見られる内容が変わるため読み込み直す。
 * - retry：読み込み中の表示に戻して、やり直す（失敗の後に使う）
 * - reload：今の表示を残したまま、読み込み直す（操作の結果を反映する）
 * @param key 読み込む対象。変わると、前の結果を表示しない
 */
export function useResource<T>(key: string, load: () => Promise<T>) {
  const session = useSession();
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    session: typeof session;
    result: Resource<T>;
  } | null>(null);
  const fullKey = `${attempt}:${key}`;
  const runLoad = useEffectEvent(load);

  useEffect(() => {
    if (session.status === 'loading') return;
    let active = true;
    runLoad().then(
      (value) => {
        if (active) setLoaded({ key: fullKey, session, result: { status: 'ready', value } });
      },
      () => {
        if (active) setLoaded({ key: fullKey, session, result: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [fullKey, session, revision]);

  const result: Resource<T> =
    loaded?.key === fullKey && loaded.session === session ? loaded.result : { status: 'loading' };

  return {
    result,
    retry: () => {
      setAttempt((current) => current + 1);
    },
    reload: () => {
      setRevision((current) => current + 1);
    },
  };
}
