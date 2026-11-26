import { createContext, useContext } from 'react';
import { applicationRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const ApplicationRepositoryContext = createContext(applicationRepository);

export function useApplicationRepository() {
  return useContext(ApplicationRepositoryContext);
}
