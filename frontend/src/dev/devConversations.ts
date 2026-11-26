import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devConversations');

/** 【開発専用】保存されている会話の形（docs/06の4-7）。 */
export interface DevConversationRecord {
  id: string;
  eventId: string;
  hostId: string;
  inquirerId: string;
  startedBy: string;
  createdAt: Date;
  lastMessageAt: Date | null;
}

/** 【開発専用】保存されているメッセージの形（docs/06の4-8）。 */
export interface DevMessageRecord {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  body: string;
  clientRequestId: string;
  createdAt: Date;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 架空の会話。本文に住所・電話番号・メールアドレスの形の文字を入れない。
 * [会話のID, 募集のID, 主催者, 問い合わせた人, 始めてからの時間（何日前）, メッセージ（送った人, 本文）]
 */
const CONVERSATIONS: [
  id: string,
  eventId: string,
  hostId: string,
  inquirerId: string,
  daysAgo: number,
  messages: [sender: 'host' | 'inquirer', body: string][],
][] = [
  // 申請前の質問（利用者A → 利用者B）
  [
    'dev-conv-question',
    'dev-beginner-afternoon',
    'dev-user-b',
    'dev-user-a',
    2,
    [
      ['inquirer', 'はじめまして。バレーは中学の部活以来なのですが、参加しても大丈夫でしょうか？'],
      ['host', 'はじめまして。久しぶりの方も多いので大丈夫です。準備運動から一緒にやりましょう。'],
      ['inquirer', 'ありがとうございます。申請してみます。'],
    ],
  ],
  // 承認後の連絡（利用者Aは承認済み）
  [
    'dev-conv-approved',
    'dev-family-morning',
    'dev-host-yui',
    'dev-user-a',
    1,
    [
      ['host', '参加を承認しました。当日は体育館の入口の近くに集まります。'],
      ['inquirer', 'ありがとうございます。室内用のシューズを持っていきます。'],
      ['host', 'よろしくお願いします。飲み物も忘れずにお持ちください。'],
    ],
  ],
  // メッセージのない会話（始めた利用者Aの一覧だけに出る、DB-29）
  ['dev-conv-empty', 'dev-weekday-night', 'dev-host-minato', 'dev-user-a', 0, []],
  // 送信できる期間を過ぎた会話（利用者Bが主催した、10日前の募集）
  [
    'dev-conv-expired',
    'dev-b-ended',
    'dev-user-b',
    'dev-member-1',
    12,
    [
      ['inquirer', '初めて参加します。よろしくお願いします。'],
      ['host', 'こちらこそ、よろしくお願いします。'],
      ['inquirer', '先日はありがとうございました。また参加したいです。'],
    ],
  ],
  // 非表示になった募集の会話（一覧では開催日時だけを示す）
  [
    'dev-conv-hidden',
    'dev-hidden',
    'dev-host-tsubasa',
    'dev-user-a',
    3,
    [['host', '参加の承認をしました。よろしくお願いします。']],
  ],
];

export function createDevConversations(now: Date) {
  const conversations: DevConversationRecord[] = [];
  const messages: DevMessageRecord[] = [];
  for (const [id, eventId, hostId, inquirerId, daysAgo, items] of CONVERSATIONS) {
    const createdAt = new Date(now.getTime() - daysAgo * DAY_MS - HOUR_MS);
    let last: Date | null = null;
    items.forEach(([sender, body], index) => {
      const createdAtOfMessage = new Date(createdAt.getTime() + (index + 1) * 20 * MINUTE_MS);
      messages.push({
        id: `${id}-message-${index + 1}`,
        seq: messages.length + 1,
        conversationId: id,
        senderId: sender === 'host' ? hostId : inquirerId,
        body,
        clientRequestId: `${id}-request-${index + 1}`,
        createdAt: createdAtOfMessage,
      });
      last = createdAtOfMessage;
    });
    conversations.push({
      id,
      eventId,
      hostId,
      inquirerId,
      startedBy: inquirerId,
      createdAt,
      lastMessageAt: last,
    });
  }
  return { conversations, messages };
}
