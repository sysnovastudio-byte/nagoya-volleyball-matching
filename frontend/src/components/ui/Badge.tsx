import type { ReactNode } from 'react';

type Tone = 'main' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  main: 'bg-main-tint text-main-strong',
  neutral: 'bg-line text-sub',
  // 白い文字はコントラストが足りないため使わない（docs/11の5-2）
  accent: 'bg-accent text-ink',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

/** 状態を示す札。色だけに頼らず、必ず文字を入れる（docs/11の5-1）。 */
export function Badge({ tone = 'main', children }: BadgeProps) {
  return (
    <span className={`inline-block rounded-lg px-2.5 py-0.5 font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
