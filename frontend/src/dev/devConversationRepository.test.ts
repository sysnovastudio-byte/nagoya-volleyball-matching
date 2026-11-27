import { describe, expect, it } from 'vitest';
import { createDevConversationRepository } from './devConversationRepository';
import { createDevDatabase } from './devDatabase';
import { createDevSession } from './devSession';

const NOW = new Date('2026-11-25T03:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function setup(userId: string | null = 'dev-user-a') {
  const db = createDevDatabase(NOW);
  const session = createDevSession(userId);
  let now = NOW;
  const repository = createDevConversationRepository({ db, session, now: () => now });
  const setNow = (next: Date) => {
    now = next;
  };
  return { db, session, repository, setNow };
}

let requestCount = 0;
function requestId() {
  requestCount += 1;
  return `request-${requestCount}`;
}

describe('当事者だけが見られる', () => {
  it('自分が当事者の会話だけを返す', async () => {
    const { repository } = setup('dev-user-a');

    const ids = (await repository.listMine()).map((item) => item.id).sort();
    expect(ids).toEqual(
      ['dev-conv-approved', 'dev-conv-empty', 'dev-conv-hidden', 'dev-conv-question'].sort(),
    );
  });

  it.each([null, 'dev-user-minor', 'dev-host-haru'])(
    '当事者でない人（%s）は、会話もメッセージも取得できない',
    async (userId) => {
      const { repository } = setup(userId);

      expect((await repository.listMine()).map((item) => item.id)).not.toContain(
        'dev-conv-question',
      );
      expect(await repository.getMessages('dev-conv-question')).toBeNull();
    },
  );

  it('当事者でない人は、送信もできない', async () => {
    const { repository, db } = setup('dev-user-minor');
    const count = db.messages.length;

    expect(
      await repository.send({
        conversationId: 'dev-conv-question',
        body: 'こんにちは',
        clientRequestId: requestId(),
      }),
    ).toEqual({ status: 'rejected', reason: 'notAllowed' });
    expect(db.messages).toHaveLength(count);
  });

  it('主催者も、自分の募集の会話を見られる', async () => {
    const { repository } = setup('dev-user-b');

    const detail = await repository.getMessages('dev-conv-question');
    expect(detail?.conversation).toMatchObject({ role: 'host', partner: { nickname: 'あおい' } });
    expect(detail?.messages.map((message) => message.isMine)).toEqual([false, true, false]);
  });

  it('メッセージのない会話は、始めた人の一覧だけに出す（DB-29）', async () => {
    expect((await setup('dev-user-a').repository.listMine()).map((c) => c.id)).toContain(
      'dev-conv-empty',
    );
    expect((await setup('dev-host-minato').repository.listMine()).map((c) => c.id)).not.toContain(
      'dev-conv-empty',
    );
  });

  it('非表示の募集の会話は、開催日時だけを返す', async () => {
    const summary = (await setup('dev-user-a').repository.listMine()).find(
      (item) => item.id === 'dev-conv-hidden',
    );

    expect(summary?.event).toEqual({
      hidden: true,
      startsAt: expect.any(String) as string,
      endsAt: expect.any(String) as string,
    });
  });

  it('メッセージに送信者のIDを含めない', async () => {
    const detail = await setup('dev-user-a').repository.getMessages('dev-conv-question');

    for (const message of detail?.messages ?? []) {
      expect(Object.keys(message).sort()).toEqual(['body', 'createdAt', 'id', 'isMine', 'seq']);
    }
  });
});

