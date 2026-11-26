import { createContext, useContext } from 'react';

export interface UnreadNotifications {
  /** 未読の数。読み込む前と、読み込めなかった場合は null（数を示さない） */
  count: number | null;
  /** 既読にした後などに、数を読み込み直す */
  refresh: () => void;
}

export const UnreadNotificationsContext = createContext<UnreadNotifications>({
  count: null,
  refresh: () => undefined,
});

export function useUnreadNotifications() {
  return useContext(UnreadNotificationsContext);
}
