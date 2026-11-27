import type { AgeGroup, ExperienceLevel, Gender } from '../features/profiles/types';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devUsers');

/** 【開発専用】架空の利用者。実在の人や団体を含めない。 */
export interface DevUser {
  id: string;
  /** 管理者は運営者がDBの管理操作で付与する（docs/11の4-1）。管理者は一般の操作をしない */
  role: 'user' | 'admin';
  /** 利用停止中は、公開情報の閲覧・ログアウト・退会だけができる（docs/11の4-2） */
  status: 'active' | 'suspended';
  /** 必須プロフィールが未登録の場合は null */
  profile: {
    nickname: string;
    experienceLevel: ExperienceLevel;
    bio: string | null;
    /** 年代と性別。どちらも任意で、ログインした人全員に公開する */
    ageGroup: AgeGroup | null;
    gender: Gender | null;
  } | null;
}

/** 管理者（ダミー）。プロフィールを持たず、一般の操作をしない（docs/11の4-1）。 */
export const DEV_ADMIN_ID = 'dev-admin';

/** 開発用の帯で切り替えられる利用者。null は未ログイン。 */
export const DEV_PERSONAS: readonly { userId: string | null; label: string }[] = [
  { userId: null, label: '未ログイン' },
  { userId: 'dev-user-a', label: '利用者A（主に参加）' },
  { userId: 'dev-user-b', label: '利用者B（主に主催）' },
  { userId: 'dev-user-no-profile', label: 'プロフィール未登録の利用者' },
  { userId: 'dev-user-suspended', label: '利用停止中の利用者' },
  { userId: DEV_ADMIN_ID, label: '管理者（ダミー）' },
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

const MEMBER_AGE_GROUPS: (AgeGroup | null)[] = [
  'twenties',
  'thirties',
  null,
  'forties',
  'twenties',
  'fifties',
  'sixtiesPlus',
];

const MEMBER_GENDERS: (Gender | null)[] = ['female', 'male', null, 'other', 'noAnswer'];

export const DEV_MEMBER_IDS = MEMBERS.map((_, index) => `dev-member-${index + 1}`);

/** 一般の利用者で、利用できる状態。 */
const MEMBER = { role: 'user', status: 'active' } as const;

export function createDevUsers(): DevUser[] {
  return [
    {
      id: 'dev-user-a',
      ...MEMBER,
      profile: {
        nickname: 'あおい',
        experienceLevel: 'beginner',
        bio: '名古屋に引っ越してきて、一緒に楽しめる人を探しています。',
        ageGroup: 'twenties',
        gender: 'female',
      },
    },
    {
      id: 'dev-user-b',
      ...MEMBER,
      profile: {
        nickname: 'そら',
        experienceLevel: 'experienced',
        bio: '初心者向けの練習会を、月に2回ほど開いています。',
        ageGroup: 'thirties',
        gender: 'noAnswer',
      },
    },
    { id: 'dev-user-no-profile', ...MEMBER, profile: null },
    // 利用停止中の利用者。停止の記録と、停止のきっかけの通報がある（devModeration.ts）
    {
      id: 'dev-user-suspended',
      role: 'user',
      status: 'suspended',
      profile: {
        nickname: 'かいと',
        experienceLevel: 'experienced',
        bio: '試合中心で活動しています。',
        ageGroup: 'twenties',
        gender: 'male',
      },
    },
    // 管理者。個人の利用とは分けたアカウントで、プロフィールを持たない
    { id: DEV_ADMIN_ID, role: 'admin', status: 'active', profile: null },
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
      ...MEMBER,
      profile: {
        nickname,
        experienceLevel: 'experienced' as const,
        bio: null,
        ageGroup: null,
        gender: null,
      },
    })),
    ...MEMBERS.map(([nickname, experienceLevel, bio], index) => ({
      id: DEV_MEMBER_IDS[index] ?? '',
      ...MEMBER,
      // 年代と性別は、未選択の人も含めて順にばらつかせる（架空）
      profile: {
        nickname,
        experienceLevel,
        bio,
        ageGroup: MEMBER_AGE_GROUPS[index % MEMBER_AGE_GROUPS.length] ?? null,
        gender: MEMBER_GENDERS[index % MEMBER_GENDERS.length] ?? null,
      },
    })),
  ];
}
