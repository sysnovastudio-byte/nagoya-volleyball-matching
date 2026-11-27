import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { stateLabel } from './format';
import type { EventState } from './types';

/**
 * 募集の状態の色（docs/11の5-2「状態の色」）。受付中と満員は、色みと塗りの両方で分ける。
 */
export const EVENT_STATE_TONES: Record<EventState, BadgeTone> = {
  open: 'main',
  full: 'accent',
  closed: 'dark',
  ongoing: 'successTint',
  ended: 'outline',
  cancelled: 'danger',
};

interface EventStateBadgeProps {
  state: EventState;
}

export function EventStateBadge({ state }: EventStateBadgeProps) {
  return <Badge tone={EVENT_STATE_TONES[state]}>{stateLabel(state)}</Badge>;
}
