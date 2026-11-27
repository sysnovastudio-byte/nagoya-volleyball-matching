import { describe, expect, it } from 'vitest';
import { createDevBlockRepository } from './devBlockRepository';
import { createDevDatabase } from './devDatabase';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const A = 'dev-user-a';
const B = 'dev-user-b';

function setup(userId: string | null = A) {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  const repository = createDevBlockRepository({ db, session, now: () => NOW });
  return { db, session, repository };
}

describe('ブロック（SAFE-04）', () => {
  it('ブロックすると、自分には「ブロックしている」と返る', async () => {
    const { repository } = setup();

    expect(await repository.getBlockState(B)).toEqual({ blockedByMe: false });
    expect(await repository.block(B)).toEqual({ status: 'done' });
    expect(await repository.getBlockState(B)).toEqual({ blockedByMe: true });
  });

  it('ブロックされた相手には、ブロックされたことを返さない', async () => {
    const { repository, session } = setup();
    await repository.block(B);

    session.setUserId(B);
    expect(await repository.getBlockState(A)).toEqual({ blockedByMe: false });
  });

  it('同じ相手を重ねてブロックしても、記録は1つ', async () => {
    const { repository, db } = setup();

    await repository.block(B);
    await repository.block(B);
    expect(db.blocks).toEqual([{ blockerId: A, blockedId: B, createdAt: NOW }]);
  });

  it('自分自身・退会した人（見つからない人）はブロックできず、状態も返さない', async () => {
    const { repository, db } = setup();

    expect(await repository.block(A)).toEqual({ status: 'rejected', reason: 'self' });
    expect(await repository.getBlockState(A)).toBeNull();
    expect(await repository.block('dev-user-withdrawn')).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(await repository.getBlockState('dev-user-withdrawn')).toBeNull();
    expect(db.blocks).toEqual([]);
  });

  it('未ログインでは、ブロックも解除もできず、状態も返さない', async () => {
    const { repository } = setup(null);

    expect(await repository.getBlockState(B)).toBeNull();
    expect(await repository.block(B)).toEqual({ status: 'rejected', reason: 'notLoggedIn' });
    expect(await repository.unblock(B)).toEqual({ status: 'rejected', reason: 'notLoggedIn' });
  });

  it('ブロックの回数に上限を設けない（M-13、公開後）', async () => {
    const { repository } = setup();

    for (let i = 0; i < 60; i += 1) {
      expect(await repository.block(B)).toEqual({ status: 'done' });
      expect(await repository.unblock(B)).toEqual({ status: 'done' });
    }
  });
});

describe('ブロックの解除（CND-06）', () => {
  it('ブロックした本人が解除できる', async () => {
    const { repository, db } = setup();
    await repository.block(B);

    expect(await repository.unblock(B)).toEqual({ status: 'done' });
    expect(await repository.getBlockState(B)).toEqual({ blockedByMe: false });
    expect(db.blocks).toEqual([]);
  });

  it('相手からは、こちらのブロックを解除できない', async () => {
    const { repository, session, db } = setup();
    await repository.block(B);

    session.setUserId(B);
    await repository.unblock(A);
    expect(db.blocks).toEqual([{ blockerId: A, blockedId: B, createdAt: NOW }]);
  });

  it('お互いにブロックした場合、自分の解除では相手のブロックは残る', async () => {
    const { repository, session, db } = setup();
    await repository.block(B);
    session.setUserId(B);
    await repository.block(A);

    session.setUserId(A);
    await repository.unblock(B);
    expect(db.blocks).toEqual([{ blockerId: B, blockedId: A, createdAt: NOW }]);
  });
});