describe('送信', () => {
  it('送信者は常にログイン中の人になる', async () => {
    const { repository, db, session } = setup('dev-user-a');

    await repository.send({
      conversationId: 'dev-conv-question',
      body: '当日はよろしくお願いします。',
      clientRequestId: requestId(),
    });
    session.setUserId('dev-user-b');
    const result = await repository.send({
      conversationId: 'dev-conv-question',
      body: 'お待ちしています。',
      clientRequestId: requestId(),
    });

    expect(result.status).toBe('sent');
    expect(db.messages.slice(-2).map((message) => message.senderId)).toEqual([
      'dev-user-a',
      'dev-user-b',
    ]);
  });

  it('同じ送信を繰り返しても、1件だけ作る', async () => {
    const { repository, db } = setup('dev-user-a');
    const input = {
      conversationId: 'dev-conv-question',
      body: '二重に押しました',
      clientRequestId: requestId(),
    };
    const count = db.messages.length;

    const first = await repository.send(input);
    const second = await repository.send(input);

    expect(second).toEqual(first);
    expect(db.messages).toHaveLength(count + 1);
  });

  it('1,000文字までは送れ、超えると送れない。空白だけも送れない', async () => {
    const { repository } = setup('dev-user-a');
    const send = (body: string) =>
      repository.send({ conversationId: 'dev-conv-question', body, clientRequestId: requestId() });

    expect((await send('あ'.repeat(1000))).status).toBe('sent');
    expect(await send('あ'.repeat(1001))).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(await send(' 　\n')).toEqual({ status: 'rejected', reason: 'invalid' });
  });

  it('送信できる期間を過ぎた会話は、送信できず、閲覧はできる', async () => {
    const { repository, db } = setup('dev-user-b');
    const count = db.messages.length;

    const detail = await repository.getMessages('dev-conv-expired');
    expect(detail?.conversation.withinSendPeriod).toBe(false);
    expect(detail?.messages).toHaveLength(3);
    expect(
      await repository.send({
        conversationId: 'dev-conv-expired',
        body: 'まだ送れますか',
        clientRequestId: requestId(),
      }),
    ).toEqual({ status: 'rejected', reason: 'notAllowed' });
    expect(db.messages).toHaveLength(count);
  });

  it('送信できるのは、終了日時の7日後まで', async () => {
    const { repository, db, setNow } = setup('dev-user-a');
    const record = db.events.find((event) => event.id === 'dev-family-morning');
    if (!record) throw new Error('募集がありません。');
    const until = new Date(record.endsAt).getTime() + 7 * DAY_MS;
    const send = () =>
      repository.send({
        conversationId: 'dev-conv-approved',
        body: 'ありがとうございました',
        clientRequestId: requestId(),
      });

    setNow(new Date(until));
    expect((await send()).status).toBe('sent');
    setNow(new Date(until + 1));
    expect(await send()).toEqual({ status: 'rejected', reason: 'notAllowed' });
  });

  it('送信すると、一覧の並びが新しい順になる', async () => {
    const { repository, setNow } = setup('dev-user-a');
    setNow(new Date(NOW.getTime() + HOUR_MS));

    await repository.send({
      conversationId: 'dev-conv-hidden',
      body: 'よろしくお願いします。',
      clientRequestId: requestId(),
    });

    expect((await repository.listMine())[0]?.id).toBe('dev-conv-hidden');
  });
});

