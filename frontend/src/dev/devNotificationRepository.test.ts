import { describe, expect, it } from 'vitest';
import { createDevApplicationRepository } from './devApplicationRepository';
import { createDevDatabase } from './devDatabase';
import { createDevNotificationRepository } from './devNotificationRepository';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const HOST_ID = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';
const DAY_MS = 24 * 60 * 60 * 1000;

function setup(userId: string | null = 'dev-user-a') {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  const options = { db, session, now: () => NOW };
  return {
    db,
    session,
    applications: createDevApplicationRepository(options),
    notifications: createDevNotificationRepository(options),
  };
}

describe('通知の一覧', () => {
  it('自分の通知だけを、新しい順に返す', async () => {
    const { notifications } = setup();

    const items = await notifications.listMine();
    expect(items.map((item) => item.type)).toEqual([
      'application_approved',
      'event_hidden',
      'application_rejected',
    ]);
    expect(await notifications.countUnread()).toBe(2);
  });

  it('未ログインは空を返す', async () => {
    const { notifications } = setup(null);

    expect(await notifications.listMine()).toEqual([]);
    expect(await notifications.countUnread()).toBe(0);
  });

  it('非表示の募集は、名前を返さず開催日時だけを返す', async () => {
    const { notifications } = setup();

    const hidden = (await notifications.listMine()).find((item) => item.type === 'event_hidden');
    expect(hidden?.event).toEqual({
      hidden: true,
      startsAt: expect.any(String) as string,
      endsAt: expect.any(String) as string,
    });
  });

  it('参加者への通知には、申請した人を含めない。住所の項目を持たない', async () => {
    const { notifications } = setup();

    for (const item of await notifications.listMine()) {
      expect(item.applicant).toBeNull();
      expect(Object.keys(item).sort()).toEqual(
        ['applicant', 'createdAt', 'event', 'id', 'read', 'type'].sort(),
      );
    }
  });

  it('作成から90日を過ぎた通知は返さない（DB-02）', async () => {
    const { db, notifications } = setup();
    for (const item of db.notifications) item.createdAt = new Date(NOW.getTime() - 91 * DAY_MS);

    expect(await notifications.listMine()).toEqual([]);
    expect(await notifications.countUnread()).toBe(0);
  });
});

describe('既読', () => {
  it('自分の通知を既読にする', async () => {
    const { notifications } = setup();
    const ids = (await notifications.listMine()).map((item) => item.id);

    await notifications.markRead(ids);

    expect(await notifications.countUnread()).toBe(0);
  });

  it('他人の通知のIDを渡しても、変えない', async () => {
    const { db, session, notifications } = setup(HOST_ID);
    const hostIds = (await notifications.listMine()).map((item) => item.id);

    session.setUserId('dev-user-a');
    await notifications.markRead(hostIds);

    const hostItems = db.notifications.filter((item) => hostIds.includes(item.id));
    expect(hostItems.map((item) => item.readAt)).toEqual(hostItems.map(() => null));
  });
});

describe('申請・承認・却下の通知', () => {
  it('申請すると、主催者に申請した人のニックネームつきで1件届く（NTF-01）', async () => {
    const { session, applications, notifications } = setup();
    session.setUserId(HOST_ID);
    const before = await notifications.countUnread();

    session.setUserId('dev-user-a');
    await applications.applyToEvent(HOSTED_EVENT);
    // 申請した本人には届かない
    expect((await notifications.listMine()).map((item) => item.type)).not.toContain(
      'application_received',
    );

    session.setUserId(HOST_ID);
    expect(await notifications.countUnread()).toBe(before + 1);
    const [latest] = await notifications.listMine();
    expect(latest?.type).toBe('application_received');
    expect(latest?.applicant).toMatchObject({ isWithdrawn: false, nickname: 'あおい' });
    expect(latest?.event).toMatchObject({ hidden: false, id: HOSTED_EVENT });
  });

  it('承認・却下すると、申請者に1件ずつ届く（CND-04）', async () => {
    const { db, session, applications, notifications } = setup(HOST_ID);
    const pending = db.applications.filter(
      (item) => item.eventId === HOSTED_EVENT && item.status === 'pending',
    );
    const [first, second] = pending;
    if (!first || !second) throw new Error('承認待ちの申請が足りません。');

    await applications.approveApplication(first.id);
    await applications.rejectApplication(second.id);

    const received = (userId: string) =>
      db.notifications.filter((item) => item.userId === userId).map((item) => item.type);
    expect(received(first.userId)).toEqual(['application_approved']);
    expect(received(second.userId)).toEqual(['application_rejected']);
    // 主催者には届かない
    session.setUserId(HOST_ID);
    expect((await notifications.listMine()).map((item) => item.type)).not.toContain(
      'application_approved',
    );
  });

  it('同じ申請の同じ出来事は、2件にならない', async () => {
    const { db, applications } = setup(HOST_ID);
    const pending = db.applications.find(
      (item) => item.eventId === HOSTED_EVENT && item.status === 'pending',
    );
    if (!pending) throw new Error('承認待ちの申請がありません。');

    await applications.approveApplication(pending.id);
    // すでに承認済みのため断られ、通知も増えない
    await applications.approveApplication(pending.id);

    expect(
      db.notifications.filter(
        (item) => item.participantId === pending.id && item.type === 'application_approved',
      ),
    ).toHaveLength(1);
  });
});
