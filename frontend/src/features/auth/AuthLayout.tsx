import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
}

/** 認証の画面（SCR-001〜004）。スマートフォンでもPCでも、中央に1列（最大400px、docs/11の5-1）。 */
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
export function DevNotice({ title = '開発用', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border-2 border-dashed border-main bg-main-tint px-4 py-3 text-main-strong">
      <p className="font-bold">{title}</p>
      {children}
    </div>
  );
}

/**
 * 開発中だけに出す、メールのリンクの代わり。メールは送らないため、ここから開いて表示を確かめる。
 * DevNotice と同じく、呼び出し側で `import.meta.env.DEV &&` の中に置く。
 */
export function DevEmailLinks({
  description,
  links,
}: {
  description: string;
  links: readonly { to: string; label: string }[];
}) {
  return (
    <DevNotice title="メールのリンクを開く（開発用）">
      <p className="mb-2">{description}</p>
      <ul className="flex flex-col">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="inline-flex min-h-11 items-center font-bold underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </DevNotice>
  );
}

/**
 * Bot対策（SAFE-10）の確認を置く場所。本番では Cloudflare Turnstile のウィジェットを置き、
 * Supabase Auth の CAPTCHA 保護で確かめる（docs/11のQ-48）。今は接続していないため、場所と状態だけを示す。
 * 本番用のビルドでも、接続するまでは同じ表示にする。
 */
export function BotCheckSlot() {
  return (
    <div
      role="group"
      aria-label="Bot対策の確認"
      className="flex min-h-16 flex-col justify-center rounded-xl border border-dashed border-line bg-surface px-4 py-3"
    >
      <p className="font-bold">Bot対策の確認（未接続）</p>
      <p className="text-muted">ここに自動操作を防ぐ確認を置きます。今は接続していません。</p>
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
