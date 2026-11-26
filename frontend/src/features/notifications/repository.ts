import { lazyDev } from '../../lib/lazyDev';
import type { NotificationRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: NotificationRepository = {
  listMine: notConnected,
  countUnread: notConnected,
  markRead: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): NotificationRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devNotificationRepository,
    );
    return {
      listMine: async () => (await repository()).listMine(),
      countUnread: async () => (await repository()).countUnread(),
      markRead: async (ids) => (await repository()).markRead(ids),
    };
  }
  return notConnectedRepository;
}

export const notificationRepository = createRepository();
