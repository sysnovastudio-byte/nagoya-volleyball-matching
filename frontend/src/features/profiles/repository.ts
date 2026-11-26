import { lazyDev } from '../../lib/lazyDev';
import type { ProfileRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: ProfileRepository = {
  getProfiles: notConnected,
  getMyProfile: notConnected,
  saveProfile: notConnected,
  changeAgeCategoryToAdult: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): ProfileRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devProfileRepository,
    );
    return {
      getProfiles: async (userIds) => (await repository()).getProfiles(userIds),
      getMyProfile: async () => (await repository()).getMyProfile(),
      saveProfile: async (input) => (await repository()).saveProfile(input),
      changeAgeCategoryToAdult: async () => (await repository()).changeAgeCategoryToAdult(),
    };
  }
  return notConnectedRepository;
}

export const profileRepository = createRepository();