describe('会話の開始', () => {
  it('申請前でも、開催開始までは質問を始められる', async () => {
    const { repository, db } = setup('dev-user-a');

    const result = await repository.startConversation('dev-easy-morning');

    expect(result.status).toBe('opened');
    const created = db.conversations.at(-1);
    expect(created).toMatchObject({
      eventId: 'dev-easy-morning',
      hostId: 'dev-host-haru',
      inquirerId: 'dev-user-a',
      startedBy: 'dev-user-a',
    });
  });

  it('同じ募集・同じ人の会話は1つ。すでにあれば、その会話を開く', async () => {
    const { repository, db } = setup('dev-user-a');
    const count = db.conversations.length;

    expect(await repository.startConversation('dev-beginner-afternoon')).toEqual({
      status: 'opened',
      conversationId: 'dev-conv-question',
    });
    const first = await repository.startConversation('dev-easy-morning');
    const second = await repository.startConversation('dev-easy-morning');

    expect(second).toEqual(first);
    expect(db.conversations).toHaveLength(count + 1);
  });

  it('開催開始後は、申請前の質問を始められない', async () => {
    const { repository, db, setNow } = setup('dev-user-a');
    const record = db.events.find((event) => event.id === 'dev-easy-morning');
    if (!record) throw new Error('募集がありません。');

    setNow(new Date(record.startsAt));

    expect(await repository.startConversation('dev-easy-morning')).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });

  it('承認済みの参加者は、開催の後も送信できる期間内なら始められる', async () => {
    const { repository, db } = setup('dev-user-a');
    db.conversations = db.conversations.filter((item) => item.eventId !== 'dev-ended');

    // dev-ended は2時間前に終わった募集で、利用者Aは承認済み
    expect((await repository.startConversation('dev-ended')).status).toBe('opened');
  });

  it.each([
    ['中止の募集', 'dev-cancelled', 'dev-user-a'],
    ['非表示の募集', 'dev-hidden', 'dev-user-minor'],
    ['承認済みでも非表示の募集', 'dev-b-hidden', 'dev-member-1'],
  ])('%sでは始められない', async (_, eventId, userId) => {
    const { repository } = setup(userId);

    expect(await repository.startConversation(eventId)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });

  it('主催者は、自分の募集で「主催者に質問する」の形では始められない', async () => {
    expect(
      await setup('dev-user-b').repository.startConversation('dev-beginner-afternoon'),
    ).toEqual({ status: 'rejected', reason: 'notAllowed' });
  });

  it('未ログイン・プロフィール未登録は始められない', async () => {
    expect(await setup(null).repository.startConversation('dev-easy-morning')).toEqual({
      status: 'rejected',
      reason: 'notLoggedIn',
    });
    expect(
      await setup('dev-user-no-profile').repository.startConversation('dev-easy-morning'),
    ).toEqual({ status: 'rejected', reason: 'profileRequired' });
  });
});

describe('主催者からの会話の開始（MSG-06）', () => {
  const HOST_ID = 'dev-user-b';
  const HOSTED_EVENT = 'dev-beginner-afternoon';

  /** 利用者Bの募集の、指定した状態の申請。 */
  const applicationOf = (
    db: ReturnType<typeof setup>['db'],
    eventId: string,
    status: 'pending' | 'approved' | 'rejected',
    userId?: string,
  ) => {
    const application = db.applications.find(
      (item) =>
        item.eventId === eventId &&
        item.status === status &&
        (userId === undefined || item.userId === userId),
    );
    if (!application) throw new Error(`${eventId} に ${status} の申請がありません。`);
    return application;
  };

  it('承認待ちの申請者と始められ、メッセージがない間は主催者の一覧だけに出る', async () => {
    const { db, session, repository } = setup(HOST_ID);
    const application = applicationOf(db, HOSTED_EVENT, 'pending', 'dev-user-minor');

    const result = await repository.startConversationWithApplicant(application.id);

    expect(result.status).toBe('opened');
    const conversation = db.conversations.at(-1);
    expect(conversation).toMatchObject({
      eventId: HOSTED_EVENT,
      hostId: HOST_ID,
      inquirerId: 'dev-user-minor',
      startedBy: HOST_ID,
    });
    const hostList = await repository.listMine();
    expect(hostList.find((item) => item.id === conversation?.id)?.role).toBe('host');
    session.setUserId('dev-user-minor');
    expect((await repository.listMine()).map((item) => item.id)).not.toContain(conversation?.id);
  });

  it('承認済みの参加者とも始められる。すでにあれば、その会話を開く', async () => {
    const { db, repository } = setup(HOST_ID);
    const application = applicationOf(db, HOSTED_EVENT, 'approved');

    const first = await repository.startConversationWithApplicant(application.id);
    const count = db.conversations.length;
    const second = await repository.startConversationWithApplicant(application.id);

    expect(second).toEqual(first);
    expect(db.conversations).toHaveLength(count);
  });

  it('利用者Aが質問した会話があれば、その会話を開く', async () => {
    const { db, session, repository } = setup('dev-user-a');
    const question = db.conversations.find(
      (item) => item.eventId === HOSTED_EVENT && item.inquirerId === 'dev-user-a',
    );
    if (!question) throw new Error('質問の会話がありません。');
    db.applications.push({
      id: 'dev-application-test',
      eventId: HOSTED_EVENT,
      userId: 'dev-user-a',
      attemptNo: 1,
      status: 'pending',
      appliedAt: NOW,
      decidedAt: null,
      cancelledAt: null,
      retractedAt: null,
      revokedAt: null,
      revokeReason: null,
    });

    session.setUserId(HOST_ID);
    expect(await repository.startConversationWithApplicant('dev-application-test')).toEqual({
      status: 'opened',
      conversationId: question.id,
    });
  });

  it('却下した申請者とは始められない', async () => {
    const { db, repository } = setup(HOST_ID);
    const application = applicationOf(db, HOSTED_EVENT, 'rejected');

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });

  it('他人の募集の申請者とは始められない', async () => {
    const { db, repository } = setup('dev-host-haru');
    const application = applicationOf(db, HOSTED_EVENT, 'pending');

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });

  it('送信できる期間（終了の7日後まで）を過ぎた募集では、新しく始められない', async () => {
    const { db, repository } = setup(HOST_ID);
    // dev-b-ended は10日前に終了した。会話のない承認済みの人を選ぶ
    const application = db.applications.find(
      (item) =>
        item.eventId === 'dev-b-ended' &&
        item.status === 'approved' &&
        !db.conversations.some(
          (conversation) =>
            conversation.eventId === 'dev-b-ended' && conversation.inquirerId === item.userId,
        ),
    );
    if (!application) throw new Error('承認済みの申請がありません。');

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });

  it('非表示の募集では、新しく始められない', async () => {
    const { db, repository } = setup(HOST_ID);
    const application = applicationOf(db, 'dev-b-hidden', 'pending');

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
  });
});

const A = 'dev-user-a';
const B = 'dev-user-b';
const MINUTE_MS = 60 * 1000;

/** blocker が blocked をブロックする（窓口を通さずに記録する）。 */
function block(db: ReturnType<typeof setup>['db'], blockerId: string, blockedId: string) {
  db.blocks.push({ blockerId, blockedId, createdAt: NOW });
}

function send(repository: ReturnType<typeof setup>['repository'], conversationId: string) {
  return repository.send({ conversationId, body: 'こんにちは', clientRequestId: requestId() });
}

describe('ブロックの影響（MSG-04、docs/11の3-1）', () => {
  it.each([
    ['自分が相手を', A, B],
    ['相手が自分を', B, A],
  ])('%sブロックすると、どちらからも送信できない', async (_, blockerId, blockedId) => {
    const { db, session, repository } = setup(A);
    block(db, blockerId, blockedId);
    const count = db.messages.length;

    expect(await send(repository, 'dev-conv-question')).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
    session.setUserId(B);
    expect(await send(repository, 'dev-conv-question')).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
    expect(db.messages).toHaveLength(count);
  });

  it('ブロックの後も、これまでの会話を開いて読める', async () => {
    const { db, repository } = setup(A);
    block(db, B, A);

    expect(await repository.startConversation('dev-beginner-afternoon')).toEqual({
      status: 'opened',
      conversationId: 'dev-conv-question',
    });
    expect((await repository.getMessages('dev-conv-question'))?.messages).toHaveLength(3);
    expect((await repository.listMine()).map((item) => item.id)).toContain('dev-conv-question');
  });

  it('どちらかがブロックしていると、新しい会話を始められない', async () => {
    const { db, repository } = setup(A);
    // 利用者Bの満員の募集。利用者Aとの会話はまだない
    block(db, B, A);

    expect(await repository.startConversation('dev-b-full')).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
    db.blocks.length = 0;
    expect((await repository.startConversation('dev-b-full')).status).toBe('opened');
  });

  it('主催者からも、ブロックの間は申請者との会話を始められない', async () => {
    const { db, repository } = setup(B);
    const application = db.applications.find(
      (item) => item.userId === 'dev-user-minor' && item.eventId === 'dev-beginner-afternoon',
    );
    if (!application) throw new Error('申請がありません。');
    block(db, 'dev-user-minor', B);

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'notAllowed',
    });
    db.blocks.length = 0;
    expect((await repository.startConversationWithApplicant(application.id)).status).toBe('opened');
  });

  it('解除すると、また送信できる', async () => {
    const { db, repository } = setup(A);
    block(db, A, B);
    expect((await send(repository, 'dev-conv-question')).status).toBe('rejected');

    db.blocks.length = 0;
    expect((await send(repository, 'dev-conv-question')).status).toBe('sent');
  });

  it('ほかの人との会話には影響しない', async () => {
    const { db, repository } = setup(A);
    block(db, B, A);

    expect((await send(repository, 'dev-conv-approved')).status).toBe('sent');
  });
});

