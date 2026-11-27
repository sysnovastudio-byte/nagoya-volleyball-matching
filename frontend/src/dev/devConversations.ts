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
  /**
   * それぞれが読んだ最後のメッセージの seq。まだ読んでいなければ0（docs/06の14-1・14-4）。
   * 本番では相手の既読を見せないため、この2列を画面に返さない
   */
  hostLastReadSeq: number;
  inquirerLastReadSeq: number;
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
 * [会話のID, 募集のID, 主催者, 問い合わせた人, 始めてからの時間（何日前）, メッセージ（送った人, 本文）,
 *  最後のメッセージをまだ開いていない側（「未読あり」を確かめるため。省略すると両方とも読んだことにする）]
 */
const CONVERSATIONS: [
  id: string,
  eventId: string,
  hostId: string,
  inquirerId: string,
  daysAgo: number,
  messages: [sender: 'host' | 'inquirer', body: string][],
  unreadBy?: 'host' | 'inquirer',
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
    // 利用者Bは、最後のメッセージをまだ開いていない（Bの一覧に「未読あり」）
    'host',
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
    // 利用者Aは、最後のメッセージをまだ開いていない（Aの一覧に「未読あり」）
    'inquirer',
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
  // 通報されたメッセージがある会話（管理者の通報管理で、控えを確かめる。dev-report-3）
  [
    'dev-conv-reported',
    'dev-weekday-night',
    'dev-host-minato',
    'dev-member-3',
    2,
    [
      ['inquirer', '経験者向けとのことですが、ブランクがあっても参加できますか？'],
      ['host', '練習とは別に、こちらの会にも入りませんか。会費は月払いです。'],
    ],
  ],
  // 利用停止中の人が送ったメッセージがある会話（dev-report-4。停止中の人とは送受信できない）
  [
    'dev-conv-suspended',
    'dev-easy-morning',
    'dev-host-haru',
    'dev-user-suspended',
    5,
    [
      ['inquirer', '日曜の練習に興味があります。'],
      ['host', 'ありがとうございます。申請をお待ちしています。'],
      ['inquirer', '練習の後、二人で会えませんか。個別に連絡したいです。'],
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
  for (const [id, eventId, hostId, inquirerId, daysAgo, items, unreadBy] of CONVERSATIONS) {
    const createdAt = new Date(now.getTime() - daysAgo * DAY_MS - HOUR_MS);
    let last: Date | null = null;
    // 読んだ位置：全部読んだ側は最後のメッセージ、まだ開いていない側はその1つ前
    const lastSeq = messages.length + items.length;
    const readSeq = (side: 'host' | 'inquirer') =>
      items.length === 0 ? 0 : unreadBy === side ? lastSeq - 1 : lastSeq;
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
      hostLastReadSeq: readSeq('host'),
      inquirerLastReadSeq: readSeq('inquirer'),
    });
  }
  return { conversations, messages };
}
