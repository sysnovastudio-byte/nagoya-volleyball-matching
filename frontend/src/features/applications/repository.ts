import { lazyDev } from '../../lib/lazyDev';
import type { ApplicationRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: ApplicationRepository = {
  applyToEvent: notConnected,
  approveApplication: notConnected,
  rejectApplication: notConnected,
  listApplicants: notConnected,
  getMyParticipations: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): ApplicationRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devApplicationRepository,
    );
    return {
      applyToEvent: async (eventId) => (await repository()).applyToEvent(eventId),
      approveApplication: async (id, options) =>
        (await repository()).approveApplication(id, options),
      rejectApplication: async (id) => (await repository()).rejectApplication(id),
      listApplicants: async (eventId) => (await repository()).listApplicants(eventId),
      getMyParticipations: async () => (await repository()).getMyParticipations(),
    };
  }
  return notConnectedRepository;
}

export const applicationRepository = createRepository();
