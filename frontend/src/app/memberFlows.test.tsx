import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createDevApplicationRepository } from '../dev/devApplicationRepository';
import { createDevAuthRepository } from '../dev/devAuthRepository';
import { createDevDatabase } from '../dev/devDatabase';
import { createDevEventRepository } from '../dev/devEventRepository';
import { createDevProfileRepository } from '../dev/devProfileRepository';
import { createDevSession } from '../dev/devSession';
import { ApplicationRepositoryContext } from '../features/applications/repositoryContext';
import { AuthRepositoryContext } from '../features/auth/repositoryContext';
import { EventRepositoryContext } from '../features/events/repositoryContext';
import type { EventRepository } from '../features/events/types';
import { ProfileRepositoryContext } from '../features/profiles/repositoryContext';
import { appRoutes } from './App';

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
        <ApplicationRepositoryContext value={createDevApplicationRepository({ db, session })}>
          <ProfileRepositoryContext value={createDevProfileRepository({ db, session })}>
            <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />
          </ProfileRepositoryContext>
        </ApplicationRepositoryContext>
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

/** 日本時間で、今日から数えた日の時刻を datetime-local の形で返す。 */
function jstLocal(daysFromNow: number, hour: number) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString().slice(0, 16);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/タイトル/), '日曜の練習会');
  fireEvent.change(screen.getByLabelText(/開始の日時/), { target: { value: jstLocal(7, 13) } });
  fireEvent.change(screen.getByLabelText(/終了の日時/), { target: { value: jstLocal(7, 16) } });
  await user.selectOptions(screen.getByLabelText(/開催エリア/), '中区');
  await user.click(screen.getByLabelText('初心者'));
  await user.type(screen.getByLabelText(/募集人数/), '8');
  await user.type(screen.getByLabelText(/参加費/), '300');
  await user.type(screen.getByLabelText(/くわしい住所/), 'ダミー住所Q（架空）');
  await user.type(screen.getByLabelText(/施設名/), 'ダミー体育館Q');
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
      await screen.findByRole('heading', { level: 1, name: '募集を作る' }),
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

