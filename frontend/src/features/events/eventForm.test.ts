import { describe, expect, it } from 'vitest';
import {
  EMPTY_EVENT_FORM,
  formFromEvent,
  isEventFormDirty,
  parseInteger,
  parseJstDateTime,
  scheduleFromForm,
  TIME_OPTIONS,
  validateEventForm,
  type EventFormValues,
} from './eventForm';
import type { PublicEvent } from './types';

// 日本時間 2026-11-25 12:00
const NOW = new Date('2026-11-25T03:00:00Z');

const VALID: EventFormValues = {
  title: '土曜の午後バレー',
  date: '2026-12-05',
  startTime: '13:00',
  endTime: '16:00',
  municipality: 'nagoya',
  ward: 'nakamura',
  targetLevels: ['beginner'],
  kind: '',
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
        area: { municipality: 'nagoya', ward: 'nakamura' },
        targetLevels: ['beginner'],
        kind: null,
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
      [
        'address',
        'capacity',
        'date',
        'endTime',
        'fee',
        'municipality',
        'startTime',
        'targetLevels',
        'title',
      ].sort(),
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

  it('開催地は愛知県の市町村から選び、名古屋市のときだけ区も選ぶ', () => {
    expect(errorsOf({ municipality: '', ward: '' }).municipality).toBe('市町村を選んでください。');
    expect(errorsOf({ ward: '' }).ward).toBe('区を選んでください。');
    // 名古屋市以外では区を持たない。欄に区が残っていても送らない
    const outside = validateEventForm({ ...VALID, municipality: 'toyota' }, NOW, 'request-1');
    expect(outside.ok && outside.input.area).toEqual({ municipality: 'toyota', ward: null });
  });

  it('種別は任意。選んだ種別をそのまま送る', () => {
    const result = validateEventForm({ ...VALID, kind: 'women' }, NOW, 'request-1');
    expect(result.ok && result.input.kind).toBe('women');
    expect(errorsOf({ kind: '' }).kind).toBeUndefined();
  });

  it('対象レベルは1つ以上', () => {
    expect(errorsOf({ targetLevels: [] }).targetLevels).toBe('1つ以上選んでください。');
  });
});

describe('日時の検証', () => {
  it('時刻は15分刻みで、00:00〜23:45', () => {
    expect(TIME_OPTIONS).toHaveLength(96);
    expect(TIME_OPTIONS.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
    expect(TIME_OPTIONS.at(-1)).toBe('23:45');
  });

  it('日付・開始時刻・終了時刻から、開始と終了の日時を作る', () => {
    expect(scheduleFromForm(VALID)).toEqual({
      startsAt: new Date('2026-12-05T04:00:00Z'),
      endsAt: new Date('2026-12-05T07:00:00Z'),
      nextDay: false,
    });
  });

  it('終了が開始より前なら、翌日として扱う', () => {
    const schedule = scheduleFromForm({ date: '2026-12-05', startTime: '22:00', endTime: '01:30' });
    expect(schedule).toEqual({
      startsAt: new Date('2026-12-05T13:00:00Z'),
      endsAt: new Date('2026-12-05T16:30:00Z'),
      nextDay: true,
    });
    const result = validateEventForm({ ...VALID, startTime: '22:00', endTime: '01:30' }, NOW, 'r');
    expect(result.ok && result.input.endsAt).toBe('2026-12-05T16:30:00.000Z');
  });

  it('15分刻みでない時刻は受け付けない', () => {
    expect(scheduleFromForm({ ...VALID, startTime: '13:10' })).toBeNull();
  });

  it('開始と終了が同じ時刻なら誤り', () => {
    expect(errorsOf({ endTime: '13:00' }).endTime).toBe(
      '終了時刻は、開始時刻と違う時刻にしてください。',
    );
  });

  it('開始は今より後', () => {
    expect(errorsOf({ date: '2026-11-25', startTime: '12:00', endTime: '14:00' }).startTime).toBe(
      '開始は、今より後の日時にしてください。',
    );
    expect(
      errorsOf({ date: '2026-11-25', startTime: '12:15', endTime: '14:00' }).startTime,
    ).toBeUndefined();
  });

  it('開始は1年以内', () => {
    expect(
      errorsOf({ date: '2027-11-25', startTime: '12:00', endTime: '14:00' }).startTime,
    ).toBeUndefined();
    expect(errorsOf({ date: '2027-11-25', startTime: '12:15', endTime: '14:00' }).startTime).toBe(
      '開始は、1年以内の日時にしてください。',
    );
  });

  it('開催時間は、翌日にかかっても24時間未満になる', () => {
    const result = validateEventForm({ ...VALID, startTime: '13:00', endTime: '12:45' }, NOW, 'r');
    expect(result.ok).toBe(true);
  });

  it('日時は、端末の時間帯によらず日本時間として読む', () => {
    expect(parseJstDateTime('2026-12-05T00:30')?.toISOString()).toBe('2026-12-04T15:30:00.000Z');
    expect(parseJstDateTime('2026-12-05')).toBeNull();
    expect(parseJstDateTime('')).toBeNull();
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

describe('過去の募集からの複製', () => {
  const EVENT: PublicEvent = {
    id: 'event-1',
    title: '土曜の午後バレー',
    startsAt: '2026-11-07T04:00:00Z',
    endsAt: '2026-11-07T07:00:00Z',
    area: { municipality: 'nagoya', ward: 'nakamura' },
    targetLevels: ['beginner', 'experienced'],
    kind: 'mixed',
    description: '説明',
    belongings: null,
    capacity: 12,
    remaining: 0,
    fee: 500,
    hostNickname: 'そら',
    state: 'ended',
  };
  const SCHEDULE = { date: '2026-12-05', startTime: '', endTime: '' };

  it('日時のほかの項目を入れ、日時は今の入力を残す', () => {
    expect(
      formFromEvent(EVENT, { venueName: '体育館', address: 'ダミー住所', note: null }, SCHEDULE),
    ).toEqual({
      ...SCHEDULE,
      title: '土曜の午後バレー',
      municipality: 'nagoya',
      ward: 'nakamura',
      targetLevels: ['beginner', 'experienced'],
      kind: 'mixed',
      capacity: '12',
      fee: '500',
      description: '説明',
      belongings: '',
      address: 'ダミー住所',
      venueName: '体育館',
      note: '',
    });
  });

  it('住所を受け取れなかった場合と、名古屋市以外・種別なしは空にする', () => {
    const values = formFromEvent(
      { ...EVENT, area: { municipality: 'toyota', ward: null }, kind: null },
      null,
      { date: '', startTime: '', endTime: '' },
    );
    expect(values).toMatchObject({ ward: '', kind: '', address: '', venueName: '', note: '' });
    expect(values.date).toBe('');
  });
});
