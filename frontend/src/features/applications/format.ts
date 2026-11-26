import { toDateParts } from '../events/format';

/** 申請の日時。「11月25日（水）12:00」の形。 */
export function formatAppliedAt(iso: string) {
  const parts = toDateParts(iso);
  return `${parts.month}月${parts.day}日（${parts.weekday}）${parts.time}`;
}
