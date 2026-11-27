import { createContext, useContext } from 'react';
import { reportRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const ReportRepositoryContext = createContext(reportRepository);

export function useReportRepository() {
  return useContext(ReportRepositoryContext);
}
