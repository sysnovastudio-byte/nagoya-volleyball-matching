import { RATE_LIMITS, reachedLimit } from '../features/safety/rateLimits';
import type { DevDatabase } from './devDatabase';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devRateLimits');

/**
 * 【開発専用】回数の上限の判定。**画面の確認用であり、本番の制限にはならない。**
 * 本番ではDB関数が、利用者ごとの勧告的ロックを取ってから、消えない行を数える（docs/06の5-10・14-2）。
 * 失敗した操作は行が残らないため数えない。
 */

/** メッセージの送信（1分間に10通・1時間に60通）。数えるのは messages（docs/06の5-6）。 */
export function messageLimitReached(db: DevDatabase, userId: string, now: Date) {
  const sentAt = db.messages
    .filter((message) => message.senderId === userId)
    .map((message) => message.createdAt);
  return (
    reachedLimit(sentAt, RATE_LIMITS.messagePerMinute, now) ||
    reachedLimit(sentAt, RATE_LIMITS.messagePerHour, now)
  );
}

/** 新しい会話の開始（1日10件）。数えるのは conversations の started_by・created_at（docs/06の14-2）。 */
export function conversationStartLimitReached(db: DevDatabase, userId: string, now: Date) {
  const startedAt = db.conversations
    .filter((conversation) => conversation.startedBy === userId)
    .map((conversation) => conversation.createdAt);
  return reachedLimit(startedAt, RATE_LIMITS.conversationStart, now);
}

/** 通報（1日10件）。数えるのは reports の reporter_id・created_at（docs/06の14-2）。通報した人の通報の日時を受け取る。 */
export function reportLimitReached(reportedAt: readonly Date[], now: Date) {
  return reachedLimit(reportedAt, RATE_LIMITS.report, now);
}
