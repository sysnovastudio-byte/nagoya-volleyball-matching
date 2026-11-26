import { describe, expect, it } from 'vitest';
import {
  EMPTY_EVENT_FORM,
  isEventFormDirty,
  parseInteger,
  parseJstDateTime,
  validateEventForm,
  type EventFormValues,
} from './eventForm';
import { overlapsLateNight } from './eventRules';

// 日本時間 2026-11-25 12:00
const NOW = new Date('2026-11-25T03:00:00Z');

const VALID: EventFormValues = {
  title: '土曜の午後バレー',
  startsAt: '2026-12-05T13:00',
  endsAt: '2026-12-05T16:00',
  area: 'nakamura',
  targetLevels: ['beginner'],
  capacity: '12',
  fee: '500',
  description: '',
  belongings: '',
  address: 'ダミー住所A（架空）',
  venueName: '',
  note: '',
};

function errorsOf(overrides: Partial<EventFormValues>) {
  const result = validateEventForm({ ...VALID, ...overrides }, NOW, 'request-1');
  return result.ok ? {} : result.errors;
}

describe('入力の検証', () => {
  it('正しい入力を、送る内容に変える', () => {
    const result = validateEventForm(
      { ...VALID, title: '  土曜の午後バレー  ', venueName: ' ', fee: '５００' },
      NOW,
      'request-1',
    );

    expect(result).toEqual({
      ok: true,
      input: {
        clientRequestId: 'request-1',
        title: '土曜の午後バレー',
        startsAt: '2026-12-05T04:00:00.000Z',
        endsAt: '2026-12-05T07:00:00.000Z',
        area: 'nakamura',
        targetLevels: ['beginner'],
        description: null,
        belongings: null,
        capacity: 12,
        fee: 500,
        location: { address: 'ダミー住所A（架空）', venueName: null, note: null },
      },
    });
  });

  it('必須の項目が空なら、項目ごとに誤りを示す', () => {
    const result = validateEventForm(EMPTY_EVENT_FORM, NOW, 'request-1');

    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual(
      ['address', 'area', 'capacity', 'endsAt', 'fee', 'startsAt', 'targetLevels', 'title'].sort(),
    );
  });

  it('空白だけのタイトルと住所は、空として扱う', () => {
    expect(errorsOf({ title: '   ', address: '　' })).toMatchObject({
      title: '入力してください。',
      address: '入力してください。',
    });
  });

  it.each([
    ['title', 50],
    ['description', 1000],
    ['belongings', 200],
    ['address', 200],
    ['venueName', 50],
    ['note', 300],
  ] as const)('%s は %d 文字まで', (field, max) => {
    expect(errorsOf({ [field]: 'あ'.repeat(max) })[field]).toBeUndefined();
    expect(errorsOf({ [field]: 'あ'.repeat(max + 1) })[field]).toContain(
      `${max.toLocaleString('ja-JP')}文字以内`,
    );
  });

  it('絵文字も1文字と数える', () => {
    expect(errorsOf({ title: '🏐'.repeat(50) }).title).toBeUndefined();
  });

  it.each([
    ['0', true],
    ['1', false],
    ['100', false],
    ['101', true],
    ['1.5', true],
    ['-1', true],
    ['abc', true],
  ])('募集人数 %s', (capacity, invalid) => {
    expect(Boolean(errorsOf({ capacity }).capacity)).toBe(invalid);
  });

  it.each([
    ['0', false],
    ['50000', false],
    ['50,000', false],
    ['50001', true],
  ])('参加費 %s', (fee, invalid) => {
    expect(Boolean(errorsOf({ fee }).fee)).toBe(invalid);
  });

  it('区は16区の中から選ぶ', () => {
    expect(errorsOf({ area: '' }).area).toBe('区を選んでください。');
  });

  it('対象レベルは1つ以上', () => {
    expect(errorsOf({ targetLevels: [] }).targetLevels).toBe('1つ以上選んでください。');
  });
});

describe('日時の検証', () => {
  it('開始は今より後', () => {
    expect(errorsOf({ startsAt: '2026-11-25T12:00', endsAt: '2026-11-25T14:00' }).startsAt).toBe(
      '開始は、今より後の日時にしてください。',
    );
    expect(
      errorsOf({ startsAt: '2026-11-25T12:01', endsAt: '2026-11-25T14:00' }).startsAt,
    ).toBeUndefined();
  });

  it('開始は1年以内', () => {
    expect(
      errorsOf({ startsAt: '2027-11-25T12:00', endsAt: '2027-11-25T14:00' }).startsAt,
    ).toBeUndefined();
    expect(errorsOf({ startsAt: '2027-11-25T12:01', endsAt: '2027-11-25T14:00' }).startsAt).toBe(
      '開始は、1年以内の日時にしてください。',
    );
  });

  it('終了は開始より後', () => {
    expect(errorsOf({ endsAt: '2026-12-05T13:00' }).endsAt).toBe(
      '終了は、開始より後の日時にしてください。',
    );
  });

  it('開催時間は24時間以内', () => {
    expect(errorsOf({ endsAt: '2026-12-06T13:00' }).endsAt).toBeUndefined();
    expect(errorsOf({ endsAt: '2026-12-06T13:01' }).endsAt).toBe(
      '開催時間は、24時間以内にしてください。',
    );
  });

  it('日時は、端末の時間帯によらず日本時間として読む', () => {
    expect(parseJstDateTime('2026-12-05T00:30')?.toISOString()).toBe('2026-12-04T15:30:00.000Z');
    expect(parseJstDateTime('2026-12-05')).toBeNull();
    expect(parseJstDateTime('')).toBeNull();
  });
});

describe('深夜にかかるか', () => {
  const at = (value: string) => parseJstDateTime(value) ?? new Date(Number.NaN);

  it.each([
    ['2026-12-05T13:00', '2026-12-05T16:00', false],
    ['2026-12-05T20:00', '2026-12-05T23:00', false],
    ['2026-12-05T20:00', '2026-12-05T23:01', true],
    ['2026-12-06T05:00', '2026-12-06T07:00', true],
    ['2026-12-06T06:00', '2026-12-06T09:00', false],
    ['2026-12-05T23:30', '2026-12-06T01:00', true],
  ])('%s〜%s は %s', (start, end, expected) => {
    expect(overlapsLateNight(at(start), at(end))).toBe(expected);
  });
});

describe('そのほか', () => {
  it('全角の数字と桁区切りを読む', () => {
    expect(parseInteger('１２')).toBe(12);
    expect(parseInteger('1,000')).toBe(1000);
    expect(parseInteger('')).toBeNull();
  });

  it('何か入力されていれば、入力中とみなす', () => {
    expect(isEventFormDirty(EMPTY_EVENT_FORM)).toBe(false);
    expect(isEventFormDirty({ ...EMPTY_EVENT_FORM, note: 'a' })).toBe(true);
    expect(isEventFormDirty({ ...EMPTY_EVENT_FORM, targetLevels: ['beginner'] })).toBe(true);
    expect(isEventFormDirty({ ...EMPTY_EVENT_FORM, title: '  ' })).toBe(false);
  });
});
