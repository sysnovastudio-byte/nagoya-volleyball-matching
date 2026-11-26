import { describe, expect, it } from 'vitest';
import { validateProfileForm } from './profileRules';

const VALID = { nickname: 'ななみ', experienceLevel: 'beginner' as const, bio: '' };

describe('プロフィールの入力', () => {
  it('3項目だけを送る。空の自己紹介は null にする', () => {
    expect(validateProfileForm(VALID)).toEqual({
      ok: true,
      input: { nickname: 'ななみ', experienceLevel: 'beginner', bio: null },
    });
  });

  it('ニックネームは前後の空白を除いて1〜20文字', () => {
    expect(validateProfileForm({ ...VALID, nickname: '  ななみ ' })).toMatchObject({
      ok: true,
      input: { nickname: 'ななみ' },
    });
    expect(validateProfileForm({ ...VALID, nickname: 'あ'.repeat(20) }).ok).toBe(true);
    expect(validateProfileForm({ ...VALID, nickname: 'あ'.repeat(21) })).toMatchObject({
      ok: false,
      errors: { nickname: 'ニックネームは20文字以内にしてください。' },
    });
    expect(validateProfileForm({ ...VALID, nickname: '　 ' })).toMatchObject({
      ok: false,
      errors: { nickname: 'ニックネームを入力してください。' },
    });
  });

  it('絵文字も1文字と数える', () => {
    expect(validateProfileForm({ ...VALID, nickname: '🏐'.repeat(20) }).ok).toBe(true);
  });

  it('経験レベルは必須', () => {
    expect(validateProfileForm({ ...VALID, experienceLevel: null })).toMatchObject({
      ok: false,
      errors: { experienceLevel: '経験レベルを選んでください。' },
    });
  });

  it('自己紹介は500文字まで', () => {
    expect(validateProfileForm({ ...VALID, bio: 'あ'.repeat(500) }).ok).toBe(true);
    expect(validateProfileForm({ ...VALID, bio: 'あ'.repeat(501) })).toMatchObject({
      ok: false,
      errors: { bio: '自己紹介は500文字以内にしてください。' },
    });
  });
});
