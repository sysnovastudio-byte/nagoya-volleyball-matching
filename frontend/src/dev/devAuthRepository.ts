import type { AuthRepository, Viewer } from '../features/auth/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devAuthRepository');

interface DevAuthRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
}

/**
 * 【開発専用】開発用の帯で選んだ利用者を、ログインしている人として返す。
 * パスワードなどの確認はしない。**権限の確認にはならない。**
 */
export function createDevAuthRepository({ db, session }: DevAuthRepositoryOptions): AuthRepository {
  return {
    getViewer: () => {
      const user = findDevUser(db, session.getUserId());
      const viewer: Viewer | null = user
        ? { ageCategory: user.ageCategory, profile: user.profile ? { ...user.profile } : null }
        : null;
      return Promise.resolve(viewer);
    },
    onViewerChange: (listener) => session.subscribe(listener),
    signOut: () => {
      session.setUserId(null);
      return Promise.resolve();
    },
  };
}
