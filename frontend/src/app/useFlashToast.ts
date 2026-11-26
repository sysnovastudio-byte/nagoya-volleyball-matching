import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useToast } from './toastContext';

/**
 * 前の画面から渡された印（location.state の key が true）があれば、通知を出す。
 * 出した後は印を消し、戻る・進むで同じ通知を出し直さない。ほかの state（戻る先など）は残す。
 */
export function useFlashToast(key: string, text: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const state = location.state as Record<string, unknown> | null;
  const flagged = state?.[key] === true;

  useEffect(() => {
    if (!flagged) return;
    toast(text);
    void navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...state, [key]: undefined },
    });
  }, [flagged, key, text, toast, navigate, location.pathname, location.search, state]);
}
