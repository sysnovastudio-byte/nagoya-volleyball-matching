import { createDevProfileRepository } from './devProfileRepository';
import { describe, expect, it } from 'vitest';
import { APPLICATION_LIMITS, type RevokeReason } from '../features/applications/types';
import { createDevApplicationRepository } from './devApplicationRepository';
import { createDevDatabase } from './devDatabase';
import { createDevEventRepository } from './devEventRepository';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const HOST_ID = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';
const FULL_EVENT = 'dev-b-full';

function setup(userId: string | null = 'dev-user-a') {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  const options = { db, session, now: () => NOW };
  return {
    db,
    session,
    applications: createDevApplicationRepository(options),
    events: createDevEventRepository(options),
  };
}

/** 主催者として、申請者一覧を取り出す。 */
async function applicantsOf(
  applications: ReturnType<typeof setup>['applications'],
  eventId: string,
) {
  const result = await applications.listApplicants(eventId);
  if (result.status !== 'ready') throw new Error(`申請者一覧を取得できません：${result.status}`);
  return result.list;
}

describe('参加の申請', () => {
  it('申請できる。申請は承認待ちになり、定員には数えない', async () => {
    const { applications, events } = setup();

    expect(await applications.applyToEvent(HOSTED_EVENT)).toEqual({ status: 'applied' });

    const event = await events.getEvent(HOSTED_EVENT);
    expect(event?.myApplication?.status).toBe('pending');
    expect(event?.remaining).toBe(3);
  });

  it('18歳未満の人も申請できる（docs/11の7-1）', async () => {
    const { applications } = setup('dev-user-minor');

    expect(await applications.applyToEvent('dev-family-morning')).toEqual({ status: 'applied' });
  });

  it('重複して申請できない', async () => {
    const { applications, db } = setup();
    await applications.applyToEvent(HOSTED_EVENT);

    expect(await applications.applyToEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'alreadyApplied',
    });
    expect(
      db.applications.filter((a) => a.eventId === HOSTED_EVENT && a.userId === 'dev-user-a'),
    ).toHaveLength(1);
  });

  it('同時に送っても、1件だけ登録される', async () => {
    const { applications, db } = setup();

    await Promise.all([
      applications.applyToEvent(HOSTED_EVENT),
      applications.applyToEvent(HOSTED_EVENT),
    ]);

    expect(
      db.applications.filter((a) => a.eventId === HOSTED_EVENT && a.userId === 'dev-user-a'),
    ).toHaveLength(1);
  });

  it('主催者は自分の募集に申請できない', async () => {
    const { applications } = setup(HOST_ID);

    expect(await applications.applyToEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'ownEvent',
    });
  });

  it('承認済みの募集には、もう一度申請できない', async () => {
    expect(await setup().applications.applyToEvent('dev-family-morning')).toEqual({
      status: 'rejected',
      reason: 'alreadyApplied',
    });
  });

  it('却下された募集には、もう申請できない', async () => {
    expect(await setup().applications.applyToEvent('dev-spike-practice')).toEqual({
      status: 'rejected',
      reason: 'notReapplicable',
    });
  });

  it('満員の募集にも申請でき、承認待ちになる（2026-11-26 の決定）', async () => {
    const { applications, db } = setup('dev-member-16');

    expect(await applications.applyToEvent('dev-easy-morning')).toEqual({ status: 'applied' });
    expect(db.applications.at(-1)).toMatchObject({
      eventId: 'dev-easy-morning',
      userId: 'dev-member-16',
      status: 'pending',
    });
  });

  it.each([
    ['締切', 'dev-spike-practice', 'notAccepting'],
    ['開催中', 'dev-ongoing', 'notAccepting'],
    ['中止', 'dev-cancelled', 'notAccepting'],
    ['非表示', 'dev-b-hidden', 'notFound'],
    ['存在しない', 'unknown', 'notFound'],
  ])('%sの募集には申請できない', async (_, eventId, reason) => {
    // 締切の募集で却下されていない人として確かめるため、別の利用者にする
    const { applications } = setup('dev-member-16');

    expect(await applications.applyToEvent(eventId)).toEqual({ status: 'rejected', reason });
  });

  it.each([
    [null, 'notLoggedIn'],
    ['dev-user-no-profile', 'profileRequired'],
  ])('%s は申請できない', async (userId, reason) => {
    expect(await setup(userId).applications.applyToEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason,
    });
  });

  it('直近24時間の申請は、上限まで', async () => {
    const { applications, db } = setup();
    for (let i = 0; i < APPLICATION_LIMITS.dailyApplyLimit; i += 1) {
      db.applications.push({
        id: `limit-${i}`,
        eventId: `other-${i}`,
        userId: 'dev-user-a',
        attemptNo: 1,
        status: 'pending',
        appliedAt: new Date(NOW.getTime() - 60 * 1000),
        decidedAt: null,
        cancelledAt: null,
        retractedAt: null,
        revokedAt: null,
        revokeReason: null,
      });
    }

    expect(await applications.applyToEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
  });
});

