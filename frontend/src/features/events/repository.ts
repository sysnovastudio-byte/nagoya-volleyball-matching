import { lazyDev } from '../../lib/lazyDev';
import type { EventRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: EventRepository = {
  listEvents: notConnected,
  getEvent: notConnected,
  getLocation: notConnected,
  createEvent: notConnected,
};

/**
 * 開発時だけ、ダミーデータの実装を動的に読み込む。
 * 本番用のビルドでは import.meta.env.DEV が false に置き換わり、読み込みごと取り除かれる。
 * 取り除かれたことは npm run check:dist で確かめる。
 */
function createRepository(): EventRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devEventRepository,
    );
    return {
      listEvents: async (cursor) => (await repository()).listEvents(cursor),
      getEvent: async (id) => (await repository()).getEvent(id),
      getLocation: async (eventId) => (await repository()).getLocation(eventId),
      createEvent: async (input) => (await repository()).createEvent(input),
    };
  }
  return notConnectedRepository;
}

export const eventRepository = createRepository();
