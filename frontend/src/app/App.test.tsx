import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { notConnectedAuthRepository } from '../features/auth/repository';
import { AuthRepositoryContext } from '../features/auth/repositoryContext';
import type { AuthRepository } from '../features/auth/types';
import { EventRepositoryContext } from '../features/events/repositoryContext';
import type { EventDetail, EventRepository } from '../features/events/types';
import { appRoutes } from './App';

const EVENT: EventDetail = {
  id: 'event-1',
  title: 'テスト用の募集',
  startsAt: '2026-12-05T04:00:00Z',
  endsAt: '2026-12-05T07:00:00Z',
  area: 'nakamura',
  targetLevels: ['beginner'],
  description: '説明の文章',
  belongings: null,
  capacity: 12,
  remaining: 3,
  fee: 500,
  hostNickname: 'そら',
  state: 'open',
  isHost: false,
  myApplication: null,
};

/** 未ログインのまま変わらない窓口。 */
const guestAuth: AuthRepository = {
  getViewer: () => Promise.resolve(null),
  onViewerChange: () => () => undefined,
  signIn: () => Promise.reject(new Error('使わない')),
  signUp: () => Promise.reject(new Error('使わない')),
  verifyEmail: () => Promise.reject(new Error('使わない')),
  signOut: () => Promise.resolve(),
};

function createRepository(overrides: Partial<EventRepository> = {}): EventRepository {
  return {
    listEvents: () => Promise.resolve({ items: [EVENT], nextCursor: null }),
    getEvent: (id) => Promise.resolve(id === EVENT.id ? EVENT : null),
    getLocation: () => Promise.resolve(null),
    createEvent: () => Promise.reject(new Error('使わない')),
    getMyEvents: () => Promise.resolve([]),
    ...overrides,
  };
}

function renderApp(path: string, repository = createRepository()) {
  render(
    <AuthRepositoryContext value={guestAuth}>
      <EventRepositoryContext value={repository}>
        <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />
      </EventRepositoryContext>
    </AuthRepositoryContext>,
  );
}

describe('募集一覧', () => {
  it('募集を表示し、選ぶと詳細へ移動する', async () => {
    const user = userEvent.setup();
    renderApp('/');

    const link = await screen.findByRole('link', { name: EVENT.title });
    const card = link.closest('article');
    if (!card) throw new Error('募集のカードがありません。');
    expect(within(card).getByText('受付中')).toBeInTheDocument();
    expect(within(card).getByText('残り3／12人')).toBeInTheDocument();

    await user.click(link);

    expect(await screen.findByRole('heading', { level: 1, name: EVENT.title })).toBeInTheDocument();
  });

  it('募集がない場合の案内を表示する', async () => {
    renderApp(
      '/',
      createRepository({ listEvents: () => Promise.resolve({ items: [], nextCursor: null }) }),
    );

    expect(await screen.findByText('募集はまだありません')).toBeInTheDocument();
  });

  it('失敗した場合は、やり直せる', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<EventRepository['listEvents']>()
      .mockRejectedValueOnce(new Error('失敗'))
      .mockResolvedValue({ items: [EVENT], nextCursor: null });
    renderApp('/', createRepository({ listEvents: list }));

    expect(await screen.findByRole('alert')).toHaveTextContent('募集を読み込めませんでした');
    await user.click(screen.getByRole('button', { name: 'もう一度読み込む' }));

    expect(await screen.findByRole('link', { name: EVENT.title })).toBeInTheDocument();
  });

  it('続きを読み込める', async () => {
    const user = userEvent.setup();
    const next = { ...EVENT, id: 'event-2', title: '続きの募集' };
    const list = vi
      .fn<EventRepository['listEvents']>()
      .mockResolvedValueOnce({ items: [EVENT], nextCursor: EVENT.id })
      .mockResolvedValueOnce({ items: [next], nextCursor: null });
    renderApp('/', createRepository({ listEvents: list }));

    await user.click(await screen.findByRole('button', { name: '続きを読み込む' }));

    expect(await screen.findByRole('link', { name: next.title })).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(EVENT.id);
    expect(screen.queryByRole('button', { name: '続きを読み込む' })).not.toBeInTheDocument();
  });
});

describe('募集詳細（未ログイン）', () => {
  it('公開する項目を、決めた順に表示する', async () => {
    renderApp('/events/event-1');

    expect(await screen.findByText('12月5日（土）13:00〜16:00')).toBeInTheDocument();
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      '開催日時',
      '開催エリア',
      '残り枠',
      '参加費',
      '対象レベル',
    ]);
  });

  it('住所は、承認された人だけに表示することを示す', async () => {
    renderApp('/events/event-1');

    expect(await screen.findByText('参加が承認された人だけに表示されます。')).toBeInTheDocument();
  });

  it('受付中は、ログインと新規登録へ移動できる。ログイン後の戻り先を付ける', async () => {
    renderApp('/events/event-1');

    const links = await screen.findAllByRole('link', { name: 'ログインして申請する' });
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/login?next=%2Fevents%2Fevent-1');
    }
  });

  it('主催者向けの住所と操作は出さない', async () => {
    const getLocation = vi.fn<EventRepository['getLocation']>();
    renderApp('/events/event-1', createRepository({ getLocation }));

    await screen.findByRole('heading', { level: 1, name: EVENT.title });
    expect(screen.queryByRole('link', { name: '申請者を見る' })).not.toBeInTheDocument();
    expect(getLocation).not.toHaveBeenCalled();
  });

  it.each([
    ['full', '満員のため、今は申請できません。'],
    ['closed', '受付は終了しました。'],
    ['ongoing', '開催中のため、申請できません。'],
  ] as const)('%s では申請の操作を出さず、理由を示す', async (state, reason) => {
    renderApp(
      '/events/event-1',
      createRepository({ getEvent: () => Promise.resolve({ ...EVENT, state }) }),
    );

    expect((await screen.findAllByText(reason)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'ログインして申請する' })).not.toBeInTheDocument();
  });

  it('見られない募集は、ページがない場合と同じ表示にする', async () => {
    renderApp('/events/unknown');

    expect(await screen.findByText('ページが見つかりません')).toBeInTheDocument();
  });
});

describe('ページがない場合', () => {
  it('知らないアドレスでは、ページがないことを示す', () => {
    renderApp('/unknown');

    expect(screen.getByText('ページが見つかりません')).toBeInTheDocument();
  });
});

describe('本番用のビルドの認証', () => {
  function renderWithoutAuth(path: string) {
    render(
      <AuthRepositoryContext value={notConnectedAuthRepository}>
        <EventRepositoryContext value={createRepository()}>
          <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />
        </EventRepositoryContext>
      </AuthRepositoryContext>,
    );
  }

  it('ログインは「接続していません」になる', async () => {
    const user = userEvent.setup();
    renderWithoutAuth('/login');

    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'abcdefghij');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '今はログインできません。認証の仕組みに接続していません。',
    );
  });

  it('メール認証のリンクも「接続していません」になる', async () => {
    renderWithoutAuth('/auth/confirm?token=dev-verify-success');

    expect(await screen.findByRole('alert')).toHaveTextContent('認証の仕組みに接続していません');
  });
});
