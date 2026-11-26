import { useResource } from '../../app/useResource';
import { useEventRepository } from './repositoryContext';

/** 募集詳細。ない場合と見られない場合は、どちらも null になる。 */
export function useEvent(eventId: string) {
  const repository = useEventRepository();
  return useResource(`event:${eventId}`, () => repository.getEvent(eventId));
}
