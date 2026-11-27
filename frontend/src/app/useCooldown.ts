import { useEffect, useState } from 'react';

/**
 * 操作の後に、決まった秒数だけ待たせる（認証メールの再送の60秒の間隔など）。
 * 画面の表示のためのもので、間隔は本番では送る側（Supabase Auth）も守る。
 * @param initiallyWaiting 開いた時点で待ち始めるか（直前にメールを送った画面など）
 */
export function useCooldown(seconds: number, initiallyWaiting = false) {
  const [until, setUntil] = useState<number | null>(() =>
    initiallyWaiting ? Date.now() + seconds * 1000 : null,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) setUntil(null);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [until]);

  const remaining = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
  return {
    /** 待つ残りの秒数。0 なら操作できる */
    remaining,
    start: () => {
      const current = Date.now();
      setNow(current);
      setUntil(current + seconds * 1000);
    },
  };
}
