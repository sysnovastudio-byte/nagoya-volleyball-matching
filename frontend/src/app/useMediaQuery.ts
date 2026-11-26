import { useSyncExternalStore } from 'react';

/** docs/11の5-1の区切り。Tailwind CSS の lg と同じ */
export const PC_QUERY = '(min-width: 1024px)';

/**
 * 画面の幅などの条件に合うか。表示の中身が幅で変わる場合だけに使い、見た目だけの違いは CSS で行う。
 * matchMedia がない環境（テストなど）では、合わないものとして扱う。
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
