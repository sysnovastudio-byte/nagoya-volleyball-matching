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

  it('メッセージのない会話は、始めた人の一覧だけに出す（DB-29 の仮の扱い）', async () => {
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

  it('主催者は、自分の募集で会話を始められない（MSG-06 は作らない）', async () => {
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

describe('ダミーの会話', () => {
  it('本文に、住所・電話番号・メールアドレスの形の文字を入れない', () => {
    const { db } = setup();

    for (const message of db.messages) {
      expect(message.body).not.toMatch(/@|\d{2,}|[０-９]{2,}|丁目|番地|-\d/);
    }
  });
});
