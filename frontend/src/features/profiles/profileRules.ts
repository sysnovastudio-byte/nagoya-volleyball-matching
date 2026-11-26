import { textLength } from '../../lib/text';
import type { ExperienceLevel, ProfileInput } from './types';

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

export interface ProfileFormValues {
  nickname: string;
  experienceLevel: ExperienceLevel | null;
  bio: string;
}

export type ProfileField = keyof ProfileFormValues;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  nickname: '',
  experienceLevel: null,
  bio: '',
};

export type ProfileFormResult =
  { ok: true; input: ProfileInput } | { ok: false; errors: ProfileFieldErrors };

/** ニックネームは前後の空白を除いて1〜20文字。空白だけは認めない（docs/06の4-2）。 */
export function validateProfileForm(values: ProfileFormValues): ProfileFormResult {
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

  if (Object.keys(errors).length > 0 || values.experienceLevel === null)
    return { ok: false, errors };
  return {
    ok: true,
    input: { nickname, experienceLevel: values.experienceLevel, bio: bio === '' ? null : bio },
  };
}
