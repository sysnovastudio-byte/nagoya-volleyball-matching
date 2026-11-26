import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createDevAuthRepository } from '../dev/devAuthRepository';
import { createDevDatabase } from '../dev/devDatabase';
import { createDevEventRepository } from '../dev/devEventRepository';
import { createDevSession } from '../dev/devSession';
import { AuthRepositoryContext } from '../features/auth/repositoryContext';
import { EventRepositoryContext } from '../features/events/repositoryContext';
import type { EventRepository } from '../features/events/types';
import { App } from './App';

const HOST = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';

/** 開発用の窓口を、テストごとの新しいデータとログイン状態でつなぐ。 */
function renderApp(
  path: string,
  { userId = null, events }: { userId?: string | null; events?: Partial<EventRepository> } = {},
) {
  const db = createDevDatabase(new Date());
  const session = createDevSession(userId);
  const eventRepository = { ...createDevEventRepository({ db, session }), ...events };
  render(
    <AuthRepositoryContext value={createDevAuthRepository({ db, session })}>
      <EventRepositoryContext value={eventRepository}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </EventRepositoryContext>
    </AuthRepositoryContext>,
  );
  const switchUser = (next: string | null) => {
    act(() => {
      session.setUserId(next);
    });
  };
  return { db, switchUser };
}

describe('ログイン後の移動', () => {
  it('5つの移動先を示す', async () => {
    renderApp('/', { userId: 'dev-user-a' });

    const [nav] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['ホーム', '申請と募集', '会話', '通知', 'プロフィール']);
    expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument();
  });

  it('まだない画面は、仮の画面を示す', async () => {
    const user = userEvent.setup();
    renderApp('/', { userId: 'dev-user-a' });

    const [nav] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    await user.click(within(nav).getByRole('link', { name: '会話' }));

    expect(screen.getByRole('heading', { level: 1, name: '会話は準備中です' })).toBeInTheDocument();
  });
});

describe('要ログインの画面', () => {
  it('未ログインならログイン画面へ移り、ログインすると元の画面に戻る', async () => {
    const { switchUser } = renderApp('/events/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ログインは準備中です' }),
    ).toBeInTheDocument();

    switchUser('dev-user-a');

    expect(
      await screen.findByRole('heading', { level: 1, name: '募集作成は準備中です' }),
    ).toBeInTheDocument();
  });

  it('ログアウトすると、ホームに戻り未ログインの表示になる', async () => {
    const user = userEvent.setup();
    renderApp('/settings', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByRole('link', { name: 'ログイン' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'バレーしたい人、集まれ！' }),
    ).toBeInTheDocument();
  });
});

describe('募集一覧の「募集を作る」', () => {
  it('ログインした18歳以上の人に示す', async () => {
    renderApp('/', { userId: 'dev-user-a' });

    expect((await screen.findAllByRole('link', { name: '募集を作る' }))[0]).toHaveAttribute(
      'href',
      '/events/new',
    );
  });

  it('未ログインには示さない', async () => {
    renderApp('/');

    await screen.findByRole('link', { name: 'ログイン' });
    expect(screen.queryByRole('link', { name: '募集を作る' })).not.toBeInTheDocument();
  });

  it('18歳未満の人には、作れないことを案内する', async () => {
    renderApp('/', { userId: 'dev-user-minor' });

    expect(await screen.findByText(/18歳未満の方は、募集を作成できません/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '募集を作る' })).not.toBeInTheDocument();
  });
});

describe('募集詳細（主催者）', () => {
  it('住所・施設名・集合場所と、「申請者を見る」を示す', async () => {
    renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    expect(await screen.findByText('ダミー住所A（架空）')).toBeInTheDocument();
    expect(screen.getByText('ダミー体育館A')).toBeInTheDocument();
    expect(screen.getByText(/ダミーの集合場所/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '申請者を見る' })[0]).toHaveAttribute(
      'href',
      `/events/${HOSTED_EVENT}/applicants`,
    );
  });

  it('利用者を切り替えると、住所を隠す', async () => {
    const { switchUser } = renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });
    await screen.findByText('ダミー住所A（架空）');

    switchUser('dev-user-a');

    expect(await screen.findByText('参加が承認された人だけに表示されます。')).toBeInTheDocument();
    expect(screen.queryByText('ダミー住所A（架空）')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '申請者を見る' })).not.toBeInTheDocument();
  });
});

describe('設定', () => {
  it('未ログインで開くと、ログイン画面へ移る', async () => {
    const { switchUser } = renderApp('/settings');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ログインは準備中です' }),
    ).toBeInTheDocument();
    switchUser('dev-user-a');
    expect(await screen.findByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });
});
