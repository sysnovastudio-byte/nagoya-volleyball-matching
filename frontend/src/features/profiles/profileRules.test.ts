import { describe, expect, it } from 'vitest';
import {
  AGE_GROUPS,
  ageGroupLabel,
  selectableAgeGroups,
  validateProfileForm,
} from './profileRules';

const VALID = {
  nickname: 'ななみ',
  experienceLevel: 'beginner' as const,
  bio: '',
  ageGroup: null,
};

describe('プロフィールの入力', () => {
  it('4項目だけを送る。空の自己紹介は null にする', () => {
    expect(validateProfileForm(VALID, 'adult')).toEqual({
      ok: true,
      input: { nickname: 'ななみ', experienceLevel: 'beginner', bio: null, ageGroup: null },
    });
  });

  it('年代は任意。18歳以上はどの年代も選べる', () => {
    for (const ageGroup of AGE_GROUPS) {
      expect(validateProfileForm({ ...VALID, ageGroup }, 'adult')).toMatchObject({
        ok: true,
        input: { ageGroup },
      });
    }
    expect(AGE_GROUPS.map(ageGroupLabel)).toEqual([
      '10代',
      '20代',
      '30代',
      '40代',
      '50代',
      '60代以上',
    ]);
  });

  it('18歳未満は、年代を「10代」か未選択だけ選べる（DB-22）', () => {
    expect(selectableAgeGroups('minor')).toEqual(['teens']);
    expect(validateProfileForm({ ...VALID, ageGroup: 'teens' }, 'minor').ok).toBe(true);
    expect(validateProfileForm({ ...VALID, ageGroup: null }, 'minor').ok).toBe(true);
    expect(validateProfileForm({ ...VALID, ageGroup: 'twenties' }, 'minor')).toMatchObject({
      ok: false,
      errors: { ageGroup: expect.any(String) as string },
    });
  });

  it('ニックネームは前後の空白を除いて1〜20文字', () => {
    expect(validateProfileForm({ ...VALID, nickname: '  ななみ ' }, 'adult')).toMatchObject({
      ok: true,
      input: { nickname: 'ななみ' },
    });
    expect(validateProfileForm({ ...VALID, nickname: 'あ'.repeat(20) }, 'adult').ok).toBe(true);
    expect(validateProfileForm({ ...VALID, nickname: 'あ'.repeat(21) }, 'adult')).toMatchObject({
      ok: false,
      errors: { nickname: 'ニックネームは20文字以内にしてください。' },
    });
    expect(validateProfileForm({ ...VALID, nickname: '　 ' }, 'adult')).toMatchObject({
      ok: false,
      errors: { nickname: 'ニックネームを入力してください。' },
    });
  });

  it('絵文字も1文字と数える', () => {
    expect(validateProfileForm({ ...VALID, nickname: '🏐'.repeat(20) }, 'adult').ok).toBe(true);
  });

  it('経験レベルは必須', () => {
    expect(validateProfileForm({ ...VALID, experienceLevel: null }, 'adult')).toMatchObject({
      ok: false,
      errors: { experienceLevel: '経験レベルを選んでください。' },
    });
  });

  it('自己紹介は500文字まで', () => {
    expect(validateProfileForm({ ...VALID, bio: 'あ'.repeat(500) }, 'adult').ok).toBe(true);
    expect(validateProfileForm({ ...VALID, bio: 'あ'.repeat(501) }, 'adult')).toMatchObject({
      ok: false,
      errors: { bio: '自己紹介は500文字以内にしてください。' },
    });
  });
});
