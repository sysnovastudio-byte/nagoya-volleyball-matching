import { createContext, useContext } from 'react';
import { authRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const AuthRepositoryContext = createContext(authRepository);

export function useAuthRepository() {
  return useContext(AuthRepositoryContext);
}
