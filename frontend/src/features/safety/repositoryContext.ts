import { createContext, useContext } from 'react';
import { blockRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const BlockRepositoryContext = createContext(blockRepository);

export function useBlockRepository() {
  return useContext(BlockRepositoryContext);
}
