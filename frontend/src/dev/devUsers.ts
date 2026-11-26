import type { AgeCategory } from '../features/auth/types';
import type { ExperienceLevel } from '../features/profiles/types';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devUsers');

/** 【開発専用】架空の利用者。実在の人や団体を含めない。 */
export interface DevUser {
  id: string;
  ageCategory: AgeCategory;
  /** 必須プロフィールが未登録の場合は null */
  profile: { nickname: string; experienceLevel: ExperienceLevel; bio: string | null } | null;
}

/** 開発用の帯で切り替えられる利用者。null は未ログイン。 */
export const DEV_PERSONAS: readonly { userId: string | null; label: string }[] = [
  { userId: null, label: '未ログイン' },
  { userId: 'dev-user-a', label: '利用者A（主に参加）' },
  { userId: 'dev-user-b', label: '利用者B（主に主催）' },
  { userId: 'dev-user-minor', label: '18歳未満の利用者' },
  { userId: 'dev-user-no-profile', label: 'プロフィール未登録の利用者' },
];

/** 申請者の数を埋めるための架空の利用者（帯では選べない）。 */
const MEMBERS: [string, ExperienceLevel, string | null][] = [
  ['ひなた', 'beginner', '週末に体を動かしたくて始めました。'],
  ['かえで', 'experienced', '学生のころに6年続けていました。'],
  ['れん', 'inexperienced', 'はじめてですが、よろしくお願いします。'],
  ['みお', 'beginner', null],
  ['はやと', 'experienced', 'ポジションはどこでも大丈夫です。'],
  ['さくら', 'beginner', '久しぶりにボールを触ります。'],
  ['いつき', 'experienced', null],
  ['ゆず', 'inexperienced', '友人に誘われて興味を持ちました。'],
  ['たくみ', 'beginner', 'レシーブを練習中です。'],
  ['のぞみ', 'experienced', '社会人のサークルで続けています。'],
  ['しおん', 'beginner', null],
  ['あかり', 'inexperienced', '運動不足の解消が目的です。'],
  ['りく', 'experienced', 'サーブが得意です。'],
  ['まひろ', 'beginner', '楽しく続けたいです。'],
  ['こう', 'experienced', null],
  ['ちさと', 'beginner', '平日の夜なら参加しやすいです。'],
];

export const DEV_MEMBER_IDS = MEMBERS.map((_, index) => `dev-member-${index + 1}`);

export function createDevUsers(): DevUser[] {
  return [
    {
      id: 'dev-user-a',
      ageCategory: 'adult',
      profile: {
        nickname: 'あおい',
        experienceLevel: 'beginner',
        bio: '名古屋に引っ越してきて、一緒に楽しめる人を探しています。',
      },
    },
    {
      id: 'dev-user-b',
      ageCategory: 'adult',
      profile: {
        nickname: 'そら',
        experienceLevel: 'experienced',
        bio: '初心者向けの練習会を、月に2回ほど開いています。',
      },
    },
    {
      id: 'dev-user-minor',
      ageCategory: 'minor',
      profile: { nickname: 'こはる', experienceLevel: 'inexperienced', bio: null },
    },
    { id: 'dev-user-no-profile', ageCategory: 'adult', profile: null },
    // ここから下は、ほかの募集の主催者（帯では選べない）
    ...(
      [
        ['dev-host-haru', 'はる'],
        ['dev-host-minato', 'みなと'],
        ['dev-host-tsubasa', 'つばさ'],
        ['dev-host-yui', 'ゆい'],
      ] as const
    ).map(([id, nickname]) => ({
      id,
      ageCategory: 'adult' as const,
      profile: { nickname, experienceLevel: 'experienced' as const, bio: null },
    })),
    ...MEMBERS.map(([nickname, experienceLevel, bio], index) => ({
      id: DEV_MEMBER_IDS[index] ?? '',
      ageCategory: 'adult' as const,
      profile: { nickname, experienceLevel, bio },
    })),
  ];
}
