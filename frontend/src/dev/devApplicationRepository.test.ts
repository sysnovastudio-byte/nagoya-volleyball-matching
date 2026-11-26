import { createDevProfileRepository } from './devProfileRepository';
import { describe, expect, it } from 'vitest';
import { APPLICATION_LIMITS } from '../features/applications/types';
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
    expect(event?.myApplication).toBe('pending');
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

  it.each([
    ['満員', 'dev-easy-morning', 'full'],
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
        status: 'pending',
        appliedAt: new Date(NOW.getTime() - 60 * 1000),
        decidedAt: null,
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
    expect((await events.getEvent(HOSTED_EVENT))?.myApplication).toBe('approved');
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
        status: 'approved',
        appliedAt: NOW,
        decidedAt: NOW,
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
