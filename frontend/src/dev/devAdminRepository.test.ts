import { describe, expect, it } from 'vitest';
import { createDevAdminRepository } from './devAdminRepository';
import { createDevDatabase, findDevMember } from './devDatabase';
import { createDevSession } from './devSession';

const NOW = new Date();
const A = 'dev-user-a';
const B = 'dev-user-b';
const ADMIN = 'dev-admin';

function setup(userId: string | null = ADMIN, mfaVerified = true) {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId, { mfaVerified });
  const repository = createDevAdminRepository({ db, session, now: () => NOW });
  return { db, session, repository };
}

async function value<T>(promise: Promise<{ status: 'ok'; value: T } | { status: 'denied' }>) {
  const result = await promise;
  if (result.status !== 'ok') throw new Error('断られました');
  return result.value;
}

const SUSPEND = {
  reasonCode: 'harassment',
  reasonNote: '嫌がらせが続いたため。',
  reportId: null,
} as const;

describe('管理者の確認（docs/11の4-1）', () => {
  it('管理者で多要素認証が済んでいる場合だけ使える', async () => {
    expect(await setup(ADMIN).repository.getAccess()).toBe('granted');
    expect(await setup(ADMIN, false).repository.getAccess()).toBe('mfaRequired');
    expect(await setup(A).repository.getAccess()).toBe('forbidden');
    expect(await setup(null).repository.getAccess()).toBe('forbidden');
  });

  it.each([
    ['多要素認証が済んでいない管理者', ADMIN, false, 'mfaRequired'],
    ['一般の利用者', A, true, 'forbidden'],
  ] as const)('%sには、読み込みも操作も断る', async (_, userId, mfa, reason) => {
    const { db, repository } = setup(userId, mfa);

    expect(await repository.listReports('all')).toEqual({ status: 'denied', reason });
    expect(await repository.getReport('dev-report-1')).toEqual({ status: 'denied', reason });
    expect(await repository.searchUsers('あおい')).toEqual({ status: 'denied', reason });
    expect(await repository.suspendUser(B, SUSPEND)).toEqual({ status: 'denied', reason });
    expect(
      await repository.hideReportedEvent('dev-report-1', { reasonCode: 'other', reasonNote: null }),
    ).toEqual({ status: 'denied', reason });
    expect(
      await repository.updateReportStatus('dev-report-1', { status: 'inProgress', note: null }),
    ).toEqual({ status: 'denied', reason });
    expect(findDevMember(db, B)).toBeDefined();
    expect(db.reports.find((report) => report.id === 'dev-report-1')?.status).toBe('open');
  });
});

describe('通報管理（SAFE-06）', () => {
  it('未対応の件数と、状態ごとの一覧。未対応は古い順', async () => {
    const { repository } = setup();

    const open = await value(repository.listReports('open'));
    expect(open.openCount).toBe(2);
    expect(open.reports.map((report) => report.id)).toEqual(['dev-report-2', 'dev-report-1']);
    const all = await value(repository.listReports('all'));
    expect(all.reports.map((report) => report.status)).toEqual([
      'open',
      'open',
      'inProgress',
      'resolved',
      'dismissed',
    ]);
  });

  it('内容には控えを含め、住所・参加者・年代・メールアドレスを返さない', async () => {
    const { repository } = setup();

    const event = await value(repository.getReport('dev-report-1'));
    expect(Object.keys(event?.event ?? {}).sort()).toEqual([
      'cancelsOnHide',
      'description',
      'endsAt',
      'hostNickname',
      'id',
      'startsAt',
      'state',
      'title',
    ]);
    const user = await value(repository.getReport('dev-report-2'));
    expect(Object.keys(user?.profile ?? {}).sort()).toEqual(['bio', 'experienceLevel', 'nickname']);
    // 控えは通報したときの内容のまま（自己紹介はその後に消えた）
    expect(user?.snapshot).toMatchObject({ kind: 'user', bio: expect.any(String) as string });
    expect(user?.profile?.bio).toBeNull();
    // メッセージは控えだけ（M-05）
    const message = await value(repository.getReport('dev-report-3'));
    expect(message).toMatchObject({ snapshot: { kind: 'message' }, event: null, profile: null });
    expect(JSON.stringify([event, user, message])).not.toMatch(/address|email|ageGroup|location/i);
  });

  it('状態は 未対応→対応中→対応済み・対応不要 の順に変え、終わった通報は戻せない', async () => {
    const { db, repository } = setup();
    const report = () => db.reports.find((item) => item.id === 'dev-report-1');

    expect(
      await repository.updateReportStatus('dev-report-1', { status: 'resolved', note: null }),
    ).toEqual({ status: 'rejected', reason: 'invalidState' });
    expect(
      await repository.updateReportStatus('dev-report-1', { status: 'inProgress', note: null }),
    ).toEqual({ status: 'done' });
    expect(report()).toMatchObject({ status: 'inProgress', handledBy: ADMIN, handledAt: null });

    expect(
      await repository.updateReportStatus('dev-report-1', {
        status: 'resolved',
        note: '  主催者に確認した。 ',
      }),
    ).toEqual({ status: 'done' });
    expect(report()).toMatchObject({ status: 'resolved', resolutionNote: '主催者に確認した。' });
    expect(report()?.handledAt).toEqual(NOW);

    expect(
      await repository.updateReportStatus('dev-report-1', { status: 'inProgress', note: null }),
    ).toEqual({ status: 'rejected', reason: 'invalidState' });
  });

  it('未対応から、直接「対応不要」にもできる', async () => {
    const { repository } = setup();

    expect(
      await repository.updateReportStatus('dev-report-2', { status: 'dismissed', note: null }),
    ).toEqual({ status: 'done' });
    expect((await value(repository.listReports('open'))).openCount).toBe(1);
  });
});

