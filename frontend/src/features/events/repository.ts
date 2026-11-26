import type { EventRepository } from './types';

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: EventRepository = {
  list: () => Promise.reject(new Error('データの取得先に接続していません。')),
  get: () => Promise.reject(new Error('データの取得先に接続していません。')),
};

/**
 * 開発時だけ、ダミーデータの実装を動的に読み込む。
 * 本番用のビルドでは import.meta.env.DEV が false に置き換わり、読み込みごと取り除かれる。
 * 取り除かれたことは npm run check:dist で確かめる。
 */
function createRepository(): EventRepository {
  if (import.meta.env.DEV) {
    const load = async () => {
      const { createDevEventRepository } = await import('./dev/devEventRepository');
      return createDevEventRepository();
    };
    let loading: Promise<EventRepository> | undefined;
    const repository = () => (loading ??= load());

    return {
      list: async (cursor) => (await repository()).list(cursor),
      get: async (id) => (await repository()).get(id),
    };
  }
  return notConnectedRepository;
}

export const eventRepository = createRepository();
