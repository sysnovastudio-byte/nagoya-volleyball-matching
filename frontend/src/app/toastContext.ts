import { createContext, useContext } from 'react';

/** 通知が消えるまでの時間（ミリ秒）。 */
export const TOAST_DURATION_MS = 3000;

export const ToastContext = createContext<(text: string) => void>(() => undefined);

/**
 * 「○○しました」を、数秒で自動的に消える通知で示す。読み上げにも伝わる（aria-live）。
 * 誤りは消えると困るため、この通知を使わず、画面の中に残す。
 */
export function useToast() {
  return useContext(ToastContext);
}
