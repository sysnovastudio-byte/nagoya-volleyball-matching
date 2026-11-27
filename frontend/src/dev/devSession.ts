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
  /**
   * 管理者（ダミー）の多要素認証が済んでいるか（本番では Supabase Auth の aal2）。帯で「済・未」を選ぶ。
   * **本物の多要素認証ではない。**
   */
  getMfaVerified: () => boolean;
  setMfaVerified: (verified: boolean) => void;
}

export function createDevSession(
  initialUserId: string | null = null,
  { mfaVerified: initialMfa = true }: { mfaVerified?: boolean } = {},
): DevSession {
  let userId = initialUserId;
  let mfaVerified = initialMfa;
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
    getMfaVerified: () => mfaVerified,
    setMfaVerified: (next) => {
      if (next === mfaVerified) return;
      mfaVerified = next;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
