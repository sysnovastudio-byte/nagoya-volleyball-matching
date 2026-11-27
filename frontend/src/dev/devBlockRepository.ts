import type { BlockRepository } from '../features/safety/types';
import { findDevMember, findDevUser, type DevDatabase } from './devDatabase';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devBlockRepository');

interface DevBlockRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/**
 * 【開発専用】ブロックの窓口（SAFE-04・CND-06）。**ここでの判定は画面の確認用であり、権限の確認にはならない。**
 * 本番では block_user・unblock_user（docs/06の6-5）が、本人であること・相手が自分以外であることを確かめる。
 * 本人以外は blocks を読めない（docs/06の5-3）。
 */
export function createDevBlockRepository({
  db,
  session,
  now = () => new Date(),
}: DevBlockRepositoryOptions): BlockRepository {
  /** ログイン中の人と、操作できる相手。相手が退会した（見つからない）・管理者・自分自身の場合は断る */
  const resolve = (userId: string) => {
    const user = findDevMember(db, session.getUserId());
    if (!user) return { error: 'notLoggedIn' as const };
    if (userId === user.id) return { error: 'self' as const };
    // 管理用のアカウントは、一般の利用者として扱わない
    if (findDevUser(db, userId)?.role !== 'user') return { error: 'notFound' as const };
    return { user };
  };
  const findBlock = (blockerId: string, blockedId: string) =>
    db.blocks.findIndex((block) => block.blockerId === blockerId && block.blockedId === blockedId);

  return {
    getBlockState: (userId) => {
      const resolved = resolve(userId);
      if (!resolved.user) return Promise.resolve(null);
      // 自分がブロックしているかだけを返す。相手が自分をブロックしているかは返さない
      return Promise.resolve({ blockedByMe: findBlock(resolved.user.id, userId) >= 0 });
    },

    block: (userId) => {
      const resolved = resolve(userId);
      if (!resolved.user) return Promise.resolve({ status: 'rejected', reason: resolved.error });
      // 同じ相手を重ねてブロックしない（主キーは blocker_id・blocked_id、docs/06の4-9）
      if (findBlock(resolved.user.id, userId) < 0) {
        db.blocks.push({ blockerId: resolved.user.id, blockedId: userId, createdAt: now() });
      }
      return Promise.resolve({ status: 'done' });
    },

    unblock: (userId) => {
      const resolved = resolve(userId);
      if (!resolved.user) return Promise.resolve({ status: 'rejected', reason: resolved.error });
      // 自分がしたブロックだけを消す。相手がしたブロックは消せない
      const index = findBlock(resolved.user.id, userId);
      if (index >= 0) db.blocks.splice(index, 1);
      return Promise.resolve({ status: 'done' });
    },
  };
}