describe('承認・却下', () => {
  it('承認すると、住所が見られるようになる', async () => {
    const { applications, events, session } = setup();
    await applications.applyToEvent(HOSTED_EVENT);
    expect(await events.getLocation(HOSTED_EVENT)).toBeNull();

    session.setUserId(HOST_ID);
    const list = await applicantsOf(applications, HOSTED_EVENT);
    const mine = list.applicants.find(
      (a) => !a.profile.isWithdrawn && a.profile.nickname === 'あおい',
    );
    if (!mine) throw new Error('申請が見つかりません。');
    expect(await applications.approveApplication(mine.applicationId)).toEqual({ status: 'done' });

    session.setUserId('dev-user-a');
    expect((await events.getEvent(HOSTED_EVENT))?.myApplication?.status).toBe('approved');
    expect(await events.getLocation(HOSTED_EVENT)).toMatchObject({
      address: 'ダミー住所A（架空）',
    });
    // 主催者・承認済みでない人には返らない
    session.setUserId('dev-user-minor');
    expect(await events.getLocation(HOSTED_EVENT)).toBeNull();
  });

  it('残り枠を承認で埋めると満員になり、承認待ちは残る', async () => {
    const { applications } = setup(HOST_ID);
    const before = await applicantsOf(applications, HOSTED_EVENT);
    const pending = before.applicants.filter((a) => a.status === 'pending');
    expect(before.event.capacity - before.event.approvedCount).toBe(3);

    // 残り3枠のうち、承認待ち3件を順に承認する
    for (const applicant of pending) {
      expect(await applications.approveApplication(applicant.applicationId)).toEqual({
        status: 'done',
      });
    }
    const after = await applicantsOf(applications, HOSTED_EVENT);
    expect(after.event).toMatchObject({ state: 'full', approvedCount: 12 });
  });

  it('満員の場合、定員を増やす指定がなければ承認せず、承認待ちのまま残す', async () => {
    const { applications } = setup(HOST_ID);
    const full = await applicantsOf(applications, FULL_EVENT);
    expect(full.event).toMatchObject({ state: 'full', capacity: 6, approvedCount: 6 });
    const [next] = full.applicants.filter((a) => a.status === 'pending');
    if (!next) throw new Error('承認待ちがありません。');

    expect(await applications.approveApplication(next.applicationId)).toEqual({
      status: 'rejected',
      reason: 'full',
    });
    // 今の定員＋1と合わない指定も断る（ほかの操作で定員が変わった場合）
    expect(
      await applications.approveApplication(next.applicationId, { expandCapacityTo: 8 }),
    ).toEqual({ status: 'rejected', reason: 'full' });
    expect(
      (await applicantsOf(applications, FULL_EVENT)).applicants.filter(
        (a) => a.status === 'pending',
      ),
    ).toHaveLength(2);
    expect(await applications.rejectApplication(next.applicationId)).toEqual({ status: 'done' });
  });

  it('満員の場合、定員を1人増やして承認する。定員は承認済み人数以上のまま', async () => {
    const { applications } = setup(HOST_ID);
    const [next] = (await applicantsOf(applications, FULL_EVENT)).applicants.filter(
      (a) => a.status === 'pending',
    );
    if (!next) throw new Error('承認待ちがありません。');

    expect(
      await applications.approveApplication(next.applicationId, { expandCapacityTo: 7 }),
    ).toEqual({ status: 'done' });
    expect((await applicantsOf(applications, FULL_EVENT)).event).toMatchObject({
      state: 'full',
      capacity: 7,
      approvedCount: 7,
    });
  });

  it('満員でも定員が上限の100人なら、承認できない', async () => {
    const { applications, db } = setup(HOST_ID);
    const record = db.events.find((event) => event.id === FULL_EVENT);
    if (!record) throw new Error('募集がありません。');
    const [next] = (await applicantsOf(applications, FULL_EVENT)).applicants.filter(
      (a) => a.status === 'pending',
    );
    if (!next) throw new Error('承認待ちがありません。');
    // 定員を上限の100人にし、承認済みも100人にそろえる
    record.capacity = 100;
    for (let index = 0; index < 94; index += 1) {
      db.applications.push({
        id: `filler-${index}`,
        eventId: FULL_EVENT,
        userId: `filler-user-${index}`,
        attemptNo: 1,
        status: 'approved',
        appliedAt: NOW,
        decidedAt: NOW,
        cancelledAt: null,
        retractedAt: null,
        revokedAt: null,
        revokeReason: null,
      });
    }

    expect(
      await applications.approveApplication(next.applicationId, { expandCapacityTo: 101 }),
    ).toEqual({ status: 'rejected', reason: 'capacityLimit' });
    expect(record.capacity).toBe(100);
  });

  it('同時に承認しても、定員を超えない', async () => {
    const { applications, session } = setup();
    // 残り3枠に対して、承認待ちを4件にする
    await applications.applyToEvent(HOSTED_EVENT);
    session.setUserId(HOST_ID);
    const pending = (await applicantsOf(applications, HOSTED_EVENT)).applicants.filter(
      (a) => a.status === 'pending',
    );
    expect(pending).toHaveLength(4);

    const results = await Promise.all(
      pending.map((applicant) => applications.approveApplication(applicant.applicationId)),
    );

    expect(results.filter((result) => result.status === 'done')).toHaveLength(3);
    expect((await applicantsOf(applications, HOSTED_EVENT)).event.approvedCount).toBe(12);
  });

  it('同じ申請を2回承認・却下できない', async () => {
    const { applications } = setup(HOST_ID);
    const [target] = (await applicantsOf(applications, HOSTED_EVENT)).applicants.filter(
      (a) => a.status === 'pending',
    );
    if (!target) throw new Error('承認待ちがありません。');

    await applications.rejectApplication(target.applicationId);

    expect(await applications.approveApplication(target.applicationId)).toEqual({
      status: 'rejected',
      reason: 'notPending',
    });
  });

  it('開催が始まった募集の申請は、承認・却下できない', async () => {
    const { applications } = setup(HOST_ID);
    const list = await applicantsOf(applications, 'dev-ongoing');
    const [target] = list.applicants.filter((a) => a.status === 'pending');
    if (!target) throw new Error('承認待ちがありません。');

    expect(list.event.canDecide).toBe(false);
    expect(await applications.approveApplication(target.applicationId)).toEqual({
      status: 'rejected',
      reason: 'notAccepting',
    });
  });

  it('主催者でない人は、承認・却下できない', async () => {
    const { applications, session } = setup(HOST_ID);
    const [target] = (await applicantsOf(applications, HOSTED_EVENT)).applicants.filter(
      (a) => a.status === 'pending',
    );
    if (!target) throw new Error('承認待ちがありません。');

    session.setUserId('dev-user-a');

    expect(await applications.approveApplication(target.applicationId)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(await applications.rejectApplication(target.applicationId)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
  });
});

describe('申請者一覧', () => {
  it('主催者には、申請者のプロフィールの公開項目を返す', async () => {
    const list = await applicantsOf(setup(HOST_ID).applications, HOSTED_EVENT);

    expect(list.event).toMatchObject({ capacity: 12, approvedCount: 9, canDecide: true });
    expect(list.applicants).toHaveLength(13);
    for (const applicant of list.applicants) {
      expect(Object.keys(applicant.profile).sort()).toEqual(
        ['bio', 'experienceLevel', 'isWithdrawn', 'nickname', 'userId'].sort(),
      );
    }
  });

  it.each(['dev-user-a', 'dev-user-minor'])(
    '他人の募集の申請者一覧は見られない（%s）',
    async (userId) => {
      expect(await setup(userId).applications.listApplicants(HOSTED_EVENT)).toEqual({
        status: 'forbidden',
        reason: 'notHost',
      });
    },
  );

  it('未ログインには返さない', async () => {
    expect(await setup(null).applications.listApplicants(HOSTED_EVENT)).toEqual({
      status: 'notFound',
    });
  });

  it('見られない他人の募集は、ない場合と同じに扱う', async () => {
    expect(await setup().applications.listApplicants('dev-hidden')).toEqual({
      status: 'notFound',
    });
  });

  it('非表示の募集は、主催者にも見せない（DB-19 の仮の扱い）', async () => {
    expect(await setup(HOST_ID).applications.listApplicants('dev-b-hidden')).toEqual({
      status: 'forbidden',
      reason: 'hidden',
    });
  });
});

describe('自分の申請', () => {
  it('状態ごとに返し、非表示の募集は開催日時だけを返す', async () => {
    const participations = await setup().applications.getMyParticipations();

    expect(
      participations.map(({ status, event }) => [event.hidden ? 'hidden' : event.id, status]),
    ).toEqual(
      expect.arrayContaining([
        ['dev-family-morning', 'approved'],
        ['dev-weekday-night', 'pending'],
        ['dev-spike-practice', 'rejected'],
        ['dev-ended', 'approved'],
        ['hidden', 'approved'],
      ]),
    );
    const hidden = participations.find(({ event }) => event.hidden);
    expect(Object.keys(hidden?.event ?? {}).sort()).toEqual(['endsAt', 'hidden', 'startsAt']);
  });

  it('未ログインには空を返す', async () => {
    expect(await setup(null).applications.getMyParticipations()).toEqual([]);
  });
});

describe('申請者の年代', () => {
  it('承認待ち・承認済みの人の分だけを、主催者に返す', async () => {
    const { applications } = setup(HOST_ID);
    const list = await applicantsOf(applications, HOSTED_EVENT);

    for (const applicant of list.applicants) {
      if (applicant.status === 'pending' || applicant.status === 'approved') {
        expect(applicant.hostOnly).not.toBeNull();
      } else {
        expect(applicant.hostOnly).toBeNull();
      }
    }
    const minor = list.applicants.find((a) => a.profile.userId === 'dev-user-minor');
    expect(minor?.hostOnly).toEqual({ ageGroup: 'teens' });
  });

  it('終了した募集では、主催者にも年代を返さない', async () => {
    const { applications } = setup(HOST_ID);
    const list = await applicantsOf(applications, 'dev-b-ended');

    expect(list.applicants.length).toBeGreaterThan(0);
    for (const applicant of list.applicants) expect(applicant.hostOnly).toBeNull();
  });

  it('ほかの人のプロフィールの取得には、年代を含めない', async () => {
    const { db, session } = setup(HOST_ID);
    const profiles = createDevProfileRepository({ db, session });

    for (const profile of await profiles.getProfiles(['dev-user-a', 'dev-user-minor'])) {
      expect(Object.keys(profile)).not.toContain('ageGroup');
    }
  });
});

describe('参加のキャンセル（APP-08）', () => {
  /** 利用者Aの承認済みの申請（dev-family-morning）。 */
  const approvedOf = (db: ReturnType<typeof setup>['db']) => {
    const application = db.applications.find(
      (item) => item.eventId === 'dev-family-morning' && item.userId === 'dev-user-a',
    );
    if (!application) throw new Error('承認済みの申請がありません。');
    return application;
  };

  it('キャンセルすると枠が戻り、住所が見られなくなり、主催者に1件だけ通知する', async () => {
    const { db, applications, events } = setup();
    const application = approvedOf(db);
    const before = (await events.getEvent('dev-family-morning'))?.remaining ?? 0;

    expect(await applications.cancelParticipation(application.id)).toEqual({ status: 'done' });

    expect(application.status).toBe('cancelled');
    expect(application.cancelledAt).toEqual(NOW);
    // 承認の日時は残す（docs/06の4-5）
    expect(application.decidedAt).not.toBeNull();
    expect((await events.getEvent('dev-family-morning'))?.remaining).toBe(before + 1);
    expect(await events.getLocation('dev-family-morning')).toBeNull();
    const sent = db.notifications.filter((item) => item.participantId === application.id);
    expect(sent.map((item) => [item.userId, item.type])).toContainEqual([
      'dev-host-yui',
      'participation_cancelled',
    ]);
    // 2回目は断られ、通知も増えない
    expect(await applications.cancelParticipation(application.id)).toEqual({
      status: 'rejected',
      reason: 'invalidState',
    });
    expect(db.notifications.filter((item) => item.participantId === application.id)).toEqual(sent);
  });

  it('承認待ちの申請はキャンセルできない（取り下げを使う）', async () => {
    const { db, applications } = setup();
    const pending = db.applications.find(
      (item) => item.eventId === 'dev-weekday-night' && item.userId === 'dev-user-a',
    );
    if (!pending) throw new Error('承認待ちの申請がありません。');

    expect(await applications.cancelParticipation(pending.id)).toEqual({
      status: 'rejected',
      reason: 'invalidState',
    });
  });

  it('他人の申請は、ない場合と同じに扱う', async () => {
    const { db, applications } = setup(HOST_ID);

    expect(await applications.cancelParticipation(approvedOf(db).id)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(approvedOf(db).status).toBe('approved');
  });

  it('開催が始まった募集では、キャンセルできない', async () => {
    const { db, applications } = setup();
    const ongoing = db.applications.find(
      (item) => item.eventId === 'dev-ongoing' && item.userId === 'dev-user-a',
    );
    if (!ongoing) throw new Error('開催中の申請がありません。');

    expect(await applications.cancelParticipation(ongoing.id)).toEqual({
      status: 'rejected',
      reason: 'notAccepting',
    });
  });
});

describe('申請の取り下げ（CND-10）', () => {
  const pendingOf = (db: ReturnType<typeof setup>['db']) => {
    const application = db.applications.find(
      (item) => item.eventId === 'dev-weekday-night' && item.userId === 'dev-user-a',
    );
    if (!application) throw new Error('承認待ちの申請がありません。');
    return application;
  };

  it('取り下げると状態と日時が残り、主催者には通知しない', async () => {
    const { db, applications } = setup();
    const application = pendingOf(db);
    const before = db.notifications.length;

    expect(await applications.retractApplication(application.id)).toEqual({ status: 'done' });

    expect(application.status).toBe('retracted');
    expect(application.retractedAt).toEqual(NOW);
    expect(application.decidedAt).toBeNull();
    expect(db.notifications).toHaveLength(before);
  });

  it('承認済みの申請は取り下げられない（キャンセルを使う）', async () => {
    const { db, applications } = setup();
    const approved = db.applications.find(
      (item) => item.eventId === 'dev-family-morning' && item.userId === 'dev-user-a',
    );
    if (!approved) throw new Error('承認済みの申請がありません。');

    expect(await applications.retractApplication(approved.id)).toEqual({
      status: 'rejected',
      reason: 'invalidState',
    });
  });

  it('他人の申請は取り下げられない', async () => {
    const { db, applications } = setup(HOST_ID);

    expect(await applications.retractApplication(pendingOf(db).id)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
  });

  it('取り下げた申請は、主催者には承認・却下できない', async () => {
    const { db, session, applications } = setup();
    const application = pendingOf(db);
    await applications.retractApplication(application.id);

    session.setUserId('dev-host-minato');
    expect(await applications.approveApplication(application.id)).toEqual({
      status: 'rejected',
      reason: 'notPending',
    });
  });
});

describe('再申請（docs/11の2-2）', () => {
  it('キャンセルの後は再申請でき、新しい申請になる。前の申請は残る', async () => {
    const { db, applications, events } = setup();
    // 利用者Aは dev-easy-morning（満員）をキャンセルしている
    expect((await events.getEvent('dev-easy-morning'))?.myApplication).toMatchObject({
      status: 'cancelled',
      canReapply: true,
    });

    expect(await applications.applyToEvent('dev-easy-morning')).toEqual({ status: 'applied' });

    const mine = db.applications.filter(
      (item) => item.eventId === 'dev-easy-morning' && item.userId === 'dev-user-a',
    );
    expect(mine.map((item) => [item.attemptNo, item.status])).toEqual([
      [1, 'cancelled'],
      [2, 'pending'],
    ]);
    expect((await events.getEvent('dev-easy-morning'))?.myApplication?.status).toBe('pending');
  });

  it('取り下げの後も再申請できる', async () => {
    const { db, applications } = setup();
    const pending = db.applications.find(
      (item) => item.eventId === 'dev-weekday-night' && item.userId === 'dev-user-a',
    );
    if (!pending) throw new Error('承認待ちの申請がありません。');
    await applications.retractApplication(pending.id);

    expect(await applications.applyToEvent('dev-weekday-night')).toEqual({ status: 'applied' });
  });

  it('同じ募集への申請は、合計3回まで', async () => {
    const { db, applications, events } = setup();
    const retractLatest = async () => {
      const latest = db.applications.findLast(
        (item) => item.eventId === 'dev-weekday-night' && item.userId === 'dev-user-a',
      );
      if (!latest) throw new Error('申請がありません。');
      await applications.retractApplication(latest.id);
    };

    await retractLatest();
    await applications.applyToEvent('dev-weekday-night');
    await retractLatest();
    await applications.applyToEvent('dev-weekday-night');
    await retractLatest();

    expect((await events.getEvent('dev-weekday-night'))?.myApplication).toMatchObject({
      status: 'retracted',
      canReapply: false,
    });
    expect(await applications.applyToEvent('dev-weekday-night')).toEqual({
      status: 'rejected',
      reason: 'attemptLimit',
    });
  });

  it('却下の後は再申請できない', async () => {
    const { applications, events } = setup();

    expect((await events.getEvent('dev-spike-practice'))?.myApplication?.canReapply).toBe(false);
    expect(await applications.applyToEvent('dev-spike-practice')).toEqual({
      status: 'rejected',
      reason: 'notReapplicable',
    });
  });

  it('主催者の申請者一覧と、自分の申請には、最新の申請だけを示す', async () => {
    const { session, applications } = setup();
    await applications.applyToEvent('dev-easy-morning');

    const mine = (await applications.getMyParticipations()).filter(
      (item) => !item.event.hidden && item.event.id === 'dev-easy-morning',
    );
    expect(mine.map((item) => item.status)).toEqual(['pending']);

    session.setUserId('dev-host-haru');
    const list = await applicantsOf(applications, 'dev-easy-morning');
    expect(
      list.applicants
        .filter((item) => item.profile.userId === 'dev-user-a')
        .map((item) => item.status),
    ).toEqual(['pending']);
  });
});

describe('承認の取り消し（APP-11）', () => {
  /** 利用者Bが主催する募集の、承認済みの申請。 */
  const approvedOf = (db: ReturnType<typeof setup>['db']) => {
    const application = db.applications.find(
      (item) => item.eventId === HOSTED_EVENT && item.status === 'approved',
    );
    if (!application) throw new Error('承認済みの申請がありません。');
    return application;
  };

  it('理由を記録して取り消し、枠を戻し、参加者に1件だけ通知する', async () => {
    const { db, session, applications, events } = setup(HOST_ID);
    const application = approvedOf(db);
    const before = (await events.getEvent(HOSTED_EVENT))?.remaining ?? 0;

    expect(await applications.revokeApproval(application.id, 'not_matching')).toEqual({
      status: 'done',
    });

    expect(application).toMatchObject({
      status: 'revoked',
      revokedAt: NOW,
      revokeReason: 'not_matching',
    });
    expect((await events.getEvent(HOSTED_EVENT))?.remaining).toBe(before + 1);
    const sent = db.notifications.filter((item) => item.participantId === application.id);
    expect(sent.map((item) => [item.userId, item.type])).toEqual([
      [application.userId, 'approval_revoked'],
    ]);
    // 参加者は住所を見られず、同じ募集に再申請できない
    session.setUserId(application.userId);
    expect(await events.getLocation(HOSTED_EVENT)).toBeNull();
    expect((await events.getEvent(HOSTED_EVENT))?.myApplication).toMatchObject({
      status: 'revoked',
      canReapply: false,
    });
    expect(await applications.applyToEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'notReapplicable',
    });
  });

  it('理由がなければ取り消さない', async () => {
    const { db, applications } = setup(HOST_ID);
    const application = approvedOf(db);

    expect(
      await applications.revokeApproval(application.id, '' as unknown as RevokeReason),
    ).toEqual({ status: 'rejected', reason: 'reasonRequired' });
    expect(application.status).toBe('approved');
  });

  it('承認待ちの申請は取り消せない', async () => {
    const { db, applications } = setup(HOST_ID);
    const pending = db.applications.find(
      (item) => item.eventId === HOSTED_EVENT && item.status === 'pending',
    );
    if (!pending) throw new Error('承認待ちの申請がありません。');

    expect(await applications.revokeApproval(pending.id, 'other')).toEqual({
      status: 'rejected',
      reason: 'notApproved',
    });
  });

  it('主催者でない人は取り消せない', async () => {
    const { db, applications } = setup();
    const application = approvedOf(db);

    expect(await applications.revokeApproval(application.id, 'other')).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(application.status).toBe('approved');
  });

  it('開催が始まった募集では取り消せない', async () => {
    const { db, applications } = setup(HOST_ID);
    const ongoing = db.applications.find(
      (item) => item.eventId === 'dev-ongoing' && item.status === 'approved',
    );
    if (!ongoing) throw new Error('開催中の承認済みがありません。');

    expect(await applications.revokeApproval(ongoing.id, 'safety')).toEqual({
      status: 'rejected',
      reason: 'notAccepting',
    });
  });
});
