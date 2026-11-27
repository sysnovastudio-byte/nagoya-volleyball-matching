import type { TargetLevel } from '../events/types';

/** 経験レベル（docs/06の4-19）。値は対象レベルと同じ。 */
export type ExperienceLevel = TargetLevel;

/** 年代（docs/11の3-3、docs/06の4-13）。20代〜60代以上（登録は20歳以上）。任意の項目で、未選択は null。 */
export type AgeGroup = 'twenties' | 'thirties' | 'forties' | 'fifties' | 'sixtiesPlus';

/** 性別（docs/11の3-3、docs/06の4-19）。任意の項目で、未選択は null。「回答しない」も選べる。 */
export type Gender = 'male' | 'female' | 'other' | 'noAnswer';

/**
 * ログイン済みの人に見せるプロフィール（docs/06の4-2）。
 * ニックネーム・経験レベル・自己紹介・年代・性別。年代と性別もログインした人全員に公開する（2026-11-27の決定）。
 * 活動地域・画像（M-01）は加えない。
 * メールアドレス・電話番号は、この型に加えない（docs/10の5-7）。
 */
export type PublicProfile =
  | {
      userId: string;
      isWithdrawn: false;
      nickname: string;
      experienceLevel: ExperienceLevel;
      bio: string | null;
      ageGroup: AgeGroup | null;
      gender: Gender | null;
    }
  /** 退会した人。名前の代わりに「退会したユーザー」と表示する（docs/06の4-2） */
  | { userId: string; isWithdrawn: true };

/** 自分のプロフィール。項目はすべてログイン済みに公開する。 */
export interface MyProfile {
  userId: string;
  nickname: string;
  experienceLevel: ExperienceLevel;
  bio: string | null;
  ageGroup: AgeGroup | null;
  gender: Gender | null;
}

/**
 * プロフィールの保存で送る内容（docs/06の6-5の save_profile）。
 * M-01 のうち年代と性別を加える。活動地域・画像は加えない。
 */
export interface ProfileInput {
  nickname: string;
  experienceLevel: ExperienceLevel;
  bio: string | null;
  ageGroup: AgeGroup | null;
  gender: Gender | null;
}

export type SaveProfileResult =
  { status: 'saved' } | { status: 'rejected'; reason: 'notLoggedIn' | 'invalid' };

/**
 * プロフィールの取得の窓口。将来は docs/06の6-5の get_profiles・get_my_profile【提案・未承認】・save_profile を呼ぶ実装に置き換える。
 * 自分のプロフィールは、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 */
export interface ProfileRepository {
  /** 指定した人のプロフィール。1回50件まで。見つからない人は結果に含めない。未ログインは空を返す。 */
  getProfiles(userIds: string[]): Promise<PublicProfile[]>;
  /** 自分のプロフィール。未登録と未ログインは null を返す。 */
  getMyProfile(): Promise<MyProfile | null>;
  /** 自分のプロフィールを登録・更新する（save_profile）。保存したら、ログイン状態の表示も変わる。 */
  saveProfile(input: ProfileInput): Promise<SaveProfileResult>;
}
