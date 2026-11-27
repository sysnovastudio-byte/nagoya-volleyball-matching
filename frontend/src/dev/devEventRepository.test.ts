import { describe, expect, it } from 'vitest';
import type { CreateEventInput, EventListResult } from '../features/events/types';
import { createDevDatabase } from './devDatabase';
import { createDevEventRepository } from './devEventRepository';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const PUBLIC_KEYS = [
  'area',
  'belongings',
  'capacity',
  'description',
  'endsAt',
  'fee',
  'hostNickname',
  'id',
  'kind',
  'remaining',
  'startsAt',
  'state',
  'targetLevels',
  'title',
];

const HOST_ID = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';

function setup({ userId = null, pageSize }: { userId?: string | null; pageSize?: number } = {}) {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  let now = NOW;
  const repository = createDevEventRepository({
    db,
    session,
    now: () => now,
    ...(pageSize ? { pageSize } : {}),
  });
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { db, session, repository, advance };
}

let requestCount = 0;
function input(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  requestCount += 1;
  return {
    clientRequestId: `request-${requestCount}`,
    title: '作成した募集',
    startsAt: '2026-12-10T04:00:00Z',
    endsAt: '2026-12-10T07:00:00Z',
    area: { municipality: 'nagoya', ward: 'naka' },
    targetLevels: ['beginner'],
    kind: null,
    description: null,
    belongings: null,
    capacity: 10,
    fee: 500,
    location: { venueName: 'ダミー体育館Z', address: 'ダミー住所Z（架空）', note: null },
    ...overrides,
  };
}

