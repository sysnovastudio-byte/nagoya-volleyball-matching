import type { AgeCategory } from '../features/auth/types';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devUsers');

/** 【開発専用】架空の利用者。実在の人や団体を含めない。 */
export interface DevUser {
  id: string;
  ageCategory: AgeCategory;
  /** 必須プロフィールが未登録の場合は null */
  profile: { nickname: string } | null;
}

/** 開発用の帯で切り替えられる利用者。null は未ログイン。 */
export const DEV_PERSONAS: readonly { userId: string | null; label: string }[] = [
  { userId: null, label: '未ログイン' },
  { userId: 'dev-user-a', label: '利用者A（主に参加）' },
  { userId: 'dev-user-b', label: '利用者B（主に主催）' },
  { userId: 'dev-user-minor', label: '18歳未満の利用者' },
  { userId: 'dev-user-no-profile', label: 'プロフィール未登録の利用者' },
];

export function createDevUsers(): DevUser[] {
  return [
    { id: 'dev-user-a', ageCategory: 'adult', profile: { nickname: 'あおい' } },
    { id: 'dev-user-b', ageCategory: 'adult', profile: { nickname: 'そら' } },
    { id: 'dev-user-minor', ageCategory: 'minor', profile: { nickname: 'こはる' } },
    { id: 'dev-user-no-profile', ageCategory: 'adult', profile: null },
    // ここから下は、ほかの募集の主催者（帯では選べない）
    { id: 'dev-host-haru', ageCategory: 'adult', profile: { nickname: 'はる' } },
    { id: 'dev-host-minato', ageCategory: 'adult', profile: { nickname: 'みなと' } },
    { id: 'dev-host-tsubasa', ageCategory: 'adult', profile: { nickname: 'つばさ' } },
    { id: 'dev-host-yui', ageCategory: 'adult', profile: { nickname: 'ゆい' } },
  ];
}
