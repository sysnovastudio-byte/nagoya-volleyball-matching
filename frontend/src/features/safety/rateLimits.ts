const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 回数の上限。直近の期間（windowMs）に max 回まで。 */
export interface RateLimit {
  max: number;
  windowMs: number;
}

/**
 * チャットと通報の回数の上限（docs/11の3-1・4-5）。「1日」は直近24時間（DB-05）。
 * 本番ではDB関数が強制する（docs/06の5-6・5-10・14-2）。画面は案内の文に数値を使う。
 * 募集の作成・参加申請の上限は、それぞれ EVENT_LIMITS・APPLICATION_LIMITS にある。
 * ブロックの上限は公開後（M-13）のため、ここに置かない。
 */
export const RATE_LIMITS = {
  /** メッセージの送信（MSG-05）。1分間に10通 */
  messagePerMinute: { max: 10, windowMs: MINUTE_MS },
  /** メッセージの送信（MSG-05）。1時間に60通 */
  messagePerHour: { max: 60, windowMs: HOUR_MS },
  /** 新しい会話の開始（SAFE-09）。1日10件 */
  conversationStart: { max: 10, windowMs: DAY_MS },
  /** 通報（SAFE-09）。1日10件 */
  report: { max: 10, windowMs: DAY_MS },
} as const satisfies Record<string, RateLimit>;

/** 操作した日時の一覧が、直近の期間で上限に達しているか。達していれば、次の操作は断る。 */
export function reachedLimit(times: readonly Date[], limit: RateLimit, now: Date) {
  const since = now.getTime() - limit.windowMs;
  return times.filter((time) => time.getTime() > since).length >= limit.max;
}
