import { Badge } from '../../components/ui/Badge';
import { stateLabel } from './format';
import type { EventState } from './types';

interface EventStateBadgeProps {
  state: EventState;
}

export function EventStateBadge({ state }: EventStateBadgeProps) {
  return <Badge tone={state === 'open' ? 'main' : 'neutral'}>{stateLabel(state)}</Badge>;
}
