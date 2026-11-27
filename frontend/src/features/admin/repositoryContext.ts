import { createContext, useContext } from 'react';
import { adminRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const AdminRepositoryContext = createContext(adminRepository);

export function useAdminRepository() {
  return useContext(AdminRepositoryContext);
}
