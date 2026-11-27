import { lazyDev } from '../../lib/lazyDev';
import type { ReportRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: ReportRepository = {
  getReportTarget: notConnected,
  submitReport: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): ReportRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devReportRepository,
    );
    return {
      getReportTarget: async (kind, targetId) =>
        (await repository()).getReportTarget(kind, targetId),
      submitReport: async (input) => (await repository()).submitReport(input),
    };
  }
  return notConnectedRepository;
}

export const reportRepository = createRepository();
