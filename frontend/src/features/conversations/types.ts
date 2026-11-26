import type { PublicProfile } from '../profiles/types';

/** 会話の相手との関係。 */
export type ConversationRole = 'host' | 'inquirer';

/** 会話一覧・会話の見出しに出す募集。非表示の募集は開催日時だけ（docs/11の3-1）。 */
export type ConversationEvent =
  | { hidden: false; id: string; title: string; startsAt: string; endsAt: string }
  | { hidden: true; startsAt: string; endsAt: string };

export interface ConversationSummary {
  id: string;
  /** 自分の立場。主催者か、問い合わせた人か */
  role: ConversationRole;
  /** 相手。退会した人は「退会したユーザー」と示す */
  partner: PublicProfile;
  event: ConversationEvent;
  /** 最後のメッセージの日時。メッセージがない間は null */
  lastMessageAt: string | null;
  /**
   * 送信できる期間（開催の終了日時から7日後まで）の中か。期間の後は閲覧だけできる。
   * ブロックや相手の停止は、ここに含めない（送信したときに「送信できません」とだけ返す）
   */
  withinSendPeriod: boolean;
  /** 送信できる期間の終わり */
  sendableUntil: string;
}

export interface Message {
  id: string;
  /** 会話の中の順序（docs/06の4-8） */
  seq: number;
  /** 自分が送ったか。送信者のIDは画面に渡さない */
  isMine: boolean;
  body: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: Message[];
}

export type StartConversationResult =
  | { status: 'opened'; conversationId: string }
  /**
   * 開始できない。理由は「送信できません」と同じく示さない（Q-20）。
   * notLoggedIn・profileRequired だけは、画面でログイン・登録へ案内するために分ける
   */
  | { status: 'rejected'; reason: 'notLoggedIn' | 'profileRequired' | 'notAllowed' };

export interface SendMessageInput {
  conversationId: string;
  body: string;
  /** 二重送信の防止。同じ値の送信は、新しく作らずに前の結果を返す（docs/06の4-8） */
  clientRequestId: string;
}

export type SendMessageResult =
  | { status: 'sent'; message: Message }
  /** 理由は画面に示さない。どれも「送信できません」とする（docs/06の5-7、Q-20） */
  | { status: 'rejected'; reason: 'notLoggedIn' | 'invalid' | 'notAllowed' };

/**
 * 会話の窓口。将来は docs/06の6-5の関数を呼ぶ実装に置き換える。
 * - startConversation → start_conversation
 * - listMine → get_my_conversations
 * - getMessages → messages の取得（当事者だけ、RLS）
 * - send → send_message
 * ログイン中の人は窓口が内部で決める。画面から自分のID・送信者のIDを渡さない。
 */
export interface ConversationRepository {
  /** 募集の主催者との会話を始める。すでにある場合は、その会話を返す。 */
  startConversation(eventId: string): Promise<StartConversationResult>;
  /** 自分が当事者の会話。新しく動いた順。未ログインは空を返す。 */
  listMine(): Promise<ConversationSummary[]>;
  /** 会話とメッセージ。当事者でない・ない場合は、どちらも null を返す。 */
  getMessages(conversationId: string): Promise<ConversationDetail | null>;
  /** 送信する。送信者は、常にログイン中の人。 */
  send(input: SendMessageInput): Promise<SendMessageResult>;
}
