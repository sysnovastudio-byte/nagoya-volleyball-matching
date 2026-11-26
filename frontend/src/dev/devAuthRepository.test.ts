import { describe, expect, it, vi } from 'vitest';
import { createDevAuthRepository } from './devAuthRepository';
import { createDevDatabase } from './devDatabase';
import { createDevSession } from './devSession';

function setup(userId: string | null) {
  const session = createDevSession(userId);
  const repository = createDevAuthRepository({ db: createDevDatabase(new Date()), session });
  return { session, repository };
}

describe('開発用のログイン状態', () => {
  it.each([
    [null, null],
    ['dev-user-a', { ageCategory: 'adult', profile: { nickname: 'あおい' } }],
    ['dev-user-minor', { ageCategory: 'minor', profile: { nickname: 'こはる' } }],
    ['dev-user-no-profile', { ageCategory: 'adult', profile: null }],
  ])('%s', async (userId, expected) => {
    expect(await setup(userId).repository.getViewer()).toEqual(expected);
  });

  it('画面に利用者のIDを渡さない', async () => {
    const viewer = await setup('dev-user-b').repository.getViewer();

    expect(JSON.stringify(viewer)).not.toContain('dev-user-b');
  });

  it('切り替えとログアウトを知らせる', async () => {
    const { session, repository } = setup('dev-user-a');
    const listener = vi.fn();
    const unsubscribe = repository.onViewerChange(listener);

    session.setUserId('dev-user-b');
    await repository.signOut();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(await repository.getViewer()).toBeNull();
    unsubscribe();
  });
});
