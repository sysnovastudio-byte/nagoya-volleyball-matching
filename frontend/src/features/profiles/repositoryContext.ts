import { createContext, useContext } from 'react';
import { profileRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const ProfileRepositoryContext = createContext(profileRepository);

export function useProfileRepository() {
  return useContext(ProfileRepositoryContext);
}
