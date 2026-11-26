/**
 * 開発用の実装を、最初に使うときに1度だけ読み込む。
 * 呼び出し側は必ず `if (import.meta.env.DEV)` の中で使い、本番用のビルドから読み込みごと取り除く。
 */
export function lazyDev<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () => (loading ??= load());
}
