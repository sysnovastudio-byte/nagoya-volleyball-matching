import { createContext, useContext } from 'react';
import { accountRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const AccountRepositoryContext = createContext(accountRepository);

export function useAccountRepository() {
  return useContext(AccountRepositoryContext);
}
