import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useViewer } from '../features/auth/sessionContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const ICON_PROPS = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-6 shrink-0',
} as const;

/** ログイン後の5つの移動先（docs/11の5-1・追加-12）。まだない画面（通知）は仮の画面へつなぐ。 */
const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'ホーム',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    to: '/activity',
    label: '申請と募集',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
      </svg>
    ),
  },
  {
    to: '/conversations',
    label: '会話',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
    ),
  },
  {
    to: '/notifications',
    label: '通知',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'プロフィール',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
      </svg>
    ),
  },
];

interface MemberNavProps {
  placement: 'top' | 'bottom';
}

/**
 * ログイン後の主な移動。スマートフォンは下部、PCは上部に置く。
 * 下部のラベルだけは、例外として12pxとし、アイコンを併記する（docs/11の5-1）。
 * 未読の通知の数は、通知（SCR-012）を作るときに加える。
 */
export function MemberNav({ placement }: MemberNavProps) {
  const isBottom = placement === 'bottom';
  // PCの上部では「プロフィール」の代わりにニックネームを示す（docs/11の5-1、2026-11-26）
  const nickname = useViewer()?.profile?.nickname;

  return (
    <nav aria-label="主な移動">
      <ul className={isBottom ? 'grid grid-cols-5' : 'flex gap-1'}>
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center rounded-xl font-bold ${
                  isActive ? 'bg-main-tint text-main-strong' : 'text-sub hover:bg-canvas'
                } ${
                  isBottom
                    ? 'min-h-14 flex-col justify-center gap-0.5 text-xs leading-tight tracking-tight whitespace-nowrap'
                    : 'min-h-11 gap-1.5 px-3'
                }`
              }
            >
              {item.icon}
              {!isBottom && item.to === '/profile' && nickname ? (
                <>
                  <span className="sr-only">プロフィール：</span>
                  <span className="max-w-40 truncate">{nickname}</span>
                </>
              ) : (
                <span className="text-center">{item.label}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
