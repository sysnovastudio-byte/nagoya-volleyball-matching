import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';

export type OverflowMenuItem =
  | { label: string; to: string; onSelect?: never }
  | { label: string; onSelect: () => void; to?: never };

interface OverflowMenuProps {
  /** ボタンの読み上げ名。何への操作かが分かるようにする（例：「あおいさんへの操作」） */
  label: string;
  items: readonly OverflowMenuItem[];
}

/**
 * 「…」のメニュー。頻度の低い操作（通報・ブロックなど）をまとめる（2026-11-27の決定）。
 * 開閉のボタンと、その下に出る操作の一覧。Esc・外側の操作・選んだときに閉じる。
 */
export function OverflowMenu({ label, items }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;
  const itemClass =
    'flex min-h-11 w-full items-center px-4 text-left font-bold text-ink hover:bg-canvas';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex size-11 items-center justify-center rounded-full text-sub hover:bg-canvas"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-6">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="absolute top-full right-0 z-20 mt-1 min-w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
      >
        {items.map((item) => (
          <li key={item.label}>
            {item.to !== undefined ? (
              <Link to={item.to} className={itemClass}>
                {item.label}
              </Link>
            ) : (
              <button
                type="button"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
