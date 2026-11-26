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
    area: 'naka',
    targetLevels: ['beginner'],
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
      ['open', 3],
      ['full', 0],
      ['open', 1],
      ['closed', 2],
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

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
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

  it('公開する項目と、主催者かどうかだけを返す', async () => {
    const event = await setup({ userId: HOST_ID }).repository.getEvent(HOSTED_EVENT);

    expect(Object.keys(event ?? {}).sort()).toEqual([...PUBLIC_KEYS, 'isHost'].sort());
    expect(event?.isHost).toBe(true);
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

  it.each([null, 'dev-user-a', 'dev-user-minor', 'dev-user-no-profile'])(
    '主催者でない人（%s）には null を返す',
    async (userId) => {
      expect(await setup({ userId }).repository.getLocation(HOSTED_EVENT)).toBeNull();
    },
  );

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
    ['dev-user-minor', 'minor'],
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
