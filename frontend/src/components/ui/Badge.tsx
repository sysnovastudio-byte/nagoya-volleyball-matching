import type { ReactNode } from 'react';

/**
 * 札の色（docs/11の5-2「状態の色」）。同じ種類の状態どうしで色が似ないように、
 * 色みと「塗り・淡い面・枠だけ」を組み合わせる。数値は文字と面のコントラスト比。
 */
export type BadgeTone =
  /** 塗り：メイン（白い文字 4.69） */
  | 'main'
  /** 淡い面：メイン（5.61） */
  | 'mainTint'
  /** 塗り：緑（白い文字 6.44） */
  | 'success'
  /** 淡い面：緑（5.70） */
  | 'successTint'
  /** 塗り：アクセント（濃い文字 6.78。白い文字は2.38で使わない） */
  | 'accent'
  /** 淡い面：アクセント（5.38） */
  | 'accentTint'
  /** 塗り：赤（白い文字 6.54） */
  | 'danger'
  /** 淡い面：赤（5.58） */
  | 'dangerTint'
  /** 淡い面：紫（6.33） */
  | 'violetTint'
  /** 塗り：サブ（白い文字 11.61） */
  | 'dark'
  /** 淡い面：灰（8.93） */
  | 'neutral'
  /** 枠だけ（5.72。枠は3.85） */
  | 'outline';

/** 札の色の組み合わせ。Tailwind CSS が拾えるよう、クラス名は省略せずに書く */
export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  main: 'border-main bg-main text-white',
  mainTint: 'border-main bg-main-tint text-main-strong',
  success: 'border-success bg-success text-white',
  successTint: 'border-success bg-success-tint text-success',
  accent: 'border-accent bg-accent text-ink',
  accentTint: 'border-accent bg-accent-tint text-accent-ink',
  danger: 'border-danger bg-danger text-white',
  dangerTint: 'border-danger bg-danger-tint text-danger',
  violetTint: 'border-violet bg-violet-tint text-violet',
  dark: 'border-sub bg-sub text-white',
  neutral: 'border-line bg-line text-sub',
  outline: 'border-field-line bg-surface text-muted',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

/** 状態を示す札。色だけに頼らず、必ず文字を入れる（docs/11の5-1）。 */
export function Badge({ tone = 'mainTint', children }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-lg border px-2.5 py-0.5 font-bold ${BADGE_TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
