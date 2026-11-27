import { Badge, type BadgeTone } from '../../components/ui/Badge';
import type { EventState } from '../events/types';
import { APPLICATION_STATUS_LABELS } from './format';
import type { ApplicationStatus } from './types';

/** 申請の状態の色（docs/11の5-2「状態の色」）。同じ種類の状態どうしで色が似ないようにする。 */
export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, BadgeTone> = {
  pending: 'accentTint',
  approved: 'success',
  rejected: 'dangerTint',
  cancelled: 'neutral',
  revoked: 'violetTint',
  retracted: 'outline',
};

/** 承認されないまま受付が終わった申請の色。 */
export const CLOSED_PENDING_TONE: BadgeTone = 'dark';

/** 開始後・中止の後に残った承認待ちか。「受付終了」と示す（docs/10の5-3）。 */
export function isClosedPending(status: ApplicationStatus, eventState: EventState) {
  return (
    status === 'pending' &&
    (eventState === 'ongoing' || eventState === 'ended' || eventState === 'cancelled')
  );
}

interface ApplicationStatusBadgeProps {
  status: ApplicationStatus;
  /** 募集の状態。渡すと、開始後に残った承認待ちを「受付終了」と示す */
  eventState?: EventState;
}

export function ApplicationStatusBadge({ status, eventState }: ApplicationStatusBadgeProps) {
  if (eventState && isClosedPending(status, eventState)) {
    return <Badge tone={CLOSED_PENDING_TONE}>受付終了</Badge>;
  }
  return <Badge tone={APPLICATION_STATUS_TONES[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}