describe('募集の一覧', () => {
  it('開催前の募集だけを、開催日時の順に返す', async () => {
    const { items, nextCursor } = await setup().repository.listEvents();

    expect(items.map((event) => event.id)).toEqual([
      'dev-b-full',
      'dev-beginner-afternoon',
      'dev-easy-morning',
      'dev-weekday-night',
      'dev-spike-practice',
      'dev-family-morning',
    ]);
    expect(nextCursor).toBeNull();
  });

  it('状態と残り枠を計算して返す', async () => {
    const { items } = await setup().repository.listEvents();

    expect(items.map(({ state, remaining }) => [state, remaining])).toEqual([
      ['full', 0],
      ['open', 3],
      ['full', 0],
      ['open', 1],
      ['open', 2],
      ['open', 6],
    ]);
  });

  it('公開してよい項目だけを返す。主催者が見ても住所を含めない', async () => {
    const { items } = await setup({ userId: HOST_ID }).repository.listEvents();

    for (const event of items) {
      expect(Object.keys(event).sort()).toEqual(PUBLIC_KEYS);
    }
  });

  it('続きを、重複も抜けもなく返す', async () => {
    const { repository } = setup({ pageSize: 2 });
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page: EventListResult = await repository.listEvents(cursor);
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('募集の絞り込み（EVT-05）', () => {
  const NONE = {
    dateFrom: null,
    dateTo: null,
    municipality: null,
    ward: null,
    availability: null,
  };

  it('名古屋市の区で絞り込む', async () => {
    const { items } = await setup().repository.listEvents(undefined, {
      ...NONE,
      municipality: 'nagoya',
      ward: 'nakamura',
    });

    expect(items.map((event) => event.id)).toEqual([
      'dev-beginner-afternoon',
      'dev-family-morning',
    ]);
  });

  it('名古屋市以外の市町村で絞り込む', async () => {
    const { items } = await setup().repository.listEvents(undefined, {
      ...NONE,
      municipality: 'ichinomiya',
    });

    expect(items.map((event) => event.id)).toEqual(['dev-weekday-night']);
  });

  it('名古屋市で区を指定しなければ、名古屋市のすべての区の募集を返す', async () => {
    const { items } = await setup().repository.listEvents(undefined, {
      ...NONE,
      municipality: 'nagoya',
    });

    expect(items.map((event) => event.id)).not.toContain('dev-weekday-night');
    expect(items.map((event) => event.id)).not.toContain('dev-spike-practice');
    expect(items.map((event) => event.id)).toContain('dev-beginner-afternoon');
    expect(items.map((event) => event.id)).toContain('dev-easy-morning');
  });

  it('受付の状態（受付中／満員）で絞り込む。締切は、どちらにも含めない', async () => {
    const { repository } = setup();
    const all = (await repository.listEvents(undefined, NONE)).items;
    const open = (await repository.listEvents(undefined, { ...NONE, availability: 'open' })).items;
    const full = (await repository.listEvents(undefined, { ...NONE, availability: 'full' })).items;

    expect(open.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(0);
    expect(open.every((event) => event.state === 'open')).toBe(true);
    expect(full.every((event) => event.state === 'full')).toBe(true);
    expect(open.length + full.length).toBe(all.filter((event) => event.state !== 'closed').length);
  });

  it('開催日の範囲で絞り込む。両端の日を含む', async () => {
    const { items } = await setup().repository.listEvents(undefined, {
      ...NONE,
      dateFrom: '2026-12-03',
      dateTo: '2026-12-06',
    });

    expect(items.map((event) => event.id)).toEqual([
      'dev-b-full',
      'dev-beginner-afternoon',
      'dev-easy-morning',
    ]);
  });

  it('条件に合っても、開催前でない募集・中止・非表示は返さない', async () => {
    const { items } = await setup().repository.listEvents(undefined, {
      ...NONE,
      municipality: 'nagoya',
      ward: 'naka',
    });

    expect(items).toEqual([]);
  });

  it('続きも、同じ条件で返す', async () => {
    const { repository } = setup({ pageSize: 1 });
    const filter = { ...NONE, municipality: 'nagoya' as const, ward: 'nakamura' as const };
    const first = await repository.listEvents(undefined, filter);
    const second = await repository.listEvents(first.nextCursor ?? undefined, filter);

    expect([...first.items, ...second.items].map((event) => event.id)).toEqual([
      'dev-beginner-afternoon',
      'dev-family-morning',
    ]);
    expect(second.nextCursor).toBeNull();
  });
});

describe('募集の詳細', () => {
  it('開催中の募集は見られる', async () => {
    expect((await setup().repository.getEvent('dev-ongoing'))?.state).toBe('ongoing');
  });

  it.each(['dev-ended', 'dev-cancelled', 'dev-hidden', 'unknown'])(
    '%s は、ない場合と同じく null を返す',
    async (id) => {
      expect(await setup().repository.getEvent(id)).toBeNull();
    },
  );

  it('公開する項目と、見ている人との関係だけを返す', async () => {
    const event = await setup({ userId: HOST_ID }).repository.getEvent(HOSTED_EVENT);

    expect(Object.keys(event ?? {}).sort()).toEqual(
      [...PUBLIC_KEYS, 'hostSummary', 'isHost', 'myApplication'].sort(),
    );
    expect(event?.isHost).toBe(true);
    expect(event?.myApplication).toBeNull();
    expect(event?.hostSummary).toEqual({ approvedCount: 9, pendingCount: 3 });
  });

  it('見ている人の申請の状態を返す', async () => {
    const { repository } = setup({ userId: 'dev-user-a' });

    expect((await repository.getEvent('dev-family-morning'))?.myApplication?.status).toBe(
      'approved',
    );
    expect((await repository.getEvent('dev-weekday-night'))?.myApplication?.status).toBe('pending');
    expect((await repository.getEvent('dev-spike-practice'))?.myApplication?.status).toBe(
      'rejected',
    );
    expect((await repository.getEvent(HOSTED_EVENT))?.myApplication).toBeNull();
  });

  it('終了した募集は、申請したことがある人と主催者には見せる（DB-08）', async () => {
    expect((await setup({ userId: 'dev-user-a' }).repository.getEvent('dev-ended'))?.state).toBe(
      'ended',
    );
    expect((await setup({ userId: 'dev-host-haru' }).repository.getEvent('dev-ended'))?.state).toBe(
      'ended',
    );
    expect(await setup({ userId: HOST_ID }).repository.getEvent('dev-ended')).toBeNull();
  });

  it('非表示の募集は、主催者と申請した人にも詳細を返さない', async () => {
    expect(await setup({ userId: 'dev-user-a' }).repository.getEvent('dev-hidden')).toBeNull();
    expect(await setup({ userId: HOST_ID }).repository.getEvent('dev-b-hidden')).toBeNull();
  });

  it.each([null, 'dev-user-a'])(
    '主催者でない人（%s）には、主催者ではないと返す',
    async (userId) => {
      const event = await setup({ userId }).repository.getEvent(HOSTED_EVENT);

      expect(event?.isHost).toBe(false);
    },
  );
});

describe('くわしい住所', () => {
  it('主催者にだけ返す', async () => {
    expect(await setup({ userId: HOST_ID }).repository.getLocation(HOSTED_EVENT)).toEqual({
      venueName: 'ダミー体育館A',
      address: 'ダミー住所A（架空）',
      note: expect.any(String) as string,
    });
  });

  it.each([null, 'dev-user-a', 'dev-member-13', 'dev-user-no-profile'])(
    '主催者でない人（%s）には null を返す',
    async (userId) => {
      expect(await setup({ userId }).repository.getLocation(HOSTED_EVENT)).toBeNull();
    },
  );

  it('承認済みの参加者には返す', async () => {
    const { repository } = setup({ userId: 'dev-user-a' });

    expect(await repository.getLocation('dev-family-morning')).not.toBeNull();
    // 開催中も、終了日時までは見られる（docs/06の5-4）
    expect(await repository.getLocation('dev-ongoing')).not.toBeNull();
  });

  it.each([
    ['承認待ち', 'dev-weekday-night'],
    ['却下', 'dev-spike-practice'],
    ['終了した募集', 'dev-ended'],
    ['非表示の募集', 'dev-hidden'],
  ])('%sの参加者には返さない', async (_, eventId) => {
    expect(await setup({ userId: 'dev-user-a' }).repository.getLocation(eventId)).toBeNull();
  });

  it('非表示の募集は、主催者にも返さない', async () => {
    expect(
      await setup({ userId: 'dev-host-tsubasa' }).repository.getLocation('dev-hidden'),
    ).toBeNull();
  });

  it('ログイン状態が変わると、返す内容も変わる', async () => {
    const { repository, session } = setup({ userId: HOST_ID });
    expect(await repository.getLocation(HOSTED_EVENT)).not.toBeNull();

    session.setUserId('dev-user-a');

    expect(await repository.getLocation(HOSTED_EVENT)).toBeNull();
  });
});

describe('募集の作成', () => {
  it('作成した募集は、一覧と詳細に出て、住所は作った人にだけ返る', async () => {
    const { repository, session } = setup({ userId: 'dev-user-a' });

    const result = await repository.createEvent(input());
    if (result.status !== 'created') throw new Error('作成できませんでした。');

    const detail = await repository.getEvent(result.eventId);
    expect(detail).toMatchObject({
      title: '作成した募集',
      hostNickname: 'あおい',
      remaining: 10,
      state: 'open',
      isHost: true,
    });
    expect((await repository.listEvents()).items.map((event) => event.id)).toContain(
      result.eventId,
    );
    expect(await repository.getLocation(result.eventId)).toEqual({
      venueName: 'ダミー体育館Z',
      address: 'ダミー住所Z（架空）',
      note: null,
    });

    session.setUserId(HOST_ID);
    expect(await repository.getLocation(result.eventId)).toBeNull();
    session.setUserId(null);
    expect(await repository.getLocation(result.eventId)).toBeNull();
  });

  it('同じ送信を繰り返しても、1件だけ作る', async () => {
    const { repository, db } = setup({ userId: 'dev-user-a' });
    const same = input();
    const count = db.events.length;

    const first = await repository.createEvent(same);
    const second = await repository.createEvent(same);

    expect(second).toEqual(first);
    expect(db.events).toHaveLength(count + 1);
  });

  it.each([
    [null, 'notLoggedIn'],
    ['dev-user-no-profile', 'profileRequired'],
  ] as const)('%s は作成できない（%s）', async (userId, reason) => {
    const { repository, db } = setup({ userId });
    const count = db.events.length;

    expect(await repository.createEvent(input())).toEqual({ status: 'rejected', reason });
    expect(db.events).toHaveLength(count);
  });

  it('24時間に5件まで作成でき、時間がたつとまた作成できる', async () => {
    const { repository, advance } = setup({ userId: 'dev-user-a' });

    for (let index = 0; index < 5; index += 1) {
      expect((await repository.createEvent(input())).status).toBe('created');
    }
    expect(await repository.createEvent(input())).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });

    advance(24 * 60 * 60 * 1000);
    expect((await repository.createEvent(input())).status).toBe('created');
  });

  it('上限は利用者ごとに数える', async () => {
    const { repository, session } = setup({ userId: 'dev-user-a' });
    for (let index = 0; index < 5; index += 1) await repository.createEvent(input());

    session.setUserId(HOST_ID);

    expect((await repository.createEvent(input())).status).toBe('created');
  });

  it.each<[string, Partial<CreateEventInput>]>([
    ['開始が過去', { startsAt: '2026-11-25T02:00:00Z', endsAt: '2026-11-25T05:00:00Z' }],
    ['24時間を超える', { endsAt: '2026-12-11T04:01:00Z' }],
    ['住所が空', { location: { venueName: null, address: ' ', note: null } }],
    ['募集人数が範囲外', { capacity: 101 }],
  ])('画面の検証を通らない内容（%s）は作成しない', async (_, overrides) => {
    const { repository } = setup({ userId: 'dev-user-a' });

    expect(await repository.createEvent(input(overrides))).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
  });
});

describe('主催した募集', () => {
  it('終了・非表示も含め、開催日時の順に返す。非表示は開催日時だけ', async () => {
    const events = await setup({ userId: HOST_ID }).repository.getMyEvents();

    expect(events.map((event) => (event.hidden ? 'hidden' : event.id))).toEqual([
      'dev-b-ended',
      'dev-ongoing',
      'dev-b-full',
      HOSTED_EVENT,
      'hidden',
    ]);
    const hidden = events.find((event) => event.hidden);
    expect(Object.keys(hidden ?? {}).sort()).toEqual(['endsAt', 'hidden', 'startsAt']);
  });

  it('承認済みと承認待ちの人数を返す', async () => {
    const events = await setup({ userId: HOST_ID }).repository.getMyEvents();

    expect(events.find((event) => !event.hidden && event.id === 'dev-b-full')).toMatchObject({
      state: 'full',
      capacity: 6,
      approvedCount: 6,
      pendingCount: 2,
    });
  });

  it('未ログインには空を返す', async () => {
    expect(await setup().repository.getMyEvents()).toEqual([]);
  });
});

describe('募集の中止（CND-03）', () => {
  it('主催者が中止すると、承認待ち・承認済みの人へ1件ずつ通知し、申請の状態は変えない', async () => {
    const { db, repository } = setup({ userId: HOST_ID });
    const applications = db.applications.filter((item) => item.eventId === HOSTED_EVENT);
    const statuses = applications.map((item) => item.status);

    expect(await repository.cancelEvent(HOSTED_EVENT)).toEqual({ status: 'cancelled' });

    expect((await repository.getEvent(HOSTED_EVENT))?.state).toBe('cancelled');
    expect(applications.map((item) => item.status)).toEqual(statuses);
    const notified = db.notifications
      .filter((item) => item.type === 'event_cancelled')
      .map((item) => item.userId)
      .sort();
    expect(notified).toEqual(
      applications
        .filter((item) => item.status === 'pending' || item.status === 'approved')
        .map((item) => item.userId)
        .sort(),
    );
    // 住所の文字を通知に持たない
    expect(JSON.stringify(db.notifications)).not.toContain('ダミー住所');
    // 主催者は中止の後も住所を見られる（docs/11の2-1）
    expect(await repository.getLocation(HOSTED_EVENT)).not.toBeNull();
  });

  it('中止の後は、一覧に出ず、承認済みの参加者は住所を見られない', async () => {
    const { db, session, repository } = setup({ userId: HOST_ID });
    const approved = db.applications.find(
      (item) => item.eventId === HOSTED_EVENT && item.status === 'approved',
    );
    if (!approved) throw new Error('承認済みの申請がありません。');
    await repository.cancelEvent(HOSTED_EVENT);

    session.setUserId(approved.userId);
    expect(await repository.getLocation(HOSTED_EVENT)).toBeNull();
    expect((await repository.listEvents()).items.map((item) => item.id)).not.toContain(
      HOSTED_EVENT,
    );
  });

  it('元に戻せず、2回目は断る。通知も増えない', async () => {
    const { db, repository } = setup({ userId: HOST_ID });
    await repository.cancelEvent(HOSTED_EVENT);
    const count = db.notifications.length;

    expect(await repository.cancelEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'notCancellable',
    });
    expect(db.notifications).toHaveLength(count);
  });

  it('主催者でない人は、中止できない', async () => {
    const { repository } = setup({ userId: 'dev-user-a' });

    expect(await repository.cancelEvent(HOSTED_EVENT)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect((await repository.getEvent(HOSTED_EVENT))?.state).toBe('open');
  });

  it('開催が始まった募集と、非表示の募集は中止できない', async () => {
    const { repository } = setup({ userId: HOST_ID });

    expect(await repository.cancelEvent('dev-ongoing')).toEqual({
      status: 'rejected',
      reason: 'notCancellable',
    });
    expect(await repository.cancelEvent('dev-b-hidden')).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
  });
});
