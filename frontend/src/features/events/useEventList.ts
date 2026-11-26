import { useEffect, useReducer } from 'react';
import { useEventRepository } from './repositoryContext';
import type { EventListResult, PublicEvent } from './types';

type ListState =
  | { status: 'loading'; attempt: number }
  | { status: 'error'; attempt: number }
  | {
      status: 'ready';
      attempt: number;
      items: PublicEvent[];
      nextCursor: string | null;
      more: 'idle' | 'loading' | 'error';
    };

type Action =
  | { type: 'loaded'; result: EventListResult }
  | { type: 'failed' }
  | { type: 'retried' }
  | { type: 'moreStarted' }
  | { type: 'moreLoaded'; result: EventListResult }
  | { type: 'moreFailed' };

function reducer(state: ListState, action: Action): ListState {
  switch (action.type) {
    case 'loaded':
      return { status: 'ready', attempt: state.attempt, more: 'idle', ...action.result };
    case 'failed':
      return { status: 'error', attempt: state.attempt };
    case 'retried':
      return { status: 'loading', attempt: state.attempt + 1 };
    case 'moreStarted':
      return state.status === 'ready' ? { ...state, more: 'loading' } : state;
    case 'moreLoaded':
      return state.status === 'ready'
        ? {
            ...state,
            items: [...state.items, ...action.result.items],
            nextCursor: action.result.nextCursor,
            more: 'idle',
          }
        : state;
    case 'moreFailed':
      return state.status === 'ready' ? { ...state, more: 'error' } : state;
  }
}

export function useEventList() {
  const repository = useEventRepository();
  const [state, dispatch] = useReducer(reducer, { status: 'loading', attempt: 0 });
  const { attempt } = state;

  useEffect(() => {
    let active = true;
    repository.listEvents().then(
      (result) => {
        if (active) dispatch({ type: 'loaded', result });
      },
      () => {
        if (active) dispatch({ type: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [repository, attempt]);

  const retry = () => {
    dispatch({ type: 'retried' });
  };

  const loadMore = async () => {
    if (state.status !== 'ready' || state.nextCursor === null || state.more === 'loading') return;
    dispatch({ type: 'moreStarted' });
    try {
      const result = await repository.listEvents(state.nextCursor);
      dispatch({ type: 'moreLoaded', result });
    } catch {
      dispatch({ type: 'moreFailed' });
    }
  };

  return { state, retry, loadMore };
}
