import { textLength } from '../../lib/text';

/** メッセージの上限（docs/11の3-3、docs/06の4-8）。 */
export const MESSAGE_MAX_LENGTH = 1000;

/** 送信できる期間は、開催の終了日時から7日後まで（docs/11の3-1）。 */
export const SEND_PERIOD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function sendableUntil(endsAt: string) {
  return new Date(new Date(endsAt).getTime() + SEND_PERIOD_DAYS * DAY_MS);
}

/** 本文の誤り。空白だけ・上限を超える場合。前後の空白は除いて数える。 */
export function checkMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed === '') return 'メッセージを入力してください。';
  const length = textLength(trimmed);
  if (length > MESSAGE_MAX_LENGTH) {
    return `${MESSAGE_MAX_LENGTH.toLocaleString('ja-JP')}文字以内で入力してください（今は${length.toLocaleString('ja-JP')}文字）。`;
  }
  return null;
}