describe('送信回数の上限（MSG-05）', () => {
  it('1分間に10通まで。11通目は断り、1分たてば送れる', async () => {
    const { db, repository, setNow } = setup(A);
    for (let i = 0; i < 10; i += 1) {
      expect((await send(repository, 'dev-conv-approved')).status).toBe('sent');
    }
    const count = db.messages.length;

    expect(await send(repository, 'dev-conv-question')).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
    expect(db.messages).toHaveLength(count);
    setNow(new Date(NOW.getTime() + MINUTE_MS + 1));
    expect((await send(repository, 'dev-conv-question')).status).toBe('sent');
  });

  it('1時間に60通まで', async () => {
    const { repository, setNow } = setup(A);
    // 1分に6通ずつ、10分で60通
    for (let i = 0; i < 60; i += 1) {
      setNow(new Date(NOW.getTime() + Math.floor(i / 6) * MINUTE_MS));
      expect((await send(repository, 'dev-conv-approved')).status).toBe('sent');
    }

    setNow(new Date(NOW.getTime() + 30 * MINUTE_MS));
    expect(await send(repository, 'dev-conv-approved')).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
    setNow(new Date(NOW.getTime() + HOUR_MS + 1));
    expect((await send(repository, 'dev-conv-approved')).status).toBe('sent');
  });

  it('送信できなかったものは数えない', async () => {
    const { repository } = setup(A);
    for (let i = 0; i < 10; i += 1) {
      await repository.send({
        conversationId: 'dev-conv-approved',
        body: '　',
        clientRequestId: requestId(),
      });
    }

    expect((await send(repository, 'dev-conv-approved')).status).toBe('sent');
  });

  it('上限に達していても、同じ送信の繰り返しは前の結果を返す', async () => {
    const { db, repository } = setup(A);
    const first = await repository.send({
      conversationId: 'dev-conv-approved',
      body: '1通目',
      clientRequestId: 'same-request',
    });
    for (let i = 0; i < 9; i += 1) await send(repository, 'dev-conv-approved');
    const count = db.messages.length;

    expect(
      await repository.send({
        conversationId: 'dev-conv-approved',
        body: '1通目',
        clientRequestId: 'same-request',
      }),
    ).toEqual(first);
    expect(db.messages).toHaveLength(count);
  });

  it('回数はブロックより先に判定する（上限の案内から、ブロックを推測させない）', async () => {
    const { db, repository } = setup(A);
    for (let i = 0; i < 10; i += 1) await send(repository, 'dev-conv-approved');
    block(db, B, A);

    expect(await send(repository, 'dev-conv-question')).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
  });
});

