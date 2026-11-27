import { lazyDev } from '../../lib/lazyDev';
import type { BlockRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: BlockRepository = {
  getBlockState: notConnected,
  block: notConnected,
  unblock: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): BlockRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devBlockRepository,
    );
    return {
      getBlockState: async (userId) => (await repository()).getBlockState(userId),
      block: async (userId) => (await repository()).block(userId),
      unblock: async (userId) => (await repository()).unblock(userId),
    };
  }
  return notConnectedRepository;
}

export const blockRepository = createRepository();
