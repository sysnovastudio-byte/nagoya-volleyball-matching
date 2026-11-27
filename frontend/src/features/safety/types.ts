/**
 * 自分が相手をブロックしているか。相手が自分をブロックしているかは返さない（docs/11の3-1）。
 * 相手が見つからない・退会した・自分自身の場合は null。
 */
export type BlockState = { blockedByMe: boolean } | null;

export type BlockResult =
  | { status: 'done' }
  /** notFound：相手が見つからない・退会した。self：自分自身 */
  | { status: 'rejected'; reason: 'notLoggedIn' | 'notFound' | 'self' };

/**
 * ブロックの窓口（SAFE-04・CND-06）。将来は docs/06の6-5の block_user・unblock_user を呼ぶ実装に置き換える。
 * ブロックする人は、常にログイン中の人。窓口が内部で決め、画面から自分のIDを渡さない。
 * ブロックの回数の上限は公開後（M-13）。ブロックした相手の一覧（SCR-020）も公開後（M-12）。
 */
export interface BlockRepository {
  /** 自分が相手をブロックしているか。未ログインは null。 */
  getBlockState(userId: string): Promise<BlockState>;
  /** 相手をブロックする。すでにブロックしていても done を返す。 */
  block(userId: string): Promise<BlockResult>;
  /** ブロックを解除する。本人だけが解除できる。ブロックしていなくても done を返す。 */
  unblock(userId: string): Promise<BlockResult>;
}
