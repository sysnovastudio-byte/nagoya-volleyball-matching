import { createContext, useContext } from 'react';
import { conversationRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const ConversationRepositoryContext = createContext(conversationRepository);

export function useConversationRepository() {
  return useContext(ConversationRepositoryContext);
}
