import { describe, expect, it } from 'vitest';
import { createDevAccountRepository } from './devAccountRepository';
import { createDevDatabase, findDevUser } from './devDatabase';
import { createDevSession } from './devSession';

const A = 'dev-user-a';
const B = 'dev-user-b';

function setup(userId: string | null) {
  const db = createDevDatabase(new Date());
  const session = createDevSession(userId);
  return { db, session, repository: createDevAccountRepository({ db, session }) };
}

describe('開発用の退会の確認', () => {
  it('参加している人は退会でき、取り消す参加・申請の件数を返す', async () => {
    // 開催前：家族や友人と（承認済み）・非表示の募集（承認済み）・平日夜（承認待ち）
    expect(await setup(A).repository.getWithdrawalCheck()).toEqual({
      status: 'available',
      impact: { approvedParticipations: 2, pendingApplications: 1 },
    });
  });

  it('開催前の募集を主催している人は退会できず、その募集を返す（中止・非表示・開催中・終了は含めない）', async () => {
    const check = await setup(B).repository.getWithdrawalCheck();

    expect(check.status).toBe('hostingUpcoming');
    if (check.status !== 'hostingUpcoming') return;
    expect(check.events.map((event) => event.id)).toEqual(['dev-b-full', 'dev-beginner-afternoon']);
    expect(JSON.stringify(check)).not.toContain('ダミー住所');
  });

  it.each([
    [null, 'notLoggedIn'],
    ['dev-admin', 'admin'],
    ['dev-user-suspended', 'suspended'],
  ])('%s は退会できない（%s）', async (userId, reason) => {
    const { repository } = setup(userId);

    expect(await repository.getWithdrawalCheck()).toEqual({ status: 'unavailable', reason });
    expect(await repository.withdraw({ password: 'password' })).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });
});

describe('開発用の退会', () => {
  it('パスワードが空なら断り、何も変えない', async () => {
    const { db, session, repository } = setup(A);
    const before = JSON.stringify(db);

    expect(await repository.withdraw({ password: '' })).toEqual({
      status: 'rejected',
      reason: 'wrongPassword',
    });
    expect(JSON.stringify(db)).toBe(before);
    expect(session.getUserId()).toBe(A);
  });

  it('開催前の募集を主催していれば断り、何も変えない', async () => {
    const { db, repository } = setup(B);
    const before = JSON.stringify(db);

    expect(await repository.withdraw({ password: 'password' })).toEqual({
      status: 'rejected',
      reason: 'hostingUpcoming',
    });
    expect(JSON.stringify(db)).toBe(before);
  });

  it('開催前の参加をキャンセルして主催者へ通知し、承認待ちを取り下げ、個人情報を消してログアウトする', async () => {
    const { db, session, repository } = setup(A);
    db.blocks.push({ blockerId: A, blockedId: 'dev-host-haru', createdAt: new Date() });
    db.blocks.push({ blockerId: 'dev-host-haru', blockedId: A, createdAt: new Date() });
    const statusOf = (eventId: string) =>
      db.applications.find((item) => item.eventId === eventId && item.userId === A)?.status;

    expect(await repository.withdraw({ password: 'password' })).toEqual({ status: 'withdrawn' });

    expect(statusOf('dev-family-morning')).toBe('cancelled');
    expect(statusOf('dev-hidden')).toBe('cancelled');
    expect(statusOf('dev-weekday-night')).toBe('retracted');
    // 開催中・終了・中止の参加と、ほかの状態は変えない
    expect(statusOf('dev-ongoing')).toBe('approved');
    expect(statusOf('dev-ended')).toBe('approved');
    expect(statusOf('dev-b-full')).toBe('revoked');
    // キャンセルは主催者へ通知する。非表示の募集・取り下げは通知しない
    const notices = db.notifications.filter((item) => item.type === 'participation_cancelled');
    expect(notices.map((item) => [item.userId, item.eventId])).toContainEqual([
      'dev-host-yui',
      'dev-family-morning',
    ]);
    expect(notices.some((item) => item.eventId === 'dev-hidden')).toBe(false);
    // 本人の通知・本人がしたブロックを消し、ほかの人がしたブロックは残す
    expect(db.notifications.some((item) => item.userId === A)).toBe(false);
    expect(db.blocks).toEqual([expect.objectContaining({ blockerId: 'dev-host-haru' })]);
    // プロフィールと認証アカウントを消す（見つからない人＝退会した人）
    expect(findDevUser(db, A)).toBeUndefined();
    expect(JSON.stringify(db.users)).not.toContain('あおい');
    expect(session.getUserId()).toBeNull();
    // 記録は残す
    expect(db.messages.some((message) => message.senderId === A)).toBe(true);
    expect(db.applications.some((item) => item.userId === A)).toBe(true);
  });

  it('主催した募集の住所を、終了・中止・開催中を含めてすべて消し、非表示の開催前の募集を中止する', async () => {
    const { db, repository } = setup(B);
    // 開催前の募集を中止した後なら退会できる
    for (const record of db.events) {
      if (['dev-beginner-afternoon', 'dev-b-full'].includes(record.id)) record.status = 'cancelled';
    }
    const hosted = db.events.filter((record) => record.hostId === B).map((record) => record.id);
    expect(hosted).toEqual(expect.arrayContaining(['dev-ongoing', 'dev-b-ended', 'dev-b-hidden']));

    expect(await repository.withdraw({ password: 'password' })).toEqual({ status: 'withdrawn' });

    for (const id of hosted) expect(db.locations.has(id)).toBe(false);
    expect(db.locations.has('dev-easy-morning')).toBe(true);
    const hidden = db.events.find((record) => record.id === 'dev-b-hidden');
    expect(hidden?.status).toBe('cancelled');
    // 募集の記録は残す
    expect(db.events.filter((record) => record.hostId === B)).toHaveLength(hosted.length);
  });
});
