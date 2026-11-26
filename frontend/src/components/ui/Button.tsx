import type { ComponentProps } from 'react';
import { Link } from 'react-router';

type Variant = 'primary' | 'secondary' | 'danger' | 'text';
type Size = 'normal' | 'small';

const BASE =
  'inline-flex items-center justify-center rounded-xl text-center font-bold transition-colors';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-main text-white hover:bg-main-strong',
  secondary: 'border border-sub bg-surface text-sub hover:bg-main-tint',
  danger: 'bg-danger text-white hover:brightness-90',
  text: 'text-main-strong hover:underline',
};

// 押せる範囲は44px四方以上（docs/11の5-1）
const SIZES: Record<Size, string> = {
  normal: 'min-h-13 px-5 py-3',
  small: 'min-h-11 px-3 py-2',
};

interface ButtonStyle {
  variant?: Variant;
  size?: Size;
}

function buttonClass(variant: Variant = 'primary', size: Size = 'normal') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

type ButtonProps = ButtonStyle & Omit<ComponentProps<'button'>, 'className'>;

export function Button({ variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${buttonClass(variant, size)} disabled:cursor-not-allowed disabled:bg-line disabled:text-sub`}
    />
  );
}

type ButtonLinkProps = ButtonStyle & Omit<ComponentProps<typeof Link>, 'className'>;

export function ButtonLink({ variant, size, ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClass(variant, size)} />;
}
