import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TOAST_DURATION_MS, ToastContext } from './toastContext';

/**
 * 自動的に消える通知（docs/11の5-1の「○○しました」）。
 * 読み上げに伝わるよう、通知の場所（aria-live）は常に置き、そこに文を入れる。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, TOAST_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const show = useCallback((text: string) => {
    // 同じ文が続いても、表示の時間を数え直す
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="お知らせ"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex justify-center px-4"
      >
        {toast && (
          <p
            key={toast.id}
            className="max-w-120 rounded-xl border border-main bg-main-tint px-4 py-3 font-bold text-main-strong shadow-md"
          >
            {toast.text}
          </p>
        )}
      </div>
    </ToastContext>
  );
}
