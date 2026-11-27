import { lazyDev } from '../../lib/lazyDev';
import type { AccountRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: AccountRepository = {
  getWithdrawalCheck: notConnected,
  withdraw: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): AccountRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devAccountRepository,
    );
    return {
      getWithdrawalCheck: async () => (await repository()).getWithdrawalCheck(),
      withdraw: async (input) => (await repository()).withdraw(input),
    };
  }
  return notConnectedRepository;
}

export const accountRepository = createRepository();
