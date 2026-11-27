import { describe, expect, it } from 'vitest';
import { createDevDatabase } from './devDatabase';
import { createDevReportRepository } from './devReportRepository';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const A = 'dev-user-a';
const B = 'dev-user-b';
const HOUR_MS = 60 * 60 * 1000;

function setup(userId: string | null = A) {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  const repository = createDevReportRepository({ db, session, now: () => NOW });
  const mine = () => db.reports.filter((report) => report.reporterId === userId);
  return { db, session, repository, mine };
}

const REPORT = { reason: 'harassment', detail: null } as const;

describe('通報（SAFE-01〜03）', () => {
  it('ユーザーを通報すると、未対応として受け付け、ニックネームと自己紹介の控えを残す', async () => {
    const { repository, mine } = setup();

    expect(await repository.getReportTarget('user', B)).toEqual({
      status: 'ok',
      target: { kind: 'user', id: B, nickname: 'そら' },
    });
    expect(
      await repository.submitReport({ kind: 'user', targetId: B, ...REPORT, detail: '  補足  ' }),
    ).toEqual({ status: 'done' });
    expect(mine()).toMatchObject([
      {
        subjectUserId: B,
        targetKind: 'user',
        status: 'open',
        detail: '補足',
        snapshot: { kind: 'user', nickname: 'そら', bio: expect.any(String) as string },
      },
    ]);
  });

  it('募集の控えはタイトルと説明だけで、住所を含めない。通報された人は主催者', async () => {
    const { repository, mine } = setup();

    await repository.submitReport({ kind: 'event', targetId: 'dev-beginner-afternoon', ...REPORT });

    const [report] = mine();
    expect(report?.subjectUserId).toBe(B);
    expect(Object.keys(report?.snapshot ?? {}).sort()).toEqual(['description', 'kind', 'title']);
  });

  it('メッセージは会話の当事者が、相手のものだけを通報でき、本文の控えを残す', async () => {
    const { db, repository, mine } = setup();
    const partner = db.messages.find(
      (message) => message.conversationId === 'dev-conv-question' && message.senderId === B,
    );
    const own = db.messages.find(
      (message) => message.conversationId === 'dev-conv-question' && message.senderId === A,
    );
    const other = db.messages.find((message) => message.conversationId === 'dev-conv-reported');

    expect(await repository.getReportTarget('message', partner?.id ?? '')).toMatchObject({
      status: 'ok',
      target: { kind: 'message', senderNickname: 'そら', conversationId: 'dev-conv-question' },
    });
    for (const message of [own, other]) {
      expect(await repository.getReportTarget('message', message?.id ?? '')).toEqual({
        status: 'rejected',
        reason: 'notFound',
      });
    }

    await repository.submitReport({ kind: 'message', targetId: partner?.id ?? '', ...REPORT });
    expect(mine()).toMatchObject([
      { subjectUserId: B, snapshot: { kind: 'message', body: partner?.body } },
    ]);
  });

  it.each([
    ['自分自身', 'user', A],
    ['自分の募集', 'event', 'dev-b-full'],
    ['非表示の募集', 'event', 'dev-hidden'],
    ['申請していない終了した募集', 'event', 'dev-b-ended'],
    ['プロフィールのない人', 'user', 'dev-user-no-profile'],
    ['管理者', 'user', 'dev-admin'],
    ['ない対象', 'user', 'dev-unknown'],
  ] as const)('%sは通報できない', async (_, kind, targetId) => {
    const { repository, mine } = setup(targetId === 'dev-b-full' ? B : A);

    expect(await repository.getReportTarget(kind, targetId)).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(await repository.submitReport({ kind, targetId, ...REPORT })).toEqual({
      status: 'rejected',
      reason: 'notFound',
    });
    expect(mine()).toEqual([]);
  });

  it('退会した人は「ユーザーの通報」はできないが、送ったメッセージは通報できる（DB-30）', async () => {
    const { db, repository } = setup();
    db.messages.push({
      id: 'withdrawn-message',
      seq: 999,
      conversationId: 'dev-conv-question',
      senderId: 'dev-withdrawn',
      body: '退会した人のメッセージ',
      clientRequestId: 'withdrawn-request',
      createdAt: new Date(NOW.getTime() - HOUR_MS),
    });

    expect(await repository.getReportTarget('user', 'dev-withdrawn')).toMatchObject({
      status: 'rejected',
    });
    expect(await repository.getReportTarget('message', 'withdrawn-message')).toMatchObject({
      status: 'ok',
      target: { senderNickname: null },
    });
    expect(
      await repository.submitReport({ kind: 'message', targetId: 'withdrawn-message', ...REPORT }),
    ).toEqual({ status: 'done' });
  });

  it('同じ対象には、対応が終わるまで重ねて通報できない', async () => {
    const { repository, mine } = setup();
    const input = { kind: 'user', targetId: B, ...REPORT } as const;

    await repository.submitReport(input);
    expect(await repository.submitReport(input)).toEqual({
      status: 'rejected',
      reason: 'duplicate',
    });

    const [report] = mine();
    if (report) report.status = 'inProgress';
    expect(await repository.submitReport(input)).toMatchObject({ reason: 'duplicate' });
    if (report) report.status = 'resolved';
    expect(await repository.submitReport(input)).toEqual({ status: 'done' });
    expect(mine()).toHaveLength(2);
  });

  it('24時間に10件まで。24時間より前の通報は数えない', async () => {
    const { db, repository } = setup();
    const push = (hoursAgo: number, index: number) => {
      db.reports.push({
        id: `limit-${index}`,
        reporterId: A,
        subjectUserId: 'dev-host-haru',
        targetKind: 'event',
        targetId: `limit-event-${index}`,
        reason: 'other',
        detail: null,
        status: 'resolved',
        snapshot: { kind: 'event', title: '', description: null },
        handledBy: null,
        handledAt: null,
        resolutionNote: null,
        createdAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS),
        updatedAt: NOW,
      });
    };
    for (let index = 0; index < 9; index += 1) push(1, index);
    push(25, 9);
    expect(await repository.submitReport({ kind: 'user', targetId: B, ...REPORT })).toEqual({
      status: 'done',
    });

    expect(
      await repository.submitReport({ kind: 'user', targetId: 'dev-host-haru', ...REPORT }),
    ).toEqual({ status: 'rejected', reason: 'rateLimited' });
  });

  it('理由が選択肢にない・補足が500文字を超える場合は受け付けない', async () => {
    const { repository, mine } = setup();

    expect(
      await repository.submitReport({
        kind: 'user',
        targetId: B,
        reason: 'unknown' as 'other',
        detail: null,
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(
      await repository.submitReport({
        kind: 'user',
        targetId: B,
        ...REPORT,
        detail: 'あ'.repeat(501),
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(
      await repository.submitReport({
        kind: 'user',
        targetId: B,
        ...REPORT,
        detail: 'あ'.repeat(500),
      }),
    ).toEqual({ status: 'done' });
    expect(mine()).toHaveLength(1);
  });

  it.each([
    ['未ログイン', null],
    ['利用停止中の人', 'dev-user-suspended'],
    ['管理者', 'dev-admin'],
  ])('%sは通報できない', async (_, userId) => {
    const { repository, db } = setup(userId);
    const before = db.reports.length;

    expect(await repository.getReportTarget('user', B)).toEqual({
      status: 'rejected',
      reason: 'notLoggedIn',
    });
    expect(await repository.submitReport({ kind: 'user', targetId: B, ...REPORT })).toEqual({
      status: 'rejected',
      reason: 'notLoggedIn',
    });
    expect(db.reports).toHaveLength(before);
  });
});
