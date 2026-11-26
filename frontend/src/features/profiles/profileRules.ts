import { textLength } from '../../lib/text';
import type { AgeCategory } from '../auth/types';
import type { AgeGroup, ExperienceLevel, ProfileInput } from './types';

/** 上限（docs/11の3-3）。紛らわしいニックネームの拒否（DB-21）は行わない。 */
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
