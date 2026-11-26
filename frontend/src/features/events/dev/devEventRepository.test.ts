import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventListResult } from '../types';
import { createDevEventRepository } from './devEventRepository';

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

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

function setup(pageSize?: number) {
  return createDevEventRepository({ now: () => NOW, ...(pageSize ? { pageSize } : {}) });
}

describe('募集の一覧', () => {
  it('開催前の募集だけを、開催日時の順に返す', async () => {
    const { items, nextCursor } = await setup().list();

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
    const { items } = await setup().list();

    expect(items.map(({ state, remaining }) => [state, remaining])).toEqual([
      ['open', 3],
      ['full', 0],
      ['open', 1],
      ['closed', 2],
      ['open', 6],
    ]);
  });

  it('公開してよい項目だけを返す', async () => {
    const { items } = await setup().list();

    for (const event of items) {
      expect(Object.keys(event).sort()).toEqual(PUBLIC_KEYS);
    }
  });

  it('続きを、重複も抜けもなく返す', async () => {
    const repository = setup(2);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page: EventListResult = await repository.list(cursor);
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });
});

describe('募集の詳細', () => {
  it('開催中の募集は見られる', async () => {
    expect((await setup().get('dev-ongoing'))?.state).toBe('ongoing');
  });

  it.each(['dev-ended', 'dev-cancelled', 'dev-hidden', 'unknown'])(
    '%s は、ない場合と同じく null を返す',
    async (id) => {
      expect(await setup().get(id)).toBeNull();
    },
  );
});
