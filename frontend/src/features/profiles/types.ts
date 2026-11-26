import type { TargetLevel } from '../events/types';

/** 経験レベル（docs/06の4-19）。値は対象レベルと同じ。 */
export type ExperienceLevel = TargetLevel;

/** 年代（docs/11の3-3、docs/06の4-13）。任意の項目で、未選択は null。 */
export type AgeGroup = 'teens' | 'twenties' | 'thirties' | 'forties' | 'fifties' | 'sixtiesPlus';

/**
 * ログイン済みの人に見せるプロフィール（docs/06の4-2）。
 * ニックネーム・経験レベル・自己紹介だけを扱う。年代は見られる人が限られるため、この型に加えない。
 * 性別・活動地域・画像（M-01）は加えない。
 * メールアドレス・電話番号は、この型に加えない（docs/10の5-7）。
 */
export type PublicProfile =
  | {
      userId: string;
      isWithdrawn: false;
      nickname: string;
      experienceLevel: ExperienceLevel;
      bio: string | null;
    }
  /** 退会した人。名前の代わりに「退会したユーザー」と表示する（docs/06の4-2） */
  | { userId: string; isWithdrawn: true };

/** 自分のプロフィール。ログイン済みに公開する項目と、本人と申請先の主催者だけが見られる年代。 */
export interface MyProfile {
  userId: string;
  nickname: string;
  experienceLevel: ExperienceLevel;
  bio: string | null;
  ageGroup: AgeGroup | null;
}

/**
 * プロフィールの保存で送る内容（docs/06の6-5の save_profile）。
 * M-01 のうち年代だけを加える。性別・活動地域・画像は加えない。
 */
export interface ProfileInput {
  nickname: string;
  experienceLevel: ExperienceLevel;
  bio: string | null;
  ageGroup: AgeGroup | null;
}

export type SaveProfileResult =
  { status: 'saved' } | { status: 'rejected'; reason: 'notLoggedIn' | 'invalid' };

export type ChangeToAdultResult =
  { status: 'changed' } | { status: 'rejected'; reason: 'notLoggedIn' | 'alreadyAdult' };

/**
 * プロフィールの取得の窓口。将来は docs/06の6-5の get_profiles・get_my_profile【提案・未承認】・save_profile を呼ぶ実装に置き換える。
 * 自分のプロフィールは、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 */
export interface ProfileRepository {
  /** 指定した人のプロフィール。1回50件まで。見つからない人は結果に含めない。未ログインは空を返す。 */
  getProfiles(userIds: string[]): Promise<PublicProfile[]>;
  /** 自分のプロフィール。未登録と未ログインは null を返す。 */
  getMyProfile(): Promise<MyProfile | null>;
  /**
   * 自分のプロフィールを登録・更新する（save_profile）。保存したら、ログイン状態の表示も変わる。
   * 18歳未満の人の年代は「10代」か未選択だけを認める（DB-22）。
   */
  saveProfile(input: ProfileInput): Promise<SaveProfileResult>;
  /** 年齢の区分を「18歳以上」に変える（docs/11の7-1）。戻すことはできない。 */
  changeAgeCategoryToAdult(): Promise<ChangeToAdultResult>;
}
