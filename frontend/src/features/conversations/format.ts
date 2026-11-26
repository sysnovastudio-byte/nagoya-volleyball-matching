import { toDateParts } from '../events/format';
import type { ConversationEvent } from './types';

/** メッセージの日付の区切り。「11月25日（水）」の形（日本時間）。 */
export function messageDay(iso: string) {
  const parts = toDateParts(iso);
  return `${parts.month}月${parts.day}日（${parts.weekday}）`;
}

/** 送信の時刻。「9:05」の形（日本時間）。 */
export function messageTime(iso: string) {
  return toDateParts(iso).time;
}

/** 一覧の最後のメッセージの日時。「11/25 9:05」の形。 */
export function shortDateTime(iso: string) {
  const parts = toDateParts(iso);
  return `${parts.month}/${parts.day} ${parts.time}`;
}

/** 会話の募集の名前。非表示の募集はタイトルを出さない（docs/11の3-1）。 */
export function conversationEventTitle(event: ConversationEvent) {
  return event.hidden ? '非表示になった募集' : event.title;
}
