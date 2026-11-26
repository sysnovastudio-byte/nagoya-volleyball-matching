import { createContext, useContext } from 'react';
import { eventRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const EventRepositoryContext = createContext(eventRepository);

export function useEventRepository() {
  return useContext(EventRepositoryContext);
}
