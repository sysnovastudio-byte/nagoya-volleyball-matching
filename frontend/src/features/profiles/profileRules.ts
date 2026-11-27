import { textLength } from '../../lib/text';
import type { AgeCategory } from '../auth/types';
import type { AgeGroup, ExperienceLevel, ProfileInput } from './types';

/** 上限（docs/11の3-3）。 */
export const PROFILE_LIMITS = {
  nicknameMax: 20,
  bioMax: 500,
} as const;

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  'inexperienced',
  'beginner',
  'experienced',
];

/** 年代の選択肢（docs/11の3-3）。 */
export const AGE_GROUPS: readonly AgeGroup[] = [
  'teens',
  'twenties',
  'thirties',
  'forties',
  'fifties',
  'sixtiesPlus',
];

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  teens: '10代',
  twenties: '20代',
  thirties: '30代',
  forties: '40代',
  fifties: '50代',
  sixtiesPlus: '60代以上',
};

export function ageGroupLabel(ageGroup: AgeGroup) {
  return AGE_GROUP_LABELS[ageGroup];
}

/** 選べる年代。18歳未満の人は「10代」だけ（DB-22）。 */
export function selectableAgeGroups(ageCategory: AgeCategory): readonly AgeGroup[] {
  return ageCategory === 'minor' ? ['teens'] : AGE_GROUPS;
}

/**
 * 運営・管理者になりすませる語（DB-21、docs/11の3-3、2026-11-27の決定）。本番では save_profile も同じ一覧で拒否する。
 * - 日本語の語：含むものを拒否する
 * - 英字の語：名前全体が一致するものだけ拒否する（「badminton」が「admin」を含むため）
 * 保存済みの名前は変えない。完全には防げないため、通報で補う。
 */
export const CONFUSING_NICKNAME_WORDS = {
  contains: ['運営', '管理者', '管理人', '事務局', '公式', '退会したユーザー'],
  exact: ['admin', 'administrator', 'official', 'staff', 'support', 'moderator'],
} as const;

/** 比べるための形。全角・半角をそろえ（NFKC）、小文字にし、空白を除く（docs/06の11-1-3）。 */
function normalizeNickname(nickname: string) {
  return nickname.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

/** 運営・管理者などと紛らわしいニックネームか（DB-21）。 */
export function isConfusingNickname(nickname: string) {
  const normalized = normalizeNickname(nickname);
  return (
    CONFUSING_NICKNAME_WORDS.contains.some((word) =>
      normalized.includes(normalizeNickname(word)),
    ) || CONFUSING_NICKNAME_WORDS.exact.some((word) => normalized === word)
  );
}

export interface ProfileFormValues {
  nickname: string;
  experienceLevel: ExperienceLevel | null;
  bio: string;
  ageGroup: AgeGroup | null;
}

export type ProfileField = keyof ProfileFormValues;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  nickname: '',
  experienceLevel: null,
  bio: '',
  ageGroup: null,
};

export type ProfileFormResult =
  { ok: true; input: ProfileInput } | { ok: false; errors: ProfileFieldErrors };

/**
 * ニックネームは前後の空白を除いて1〜20文字。空白だけは認めない（docs/06の4-2）。
 * 運営・管理者などと紛らわしい語は使えない（DB-21）。
 * 年代は任意。18歳未満の人は「10代」か未選択だけ（DB-22）。
 */
export function validateProfileForm(
  values: ProfileFormValues,
  ageCategory: AgeCategory,
): ProfileFormResult {
  const errors: ProfileFieldErrors = {};
  const nickname = values.nickname.trim();
  const bio = values.bio.trim();

  if (nickname === '') errors.nickname = 'ニックネームを入力してください。';
  else if (textLength(nickname) > PROFILE_LIMITS.nicknameMax) {
    errors.nickname = `ニックネームは${PROFILE_LIMITS.nicknameMax}文字以内にしてください。`;
  } else if (isConfusingNickname(nickname)) {
    errors.nickname = '運営・管理者などと紛らわしいため、このニックネームは使えません。';
  }
  if (values.experienceLevel === null) errors.experienceLevel = '経験レベルを選んでください。';
  if (textLength(bio) > PROFILE_LIMITS.bioMax) {
    errors.bio = `自己紹介は${PROFILE_LIMITS.bioMax}文字以内にしてください。`;
  }

  if (values.ageGroup !== null && !selectableAgeGroups(ageCategory).includes(values.ageGroup)) {
    errors.ageGroup = '18歳未満の場合、年代は「10代」か「選ばない」にしてください。';
  }

  if (Object.keys(errors).length > 0 || values.experienceLevel === null)
    return { ok: false, errors };
  return {
    ok: true,
    input: {
      nickname,
      experienceLevel: values.experienceLevel,
      bio: bio === '' ? null : bio,
      ageGroup: values.ageGroup,
    },
  };
}
