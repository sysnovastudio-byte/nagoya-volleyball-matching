import { createContext, useContext } from 'react';
import { notificationRepository } from './repository';

/** テストで取得の窓口を差し替えられるようにする。 */
export const NotificationRepositoryContext = createContext(notificationRepository);

export function useNotificationRepository() {
  return useContext(NotificationRepositoryContext);
}