describe('募集の非表示（SAFE-07、M-08）', () => {
  it('開催前の募集は、非表示と同時に中止し、承認待ち・承認済みの人と主催者に非表示だけを通知する', async () => {
    const { db, repository } = setup();
    const before = db.notifications.length;

    expect(
      await repository.hideReportedEvent('dev-report-1', {
        reasonCode: 'falseInformation',
        reasonNote: null,
      }),
    ).toEqual({ status: 'done' });

    const record = db.events.find((event) => event.id === 'dev-weekday-night');
    expect(record).toMatchObject({ hidden: true, status: 'cancelled' });
    const action = db.moderationActions.at(-1);
    expect(action).toMatchObject({
      action: 'hideEvent',
      targetUserId: 'dev-host-minato',
      eventId: 'dev-weekday-night',
      reportId: 'dev-report-1',
      reasonCode: 'falseInformation',
    });
    const added = db.notifications.slice(before);
    expect(added.every((item) => item.type === 'event_hidden')).toBe(true);
    expect(added.map((item) => item.userId)).toEqual(
      expect.arrayContaining(['dev-host-minato', A]),
    );
    expect(added[0]?.dedupeKey).toBe(`event:dev-weekday-night:hidden:${action?.id ?? ''}`);

    // 戻せない。2回目は断る
    expect(
      await repository.hideReportedEvent('dev-report-1', { reasonCode: 'other', reasonNote: null }),
    ).toEqual({ status: 'rejected', reason: 'invalidState' });
  });

  it('終了した募集は非表示だけにし、主催者にだけ通知する（DB-24）', async () => {
    const { db, repository } = setup();
    const [seed] = db.reports;
    if (!seed) throw new Error('通報のダミーがありません');
    db.reports.push({
      ...seed,
      id: 'ended-report',
      targetId: 'dev-ended',
      subjectUserId: 'dev-host-haru',
    });
    const before = db.notifications.length;

    await repository.hideReportedEvent('ended-report', { reasonCode: 'other', reasonNote: null });

    expect(db.events.find((event) => event.id === 'dev-ended')).toMatchObject({
      hidden: true,
      status: 'open',
    });
    expect(db.notifications.slice(before).map((item) => item.userId)).toEqual(['dev-host-haru']);
  });

  it('募集以外の通報では非表示にできない', async () => {
    const { repository } = setup();

    expect(
      await repository.hideReportedEvent('dev-report-3', { reasonCode: 'other', reasonNote: null }),
    ).toEqual({ status: 'rejected', reason: 'notFound' });
  });
});

