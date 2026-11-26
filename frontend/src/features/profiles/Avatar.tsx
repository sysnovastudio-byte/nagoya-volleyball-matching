interface AvatarProps {
  size?: 'small' | 'large';
}

const SIZES = { small: 'size-11', large: 'size-20' } as const;

/**
 * プロフィール画像の代わりの絵柄。サイクル1は画像を扱わず、全員に同じ絵柄を示す。
 * 名前は隣に文字で示すため、読み上げない。
 */
export function Avatar({ size = 'small' }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-main-tint text-main ${SIZES[size]}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-3/4 translate-y-1">
        <circle cx="12" cy="8" r="4.5" />
        <path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z" />
      </svg>
    </span>
  );
}
