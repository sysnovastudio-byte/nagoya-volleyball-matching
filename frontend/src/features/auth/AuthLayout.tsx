import { useEffect, useRef, type ReactNode } from 'react';
import { useDocumentTitle } from '../../app/useDocumentTitle';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
}

/** 認証の画面（SCR-001〜003）。スマートフォンでもPCでも、中央に1列（最大400px、docs/11の5-1）。 */
export function AuthLayout({ title, children }: AuthLayoutProps) {
  useDocumentTitle(title);

  return (
    <div className="mx-auto w-full max-w-100 px-4 py-8">
      <h1 className="mb-5 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

/**
 * 開発中だけに出す注意。呼び出し側で `import.meta.env.DEV &&` の中に置き、
 * 本番用のビルドから文言ごと取り除く。
 */
export function DevNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border-2 border-dashed border-main bg-main-tint px-4 py-3 text-main-strong">
      <p className="font-bold">開発用</p>
      {children}
    </div>
  );
}

/** 送信の結果の誤り。出たときにフォーカスを移して、読み上げでも気付けるようにする。 */
export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;
  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-xl border border-danger px-4 py-3 font-bold text-danger"
    >
      {message}
    </p>
  );
}
