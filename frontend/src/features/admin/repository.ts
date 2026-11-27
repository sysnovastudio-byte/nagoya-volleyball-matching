import { lazyDev } from '../../lib/lazyDev';
import type { AdminRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: AdminRepository = {
  getAccess: notConnected,
  listReports: notConnected,
  getReport: notConnected,
  updateReportStatus: notConnected,
  hideReportedEvent: notConnected,
  searchUsers: notConnected,
  getUser: notConnected,
  suspendUser: notConnected,
  unsuspendUser: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): AdminRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devAdminRepository,
    );
    return {
      getAccess: async () => (await repository()).getAccess(),
      listReports: async (status) => (await repository()).listReports(status),
      getReport: async (reportId) => (await repository()).getReport(reportId),
      updateReportStatus: async (reportId, input) =>
        (await repository()).updateReportStatus(reportId, input),
      hideReportedEvent: async (reportId, input) =>
        (await repository()).hideReportedEvent(reportId, input),
      searchUsers: async (nickname) => (await repository()).searchUsers(nickname),
      getUser: async (userId) => (await repository()).getUser(userId),
      suspendUser: async (userId, input) => (await repository()).suspendUser(userId, input),
      unsuspendUser: async (userId, input) => (await repository()).unsuspendUser(userId, input),
    };
  }
  return notConnectedRepository;
}

export const adminRepository = createRepository();
