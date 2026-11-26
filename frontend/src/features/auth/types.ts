/** 年齢の区分（docs/06の4-1の age_category、docs/11の7-1）。 */
export type AgeCategory = 'adult' | 'minor';

/**
 * ログインしている人。画面が表示の切り替えに使う情報だけを持ち、利用者のIDは持たない。
 * 権限の判定は、取得の窓口（将来はDB）が行う。画面の判定は表示のためだけのもの。
 */
export interface Viewer {
  ageCategory: AgeCategory;
  /** 必須プロフィールが未登録の場合は null（docs/06の4-2、docs/11の3-4） */
  profile: { nickname: string } | null;
}

/** ログイン状態の窓口。将来は Supabase Auth に置き換える。 */
export interface AuthRepository {
  /** ログインしていない場合は null を返す。 */
  getViewer(): Promise<Viewer | null>;
  /** ログイン状態が変わったときに呼ぶ。戻り値で登録を解除する。 */
  onViewerChange(listener: () => void): () => void;
  signOut(): Promise<void>;
}
