import { createContext, useContext } from 'react';
import type { Viewer } from './types';

export type Session = { status: 'loading' } | { status: 'ready'; viewer: Viewer | null };

export const SessionContext = createContext<Session>({ status: 'loading' });

/** ログイン状態。表示の切り替えだけに使い、権限の判定には使わない。 */
export function useSession() {
  return useContext(SessionContext);
}

/** ログインしている人。読み込み中と未ログインは null。 */
export function useViewer() {
  const session = useSession();
  return session.status === 'ready' ? session.viewer : null;
}
