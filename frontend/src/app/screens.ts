import { matchPath } from 'react-router';

/** 戻る先の画面。to は開いている画面のパラメーターから決める。 */
export interface ParentScreen {
  to: (params: Record<string, string | undefined>) => string;
  name: string;
}

export interface Screen {
  path: string;
  /** 戻るボタンに出す画面名（「← 〇〇に戻る」） */
  name: string;
  /**
   * 前の画面がない場合（アドレスを直接開いた場合など）の戻り先。
   * null は、下部の移動から直接開く5つの画面で、戻るボタンを置かない（docs/11の5-1）
   */
  parent: ParentScreen | null;
  /** スマートフォンだけに戻るボタンを置く（PCでは一覧と並べて示す会話） */
  mobileOnly?: boolean;
}

const HOME: ParentScreen = { to: () => '/', name: '募集一覧' };

/**
 * 画面ごとの名前と親の画面（docs/11の5-1「戻るボタン」、2026-11-26）。上から順に照らし合わせる。
 * 画面を加えるときは、ここにも加える。
 */
export const SCREENS: readonly Screen[] = [
  // 下部の移動から直接開く5つの画面
  { path: '/', name: '募集一覧', parent: null },
  { path: '/activity', name: '申請と募集', parent: null },
  { path: '/conversations', name: '会話一覧', parent: null },
  { path: '/notifications', name: '通知', parent: null },
  { path: '/profile', name: 'プロフィール', parent: null },
  // そのほかの画面
  { path: '/events/new', name: '募集作成', parent: HOME },
  {
    path: '/events/:eventId/applicants',
    name: '申請者一覧',
    parent: { to: ({ eventId = '' }) => `/events/${eventId}`, name: '募集詳細' },
  },
  { path: '/events/:eventId', name: '募集詳細', parent: HOME },
  {
    path: '/conversations/:conversationId',
    name: '会話',
    parent: { to: () => '/conversations', name: '会話一覧' },
    mobileOnly: true,
  },
  {
    path: '/profile/edit',
    name: 'プロフィール編集',
    parent: { to: () => '/profile', name: 'プロフィール' },
  },
  { path: '/users/:userId', name: 'プロフィール', parent: HOME },
  { path: '/settings', name: '設定', parent: { to: () => '/profile', name: 'プロフィール' } },
  { path: '/login', name: 'ログイン', parent: HOME },
  { path: '/signup', name: '新規登録', parent: HOME },
  { path: '/signup/sent', name: 'メール認証', parent: { to: () => '/signup', name: '新規登録' } },
  { path: '/auth/confirm', name: 'メール認証', parent: HOME },
  {
    path: '/password-reset',
    name: 'パスワード再設定',
    parent: { to: () => '/login', name: 'ログイン' },
  },
  // メールのリンクから開くため、前の画面がない
  { path: '/password-reset/confirm', name: 'パスワード再設定', parent: HOME },
  {
    path: '/terms',
    name: '利用規約・プライバシーポリシー',
    parent: { to: () => '/signup', name: '新規登録' },
  },
];

/** パスに当たる画面。どれにも当たらない（ページがない）場合は、募集一覧を親にする。 */
export function findScreen(pathname: string) {
  for (const screen of SCREENS) {
    const match = matchPath(screen.path, pathname);
    if (match) return { screen, params: match.params };
  }
  return null;
}
