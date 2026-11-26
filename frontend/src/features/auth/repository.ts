import { lazyDev } from '../../lib/lazyDev';
import type { AuthRepository } from './types';

/** まだ接続していない場合の実装。誰もログインしていないものとして扱う。 */
const notConnectedRepository: AuthRepository = {
  getViewer: () => Promise.resolve(null),
  onViewerChange: () => () => undefined,
  signOut: () => Promise.reject(new Error('認証の仕組みに接続していません。')),
};

/** 開発時だけ、開発用の帯で切り替えるログイン状態を読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): AuthRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devAuthRepository,
    );
    return {
      getViewer: async () => (await repository()).getViewer(),
      onViewerChange: (listener) => {
        let unsubscribe: (() => void) | undefined;
        let active = true;
        void repository().then((loaded) => {
          if (active) unsubscribe = loaded.onViewerChange(listener);
        });
        return () => {
          active = false;
          unsubscribe?.();
        };
      },
      signOut: async () => (await repository()).signOut(),
    };
  }
  return notConnectedRepository;
}

export const authRepository = createRepository();
