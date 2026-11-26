import { lazyDev } from '../../lib/lazyDev';
import type { AuthRepository } from './types';

/** 認証の仕組みに接続していない。画面は、通信の失敗と分けて案内する。 */
export class AuthNotConnectedError extends Error {
  constructor() {
    super('認証の仕組みに接続していません。');
    this.name = 'AuthNotConnectedError';
  }
}

const notConnected = () => Promise.reject(new AuthNotConnectedError());

/**
 * まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。
 * 誰もログインしていないものとして扱い、ログイン・登録・認証は「接続していません」の失敗にする。
 */
export const notConnectedAuthRepository: AuthRepository = {
  getViewer: () => Promise.resolve(null),
  onViewerChange: () => () => undefined,
  signIn: notConnected,
  signUp: notConnected,
  verifyEmail: notConnected,
  signOut: notConnected,
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
      signIn: async (input) => (await repository()).signIn(input),
      signUp: async (input) => (await repository()).signUp(input),
      verifyEmail: async (token) => (await repository()).verifyEmail(token),
      signOut: async () => (await repository()).signOut(),
    };
  }
  return notConnectedAuthRepository;
}

export const authRepository = createRepository();
