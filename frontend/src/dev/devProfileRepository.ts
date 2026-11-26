import type { ProfileRepository, PublicProfile } from '../features/profiles/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevSession } from './devSession';
import type { DevUser } from './devUsers';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devProfileRepository');

const MAX_PROFILES = 50;

/** ログイン済みに公開する項目だけを書き出す（docs/06の4-2）。未登録の人は null。 */
export function toPublicProfile(user: DevUser): PublicProfile | null {
  if (!user.profile) return null;
  return {
    userId: user.id,
    isWithdrawn: false,
    nickname: user.profile.nickname,
    experienceLevel: user.profile.experienceLevel,
    bio: user.profile.bio,
  };
}

interface DevProfileRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
}

/**
 * 【開発専用】プロフィールの取得。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では get_profiles（docs/06の6-5）がログイン済みかを確かめる。
 */
export function createDevProfileRepository({
  db,
  session,
}: DevProfileRepositoryOptions): ProfileRepository {
  return {
    getProfiles: (userIds) => {
      if (!findDevUser(db, session.getUserId())) return Promise.resolve([]);
      const profiles = [...new Set(userIds)].slice(0, MAX_PROFILES).flatMap((userId) => {
        const user = findDevUser(db, userId);
        const profile = user && toPublicProfile(user);
        return profile ? [profile] : [];
      });
      return Promise.resolve(profiles);
    },
    getMyProfile: () => {
      const user = findDevUser(db, session.getUserId());
      return Promise.resolve((user && toPublicProfile(user)) ?? null);
    },
  };
}
