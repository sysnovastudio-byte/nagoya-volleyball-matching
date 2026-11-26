import type { TargetLevel } from '../events/types';

/** 経験レベル（docs/06の4-19）。値は対象レベルと同じ。 */
export type ExperienceLevel = TargetLevel;

/**
 * ログイン済みの人に見せるプロフィール（docs/06の4-2）。
 * サイクル1は、ニックネーム・経験レベル・自己紹介だけを扱う。年代・性別・活動地域（M-01）は加えない。
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

/**
 * プロフィールの取得の窓口。将来は docs/06の6-5の get_profiles を呼ぶ実装に置き換える。
 * 自分のプロフィールは、窓口が内部でログイン状態から決める。画面から自分のIDを渡さない。
 */
export interface ProfileRepository {
  /** 指定した人のプロフィール。1回50件まで。見つからない人は結果に含めない。未ログインは空を返す。 */
  getProfiles(userIds: string[]): Promise<PublicProfile[]>;
  /** 自分のプロフィール。未登録と未ログインは null を返す。 */
  getMyProfile(): Promise<PublicProfile | null>;
}