describe('利用者管理（SAFE-05・CND-07）', () => {
  it('ニックネームの一部で探す。管理者は出ない', async () => {
    const { repository } = setup();

    expect(await value(repository.searchUsers('あお'))).toEqual([
      { userId: A, nickname: 'あおい', status: 'active' },
    ]);
    expect(await value(repository.searchUsers('かいと'))).toEqual([
      { userId: 'dev-user-suspended', nickname: 'かいと', status: 'suspended' },
    ]);
    expect(await value(repository.searchUsers('  '))).toEqual([]);
    expect(await value(repository.getUser(ADMIN))).toBeNull();
  });

  it('停止中の人は、状態と措置の履歴を示す', async () => {
    const { repository } = setup();

    expect(await value(repository.getUser('dev-user-suspended'))).toMatchObject({
      status: 'suspended',
      suspensionImpact: null,
      actions: [{ action: 'suspend', reasonCode: 'dating' }],
    });
  });

  it('停止すると、開催前の参加をキャンセル・承認待ちを取り下げ、主催者へはキャンセルだけを通知する', async () => {
    const { db, repository } = setup();
    expect((await value(repository.getUser(A)))?.suspensionImpact).toEqual({
      cancelledParticipations: 1,
      retractedApplications: 1,
      cancelledEvents: 0,
    });
    const before = db.notifications.length;

    const result = await repository.suspendUser(A, SUSPEND);

    expect(result).toEqual({
      status: 'done',
      impact: { cancelledParticipations: 1, retractedApplications: 1, cancelledEvents: 0 },
    });
    expect(findDevMember(db, A)).toBeUndefined();
    const status = (eventId: string) =>
      db.applications.find((item) => item.eventId === eventId && item.userId === A)?.status;
    expect(status('dev-family-morning')).toBe('cancelled');
    expect(status('dev-weekday-night')).toBe('retracted');
    // 開催中・終了・非表示の募集の参加は変えない
    expect(status('dev-ongoing')).toBe('approved');
    expect(status('dev-hidden')).toBe('approved');
    expect(db.notifications.slice(before)).toMatchObject([
      { userId: 'dev-host-yui', type: 'participation_cancelled' },
    ]);
    expect(db.moderationActions.at(-1)).toMatchObject({
      action: 'suspend',
      adminId: ADMIN,
      targetUserId: A,
      reasonNote: '嫌がらせが続いたため。',
    });
  });

  it('停止すると、主催する開催前の募集を中止し、参加者へ通常の中止として通知する（M-03）', async () => {
    const { db, repository } = setup();
    const before = db.notifications.length;

    const result = await repository.suspendUser(B, SUSPEND);

    expect(result).toMatchObject({ status: 'done', impact: { cancelledEvents: 2 } });
    for (const id of ['dev-beginner-afternoon', 'dev-b-full']) {
      expect(db.events.find((event) => event.id === id)?.status).toBe('cancelled');
    }
    expect(db.events.find((event) => event.id === 'dev-ongoing')?.status).not.toBe('cancelled');
    expect(
      db.moderationActions.filter((action) => action.action === 'cancelEventBySuspension'),
    ).toHaveLength(2);
    const added = db.notifications.slice(before);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((item) => item.type === 'event_cancelled')).toBe(true);
    expect(added.map((item) => item.dedupeKey)).toContain('event:dev-beginner-afternoon:cancelled');
  });

  it('停止は理由の分類と補足が必須。きっかけの通報は、通報された人が同じであること', async () => {
    const { db, repository } = setup();

    expect(await repository.suspendUser(B, { ...SUSPEND, reasonNote: '  ' })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(
      await repository.suspendUser(B, { ...SUSPEND, reasonCode: 'unknown' as 'other' }),
    ).toMatchObject({ reason: 'invalid' });
    expect(await repository.suspendUser(B, { ...SUSPEND, reportId: 'dev-report-2' })).toMatchObject(
      { reason: 'invalid' },
    );
    expect(findDevMember(db, B)).toBeDefined();
    expect(
      await repository.suspendUser('dev-host-tsubasa', { ...SUSPEND, reportId: 'dev-report-2' }),
    ).toMatchObject({ status: 'done' });
    expect(db.moderationActions.at(-1)?.reportId).toBe('dev-report-2');
  });

  it('二重の停止と、管理者の停止は断る', async () => {
    const { repository } = setup();

    expect(await repository.suspendUser('dev-user-suspended', SUSPEND)).toEqual({
      status: 'rejected',
      reason: 'invalidState',
    });
    expect(await repository.suspendUser(ADMIN, SUSPEND)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
  });

  it('解除は補足が必須で、取り消した参加は戻さない', async () => {
    const { db, repository } = setup();
    await repository.suspendUser(A, SUSPEND);

    expect(await repository.unsuspendUser(A, { reasonNote: '' })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(await repository.unsuspendUser(A, { reasonNote: '誤りだったため。' })).toEqual({
      status: 'done',
    });
    expect(findDevMember(db, A)).toBeDefined();
    expect(
      db.applications.find((item) => item.eventId === 'dev-family-morning' && item.userId === A)
        ?.status,
    ).toBe('cancelled');
    expect(db.moderationActions.at(-1)).toMatchObject({ action: 'unsuspend', reasonCode: null });
    expect(await repository.unsuspendUser(A, { reasonNote: 'もう一度' })).toMatchObject({
      reason: 'invalidState',
    });
  });
});