describe('募集作成', () => {
  it('作成すると、募集詳細へ移り、主催者に住所を示す', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '公開する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '日曜の練習会' }),
    ).toBeInTheDocument();
    expect(screen.getByText('募集を公開しました。')).toBeInTheDocument();
    expect(await screen.findByText('ダミー住所Q（架空）')).toBeInTheDocument();
    expect(screen.getByText('ダミー体育館Q')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '申請者を見る' })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/events\/.+\/applicants$/) as string,
    );
  });

  it('誤りがあれば送らず、最初の誤りの項目へ移る', async () => {
    const user = userEvent.setup();
    const createEvent = vi.fn<EventRepository['createEvent']>();
    renderApp('/events/new', { userId: 'dev-user-a', events: { createEvent } });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    await user.click(screen.getByRole('button', { name: '公開する' }));

    const title = screen.getByLabelText(/タイトル/);
    expect(title).toHaveFocus();
    expect(title).toHaveAccessibleDescription(/入力してください。/);
    expect(screen.getByLabelText(/くわしい住所/)).toHaveAttribute('aria-invalid', 'true');
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('送信中は二重に押せない', async () => {
    const user = userEvent.setup();
    let finish: (value: Awaited<ReturnType<EventRepository['createEvent']>>) => void = () =>
      undefined;
    const createEvent = vi.fn<EventRepository['createEvent']>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderApp('/events/new', { userId: 'dev-user-a', events: { createEvent } });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);

    const submit = screen.getByRole('button', { name: '公開する' });
    await user.click(submit);
    await user.click(submit);

    expect(screen.getByRole('button', { name: '公開しています' })).toBeDisabled();
    expect(createEvent).toHaveBeenCalledTimes(1);
    act(() => {
      finish({ status: 'rejected', reason: 'rateLimited' });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('24時間に5件まで');
  });

  it('失敗しても、入力を残す', async () => {
    const user = userEvent.setup();
    const createEvent = vi
      .fn<EventRepository['createEvent']>()
      .mockRejectedValue(new Error('失敗'));
    renderApp('/events/new', { userId: 'dev-user-a', events: { createEvent } });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: '公開する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('公開できませんでした');
    expect(screen.getByLabelText(/タイトル/)).toHaveValue('日曜の練習会');
    expect(screen.getByLabelText(/くわしい住所/)).toHaveValue('ダミー住所Q（架空）');
    expect(screen.getByRole('button', { name: '公開する' })).toBeEnabled();
  });

  it('入力中にやめるときは確認する', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await user.type(screen.getByLabelText(/タイトル/), '途中');

    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(
      screen.getByText('入力した内容は保存されません。入力をやめますか？'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '入力を続ける' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '入力を続ける' }));
    expect(screen.getByLabelText(/タイトル/)).toHaveValue('途中');

    await user.click(screen.getByRole('button', { name: 'やめる' }));
    await user.click(screen.getByRole('button', { name: '入力をやめる' }));
    expect(await screen.findByText('これからの募集')).toBeInTheDocument();
  });

  it('入力中に下部の移動を押したときも確認し、続けるなら入力を残す', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await user.type(screen.getByLabelText(/タイトル/), '途中');
    const homeLink = () => {
      const [nav] = screen.getAllByRole('navigation', { name: '主な移動' });
      if (!nav) throw new Error('移動がありません。');
      return within(nav).getByRole('link', { name: 'ホーム' });
    };

    await user.click(homeLink());
    expect(
      screen.getByText('入力した内容は保存されません。入力をやめますか？'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '入力を続ける' }));
    expect(screen.getByRole('heading', { level: 1, name: '募集を作る' })).toBeInTheDocument();
    expect(screen.getByLabelText(/タイトル/)).toHaveValue('途中');

    await user.click(homeLink());
    await user.click(screen.getByRole('button', { name: '入力をやめる' }));
    expect(await screen.findByText('これからの募集')).toBeInTheDocument();
  });

  it('何も入力していなければ、確認せずに移る', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    const [nav] = screen.getAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    await user.click(within(nav).getByRole('link', { name: '会話' }));

    expect(screen.getByRole('heading', { level: 1, name: '会話は準備中です' })).toBeInTheDocument();
  });

  it('深夜にかかる場合は注意を示す', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    fireEvent.change(screen.getByLabelText(/開始の日時/), { target: { value: jstLocal(7, 21) } });
    fireEvent.change(screen.getByLabelText(/終了の日時/), {
      target: { value: jstLocal(8, 1) },
    });

    expect(screen.getByText(/深夜（午後11時〜翌午前6時）にかかります。/)).toBeInTheDocument();
  });

  it('公開する項目と、承認された人だけの項目を分けて示す', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });

    const publicSection = await screen.findByRole('region', { name: '全員に公開する項目' });
    const privateSection = screen.getByRole('region', { name: '承認された人だけに見せる項目' });
    expect(within(publicSection).queryByLabelText(/くわしい住所/)).not.toBeInTheDocument();
    expect(within(privateSection).getByLabelText(/くわしい住所/)).toBeInTheDocument();
  });

  it('18歳未満の人には、フォームを出さずに案内する', async () => {
    renderApp('/events/new', { userId: 'dev-user-minor' });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '18歳未満の方は、募集を作成できません',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '公開する' })).not.toBeInTheDocument();
  });

  it('プロフィール未登録の人には、登録を案内する', async () => {
    renderApp('/events/new', { userId: 'dev-user-no-profile' });

    expect(await screen.findByRole('link', { name: 'プロフィールを登録する' })).toHaveAttribute(
      'href',
      '/profile/edit?next=%2Fevents%2Fnew',
    );
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

/** 画面の幅ごとに同じ操作が2か所にあるため、最初のものを使う。 */
async function findFirstButton(name: string | RegExp) {
  const [button] = await screen.findAllByRole('button', { name });
  if (!button) throw new Error(`${String(name)} がありません。`);
  return button;
}

describe('募集詳細（申請者）', () => {
  it('未申請 → 申請すると、承認待ちになる', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}`, { userId: 'dev-user-a' });

    await user.click(await findFirstButton('参加を申請する'));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      '参加を申請しました。',
    );
    expect((await screen.findAllByText('承認待ち')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
    expect(screen.queryByText('ダミー住所A（架空）')).not.toBeInTheDocument();
  });

  it('承認済みなら、くわしい住所を示す', async () => {
    renderApp('/events/dev-family-morning', { userId: 'dev-user-a' });

    expect(await screen.findByText('ダミー住所E（架空）')).toBeInTheDocument();
    expect(screen.getAllByText('承認済み').length).toBeGreaterThan(0);
  });

  it('却下なら、その旨を示し、申請できない', async () => {
    renderApp('/events/dev-spike-practice', { userId: 'dev-user-a' });

    expect(
      (await screen.findAllByText('この募集への申請は却下されました。')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
  });

  it.each([
    ['満員', 'dev-easy-morning', '満員のため、今は申請できません。'],
    ['受付終了', 'dev-spike-practice', '受付は終了しました。'],
  ])('%sの募集では、申請できない案内を示す', async (_, eventId, message) => {
    // 却下の記録がない利用者にする
    renderApp(`/events/${eventId}`, { userId: 'dev-user-minor' });

    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
  });

  it('開催中の承認済みは、終了日時まで住所を示す', async () => {
    renderApp('/events/dev-ongoing', { userId: 'dev-user-a' });

    expect(await screen.findByText('ダミー住所F（架空）')).toBeInTheDocument();
  });

  it('主催者には、申請のボタンを出さない', async () => {
    renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    expect((await screen.findAllByRole('link', { name: '申請者を見る' })).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
  });

  it('プロフィール未登録の人には、登録を案内する', async () => {
    renderApp(`/events/${HOSTED_EVENT}`, { userId: 'dev-user-no-profile' });

    const [link] = await screen.findAllByRole('link', { name: 'プロフィールを登録する' });
    expect(link).toHaveAttribute('href', `/profile/edit?next=%2Fevents%2F${HOSTED_EVENT}`);
  });
});

describe('申請者一覧', () => {
  it('承認すると承認済みに移り、定員の数が変わる', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    const summary = await screen.findByRole('region', { name: '定員と承認済みの数' });
    expect(summary).toHaveTextContent('承認済み 9人');
    await user.click(screen.getByRole('button', { name: 'こはるさんを承認する' }));

    expect(await screen.findByRole('status')).toHaveTextContent('こはるさんの参加を承認しました。');
    expect(summary).toHaveTextContent('承認済み 10人');
    expect(screen.queryByRole('button', { name: 'こはるさんを承認する' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    expect(screen.getByRole('link', { name: 'こはる' })).toHaveAttribute(
      'href',
      '/users/dev-user-minor',
    );
  });

  it('却下は確認してから行う', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await user.click(await screen.findByRole('button', { name: 'こはるさんの申請を却下する' }));
    const confirm = screen.getByRole('group', { name: 'こはるさんの申請の却下の確認' });
    await user.click(within(confirm).getByRole('button', { name: 'やめる' }));
    expect(screen.getByRole('button', { name: 'こはるさんを承認する' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'こはるさんの申請を却下する' }));
    await user.click(
      within(screen.getByRole('group', { name: 'こはるさんの申請の却下の確認' })).getByRole(
        'button',
        { name: '却下する' },
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('こはるさんの申請を却下しました。');
  });

  it('満員の募集では、承認待ちを残したまま承認できない', async () => {
    renderApp('/events/dev-b-full/applicants', { userId: HOST });

    expect(await screen.findByText(/定員に達したため、今は承認できません/)).toBeInTheDocument();
    const approveButtons = screen.getAllByRole('button', { name: /を承認する$/ });
    expect(approveButtons).toHaveLength(2);
    for (const button of approveButtons) expect(button).toBeDisabled();
  });

  it('他人の募集の申請者一覧は見られない', async () => {
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: 'dev-user-a' });

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請者一覧を表示できません' }),
    ).toBeInTheDocument();
    expect(screen.getByText('申請者一覧は、募集の主催者だけが見られます。')).toBeInTheDocument();
    expect(screen.queryByText('こはる')).not.toBeInTheDocument();
  });

  it('非表示の募集の申請者一覧は、主催者にも見せない', async () => {
    renderApp('/events/dev-b-hidden/applicants', { userId: HOST });

    expect(
      await screen.findByText('この募集は非表示になったため、申請者一覧を表示できません。'),
    ).toBeInTheDocument();
  });
});
