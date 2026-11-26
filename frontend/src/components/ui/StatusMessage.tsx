import type { ReactNode } from 'react';

interface StatusMessageProps {
  title: string;
  headingLevel?: 'h1' | 'h2';
  role?: 'alert' | 'status';
  children?: ReactNode;
}

/** 該当なし・失敗・ページがないなど、内容の代わりに示す共通の表示。 */
export function StatusMessage({
  title,
  headingLevel: Heading = 'h2',
  role,
  children,
}: StatusMessageProps) {
  return (
    <section
      role={role}
      className="mx-auto flex w-full max-w-160 flex-col items-center gap-4 px-4 py-12 text-center"
    >
      <Heading className="text-xl font-bold">{title}</Heading>
      {children}
    </section>
  );
}
