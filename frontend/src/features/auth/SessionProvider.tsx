import { useEffect, useState, type ReactNode } from 'react';
import { useAuthRepository } from './repositoryContext';
import { SessionContext, type Session } from './sessionContext';

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const repository = useAuthRepository();
  const [session, setSession] = useState<Session>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const load = () => {
      repository.getViewer().then(
        (viewer) => {
          if (active) setSession({ status: 'ready', viewer });
        },
        // 確かめられない場合は、未ログインとして扱う（見せる範囲を広げない）
        () => {
          if (active) setSession({ status: 'ready', viewer: null });
        },
      );
    };
    load();
    const unsubscribe = repository.onViewerChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return <SessionContext value={session}>{children}</SessionContext>;
}