describe('新しい会話の回数の上限（SAFE-09）', () => {
  /** 直近24時間に利用者が始めた会話を、ダミーの会話も含めて count 件にする。 */
  const startedRecently = (db: ReturnType<typeof setup>['db'], userId: string, count: number) => {
    const existing = db.conversations.filter(
      (item) => item.startedBy === userId && NOW.getTime() - item.createdAt.getTime() < DAY_MS,
    ).length;
    for (let i = existing; i < count; i += 1) {
      db.conversations.push({
        id: `dev-conv-recent-${userId}-${i}`,
        eventId: 'dev-ongoing',
        hostId: 'dev-host-haru',
        inquirerId: userId,
        startedBy: userId,
        createdAt: new Date(NOW.getTime() - HOUR_MS),
        lastMessageAt: null,
        hostLastReadSeq: 0,
        inquirerLastReadSeq: 0,
      });
    }
  };

  it('24時間に10件まで。11件目は断り、24時間たてば始められる', async () => {
    const { db, repository, setNow } = setup(A);
    startedRecently(db, A, 9);
    expect((await repository.startConversation('dev-b-full')).status).toBe('opened');

    expect(await repository.startConversation('dev-easy-morning')).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
    setNow(new Date(NOW.getTime() + DAY_MS));
    expect((await repository.startConversation('dev-easy-morning')).status).toBe('opened');
  });

  it('上限に達していても、すでにある会話は開ける', async () => {
    const { db, repository } = setup(A);
    startedRecently(db, A, 10);

    expect(await repository.startConversation('dev-beginner-afternoon')).toEqual({
      status: 'opened',
      conversationId: 'dev-conv-question',
    });
  });

  it('主催者から始める会話も数える', async () => {
    const { db, repository } = setup(B);
    startedRecently(db, B, 10);
    const application = db.applications.find(
      (item) => item.userId === 'dev-user-minor' && item.eventId === 'dev-beginner-afternoon',
    );
    if (!application) throw new Error('申請がありません。');

    expect(await repository.startConversationWithApplicant(application.id)).toEqual({
      status: 'rejected',
      reason: 'rateLimited',
    });
  });

  it('相手が始めた会話は数えない', async () => {
    const { db, repository } = setup(A);
    for (let i = 0; i < 10; i += 1) {
      db.conversations.push({
        id: `dev-conv-by-other-${i}`,
        eventId: 'dev-ongoing',
        hostId: A,
        inquirerId: `dev-member-${i + 1}`,
        startedBy: `dev-member-${i + 1}`,
        createdAt: new Date(NOW.getTime() - HOUR_MS),
        lastMessageAt: null,
        hostLastReadSeq: 0,
        inquirerLastReadSeq: 0,
      });
    }

    expect((await repository.startConversation('dev-b-full')).status).toBe('opened');
  });
});

