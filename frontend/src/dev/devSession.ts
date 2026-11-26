import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devSession');

/**
 * 【開発専用】ログインしている利用者。開発用の帯で切り替える。
 * ブラウザに保存しないため、再読み込みで未ログインに戻る。
 */
export interface DevSession {
  getUserId: () => string | null;
  setUserId: (userId: string | null) => void;
  subscribe: (listener: () => void) => () => void;
  /** 利用者は同じまま、プロフィールなどが変わったことを知らせる */
  notify: () => void;
}

export function createDevSession(initialUserId: string | null = null): DevSession {
  let userId = initialUserId;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getUserId: () => userId,
    setUserId: (next) => {
      if (next === userId) return;
      userId = next;
      notify();
    },
    notify,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
