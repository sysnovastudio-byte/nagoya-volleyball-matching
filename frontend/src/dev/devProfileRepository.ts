import { validateProfileForm } from '../features/profiles/profileRules';
import type { MyProfile, ProfileRepository, PublicProfile } from '../features/profiles/types';
import { findDevMember, findDevUser, type DevDatabase } from './devDatabase';
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

function toMyProfile(user: DevUser): MyProfile | null {
  if (!user.profile) return null;
  const { nickname, experienceLevel, bio, ageGroup } = user.profile;
  return { userId: user.id, nickname, experienceLevel, bio, ageGroup };
}

interface DevProfileRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
}

/**
 * 【開発専用】プロフィールの取得。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では get_profiles・save_profile（docs/06の6-5）がログイン済みかなどを確かめる。
 */
export function createDevProfileRepository({
  db,
  session,
}: DevProfileRepositoryOptions): ProfileRepository {
  return {
    getProfiles: (userIds) => {
      if (!findDevMember(db, session.getUserId())) return Promise.resolve([]);
      const profiles = [...new Set(userIds)].slice(0, MAX_PROFILES).flatMap((userId) => {
        const user = findDevUser(db, userId);
        const profile = user && toPublicProfile(user);
        return profile ? [profile] : [];
      });
      return Promise.resolve(profiles);
    },
    getMyProfile: () => {
      const user = findDevMember(db, session.getUserId());
      return Promise.resolve((user && toMyProfile(user)) ?? null);
    },
    saveProfile: (input) => {
      const user = findDevMember(db, session.getUserId());
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      // 画面と同じ検証。本番では save_profile が確かめる
      const checked = validateProfileForm({ ...input, bio: input.bio ?? '' }, user.ageCategory);
      if (!checked.ok) return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      user.profile = { ...checked.input };
      // ログイン状態の表示（ニックネーム・プロフィールの有無）を更新する
      session.notify();
      return Promise.resolve({ status: 'saved' });
    },
    changeAgeCategoryToAdult: () => {
      const user = findDevMember(db, session.getUserId());
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      // 「18歳以上」から戻す操作は作らない（docs/11の7-1）
      if (user.ageCategory === 'adult') {
        return Promise.resolve({ status: 'rejected', reason: 'alreadyAdult' });
      }
      user.ageCategory = 'adult';
      session.notify();
      return Promise.resolve({ status: 'changed' });
    },
  };
}