describe('「未読あり」（M-09）', () => {
  const unread = async (repository: ReturnType<typeof setup>['repository']) =>
    (await repository.listMine()).filter((item) => item.hasUnread).map((item) => item.id);

  it('相手から、まだ開いていないメッセージがある会話にだけ付く', async () => {
    const { repository, session } = setup(A);
    expect(await unread(repository)).toEqual(['dev-conv-approved']);

    session.setUserId(B);
    expect(await unread(repository)).toEqual(['dev-conv-question']);
  });

  it('読んだことにすると消え、相手が送ると、また付く', async () => {
    const { repository, session } = setup(B);
    const detail = await repository.getMessages('dev-conv-question');
    const last = detail?.messages.at(-1)?.seq ?? 0;

    await repository.markRead('dev-conv-question', last);
    expect(await unread(repository)).toEqual([]);
    session.setUserId(A);
    await send(repository, 'dev-conv-question');
    session.setUserId(B);
    expect(await unread(repository)).toEqual(['dev-conv-question']);
  });

  it('自分の送信では付かない', async () => {
    const { repository } = setup(A);
    await send(repository, 'dev-conv-question');

    expect(await unread(repository)).toEqual(['dev-conv-approved']);
  });

  it('読んだ位置は、自分の側だけが変わり、相手の「未読あり」は変わらない', async () => {
    const { repository, session } = setup(A);
    const detail = await repository.getMessages('dev-conv-question');

    await repository.markRead('dev-conv-question', detail?.messages.at(-1)?.seq ?? 0);
    session.setUserId(B);
    expect(await unread(repository)).toEqual(['dev-conv-question']);
  });

  it('読んだ位置は小さくならず、会話にあるメッセージより先にならない', async () => {
    const { repository, session } = setup(A);
    await repository.markRead('dev-conv-approved', Number.MAX_SAFE_INTEGER);
    await repository.markRead('dev-conv-approved', 0);
    expect(await unread(repository)).toEqual([]);

    // 先の位置まで読んだことにはならないため、相手が送ったら付く
    session.setUserId('dev-host-yui');
    await send(repository, 'dev-conv-approved');
    session.setUserId(A);
    expect(await unread(repository)).toEqual(['dev-conv-approved']);
  });

  it('当事者でない人は、読んだ位置を変えられない', async () => {
    const { db, repository } = setup('dev-user-minor');
    const before = structuredClone(db.conversations);

    await repository.markRead('dev-conv-approved', Number.MAX_SAFE_INTEGER);
    expect(db.conversations).toEqual(before);
  });

  it('相手が読んだ位置は、画面に返さない', async () => {
    const { repository } = setup(A);

    for (const item of await repository.listMine()) {
      expect(Object.keys(item).join()).not.toMatch(/lastRead|readSeq/i);
    }
  });
});

describe('ダミーの会話', () => {
  it('本文に、住所・電話番号・メールアドレスの形の文字を入れない', () => {
    const { db } = setup();

    for (const message of db.messages) {
      expect(message.body).not.toMatch(/@|\d{2,}|[０-９]{2,}|丁目|番地|-\d/);
    }
  });
});
