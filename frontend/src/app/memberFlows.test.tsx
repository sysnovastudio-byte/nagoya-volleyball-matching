import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createDevApplicationRepository } from '../dev/devApplicationRepository';
import { createDevConversationRepository } from '../dev/devConversationRepository';
import { createDevAuthRepository } from '../dev/devAuthRepository';
import { createDevDatabase } from '../dev/devDatabase';
import { createDevEventRepository } from '../dev/devEventRepository';
import { createDevProfileRepository } from '../dev/devProfileRepository';
import { createDevSession } from '../dev/devSession';
import { ApplicationRepositoryContext } from '../features/applications/repositoryContext';
import { AuthRepositoryContext } from '../features/auth/repositoryContext';
import { ConversationRepositoryContext } from '../features/conversations/repositoryContext';
import type { ConversationRepository } from '../features/conversations/types';
import { EventRepositoryContext } from '../features/events/repositoryContext';
import type { EventRepository } from '../features/events/types';
import { ProfileRepositoryContext } from '../features/profiles/repositoryContext';
import { appRoutes } from './App';

const HOST = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';

/** 開発用の窓口を、テストごとの新しいデータとログイン状態でつなぐ。 */
function renderApp(
  path: string,
  {
    userId = null,
    events,
    conversations,
  }: {
    userId?: string | null;
    events?: Partial<EventRepository>;
    conversations?: Partial<ConversationRepository>;
  } = {},
) {
  const db = createDevDatabase(new Date());
  const session = createDevSession(userId);
  const eventRepository = { ...createDevEventRepository({ db, session }), ...events };
  const conversationRepository = {
    ...createDevConversationRepository({ db, session }),
    ...conversations,
  };
  render(
    <AuthRepositoryContext value={createDevAuthRepository({ db, session })}>
      <EventRepositoryContext value={eventRepository}>
        <ApplicationRepositoryContext value={createDevApplicationRepository({ db, session })}>
          <ProfileRepositoryContext value={createDevProfileRepository({ db, session })}>
            <ConversationRepositoryContext value={conversationRepository}>
              <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />
            </ConversationRepositoryContext>
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
  return { db, session, switchUser };
}

/** 自動的に消える通知（aria-live の「お知らせ」）。中身が入るまで待つ。 */
async function findToast() {
  const region = screen.getByRole('status', { name: 'お知らせ' });
  await waitFor(() => {
    expect(region).not.toBeEmptyDOMElement();
  });
  return region;
}

/** 日本時間で、今日から数えた日を「YYYY-MM-DD」の形で返す。 */
function jstDate(daysFromNow: number) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function fillSchedule(
  user: ReturnType<typeof userEvent.setup>,
  daysFromNow: number,
  start: string,
  end: string,
) {
  fireEvent.change(screen.getByLabelText('日付'), { target: { value: jstDate(daysFromNow) } });
  await user.selectOptions(screen.getByLabelText('開始時刻'), start);
  await user.selectOptions(screen.getByLabelText(/終了時刻/), end);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/タイトル/), '日曜の練習会');
  await fillSchedule(user, 7, '13:00', '16:00');
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
    await user.click(within(nav).getByRole('link', { name: '通知' }));

    expect(screen.getByRole('heading', { level: 1, name: '通知は準備中です' })).toBeInTheDocument();
  });
});

describe('要ログインの画面', () => {
  it('未ログインならログイン画面へ移り、ログインすると元の画面に戻る', async () => {
    const { switchUser } = renderApp('/events/new');

    expect(await screen.findByRole('heading', { level: 1, name: 'ログイン' })).toBeInTheDocument();

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
    // 上部の表示が先に変わり、ホームへの移動はその後に起きるため、見出しも待つ
    expect(
      await screen.findByRole('heading', { level: 1, name: 'バレーしたい人、集まれ！' }),
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
    expect(await findToast()).toHaveTextContent('募集を公開しました。');
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
    await user.click(within(nav).getByRole('link', { name: '通知' }));

    expect(screen.getByRole('heading', { level: 1, name: '通知は準備中です' })).toBeInTheDocument();
  });

  it('終了が開始より前なら翌日として扱い、深夜にかかる注意を示す', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    await fillSchedule(user, 7, '21:00', '01:00');

    expect(screen.getByText('翌日')).toBeInTheDocument();
    expect(screen.getByLabelText(/終了時刻/)).toHaveAccessibleDescription(
      '終了時刻が開始より前のため、翌日の01:00に終わります。',
    );
    expect(screen.getByText(/深夜（午後11時〜翌午前6時）にかかります。/)).toBeInTheDocument();
  });

  it('タイトルに入力例を示し、時刻は15分刻みで選ぶ', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });

    expect(await screen.findByLabelText(/タイトル/)).toHaveAttribute(
      'placeholder',
      '例：初心者歓迎！土曜午後の練習',
    );
    const options = within(screen.getByLabelText('開始時刻')).getAllByRole('option');
    expect(options.slice(1, 4).map((option) => option.textContent)).toEqual([
      '00:00',
      '00:15',
      '00:30',
    ]);
    expect(options).toHaveLength(97);
  });

  it('説明書きは、残すと決めたものだけ', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });

    expect(await screen.findByText('アプリの中では支払えません。')).toBeInTheDocument();
    expect(screen.getByText('住所や連絡先は書かないでください。')).toBeInTheDocument();
    expect(screen.queryByText('募集を作る前に')).not.toBeInTheDocument();
    // 18歳未満が参加し得ることは、深夜にかからなくても常に示す（docs/11の7-1）
    expect(screen.getByText('18歳未満の人も申請できます。')).toBeInTheDocument();
    expect(screen.queryByText(/名古屋市の16区から選びます/)).not.toBeInTheDocument();
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

  it('プロフィール未登録の人は、入力画面へ移り、保存すると募集作成に戻る', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-no-profile' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'プロフィールを登録' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/ニックネーム/), 'ななみ');
    await user.click(screen.getByLabelText('初心者'));
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '募集を作る' }),
    ).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { level: 1, name: 'ログイン' })).toBeInTheDocument();
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

    expect(await findToast()).toHaveTextContent('参加を申請しました。');
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

  it('受付終了の募集では、申請できない案内を示す', async () => {
    // 却下の記録がない利用者にする
    renderApp('/events/dev-spike-practice', { userId: 'dev-user-minor' });

    expect((await screen.findAllByText('受付は終了しました。')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
  });

  it('満員の募集でも、主催者が判断することを添えて申請できる', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-easy-morning', { userId: 'dev-user-minor' });

    expect(
      (await screen.findAllByText('満員です。申請すると主催者が判断します。')).length,
    ).toBeGreaterThan(0);
    const [button] = screen.getAllByRole('button', { name: '参加を申請する' });
    if (!button) throw new Error('申請のボタンがありません。');
    await user.click(button);

    expect(await findToast()).toHaveTextContent('申請しました');
    expect((await screen.findAllByText('承認待ち')).length).toBeGreaterThan(0);
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

    expect(await findToast()).toHaveTextContent('こはるさんの参加を承認しました。');
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
    expect(await findToast()).toHaveTextContent('こはるさんの申請を却下しました。');
  });

  it('満員の募集では、定員を増やすことを確かめてから承認する', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-b-full/applicants', { userId: HOST });

    expect(
      await screen.findByText('定員に達しています。承認すると、定員を1人増やします。'),
    ).toBeInTheDocument();
    const [first] = screen.getAllByRole('button', { name: /を承認する$/ });
    await user.click(first as HTMLElement);

    const confirm = screen.getByRole('group', { name: /の承認の確認$/ });
    expect(confirm).toHaveTextContent('定員を7人に増やして承認します。');
    await user.click(within(confirm).getByRole('button', { name: '定員を7人にして承認する' }));

    expect(await findToast()).toHaveTextContent(
      /定員を7人に増やして、.+さんの参加を承認しました。/,
    );
    expect(await screen.findByText(/定員7人/)).toBeInTheDocument();
  });

  it('定員を増やす確認は、やめると承認しない', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/events/dev-b-full/applicants', { userId: HOST });

    const [first] = await screen.findAllByRole('button', { name: /を承認する$/ });
    await user.click(first as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(db.events.find((event) => event.id === 'dev-b-full')?.capacity).toBe(6);
    expect(screen.getAllByRole('button', { name: /を承認する$/ })).toHaveLength(2);
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

describe('申請と募集', () => {
  it('自分の申請の状態を示し、非表示の募集は開催日時だけを示す', async () => {
    renderApp('/activity', { userId: 'dev-user-a' });

    const section = await screen.findByRole('region', { name: '参加する側' });
    const link = await within(section).findByRole('link', { name: '平日夜にしっかり動く会' });
    expect(link.closest('li')).toHaveTextContent('承認待ち');
    expect(
      within(section).getByRole('link', { name: '家族や友人と楽しむ午前バレー' }).closest('li'),
    ).toHaveTextContent('承認済み');
    expect(
      within(section).getByRole('link', { name: 'スパイク練習会' }).closest('li'),
    ).toHaveTextContent('却下');
    const hidden = within(section).getByText('非表示になった募集').closest('li');
    expect(hidden).not.toHaveTextContent('非表示の会');
    expect(hidden).not.toHaveTextContent('承認済み');
    expect(within(section).getByRole('heading', { name: '終わった募集' })).toBeInTheDocument();
  });

  it('主催した募集と人数を示し、申請者一覧へ移れる', async () => {
    renderApp('/activity', { userId: HOST });

    const section = await screen.findByRole('region', { name: '主催する側' });
    const item = (
      await within(section).findByRole('link', { name: '木曜夜のミニゲーム会' })
    ).closest('li');
    if (!item) throw new Error('募集がありません。');
    expect(item).toHaveTextContent('承認済み 6／6人・承認待ち 2人');
    expect(within(item).getByRole('link', { name: '申請者を見る' })).toHaveAttribute(
      'href',
      '/events/dev-b-full/applicants',
    );
    expect(within(section).getByText('非表示になった募集')).toBeInTheDocument();
    expect(within(section).queryByText('非表示になった会（主催）')).not.toBeInTheDocument();
  });
});

describe('プロフィール', () => {
  it('自分のプロフィールを示す', async () => {
    renderApp('/profile', { userId: 'dev-user-a' });

    expect(await screen.findByRole('heading', { level: 1, name: 'あおい' })).toBeInTheDocument();
    expect(screen.getByText('初心者')).toBeInTheDocument();
    expect(screen.getByText(/名古屋に引っ越してきて/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'プロフィールを編集' })).toBeInTheDocument();
  });

  it('ほかの人のプロフィールには、編集を出さない', async () => {
    renderApp('/users/dev-user-b', { userId: 'dev-user-a' });

    expect(await screen.findByRole('heading', { level: 1, name: 'そら' })).toBeInTheDocument();
    expect(screen.getByText('経験者')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).not.toBeInTheDocument();
  });

  it('プロフィール未登録なら、登録を案内する', async () => {
    renderApp('/profile', { userId: 'dev-user-no-profile' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'プロフィールが登録されていません' }),
    ).toBeInTheDocument();
  });
});

/** 1024px以上の画面として扱う。 */
function asPc() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(min-width: 1024px)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

describe('申請者一覧（PC）', () => {
  it('1024px以上では、申請者を表で示し、表の中で承認できる', async () => {
    asPc();
    try {
      const user = userEvent.setup();
      renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

      const table = await screen.findByRole('table', { name: '申請者' });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual(['ニックネーム', '経験レベル', '年代', '自己紹介', '申請日時', '状態', '操作']);
      const row = within(table).getByRole('row', { name: /こはる/ });
      expect(row).toHaveTextContent('未経験者');
      expect(row).toHaveTextContent('10代');
      expect(row).toHaveTextContent('承認待ち');
      // カードと二重に置かない
      expect(screen.getAllByRole('button', { name: 'こはるさんを承認する' })).toHaveLength(1);

      await user.click(within(row).getByRole('button', { name: 'こはるさんを承認する' }));
      expect(await findToast()).toHaveTextContent('こはるさんの参加を承認しました。');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('スマートフォンでは、表を使わない', async () => {
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    expect(await screen.findByRole('button', { name: 'こはるさんを承認する' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('ログイン（SCR-001）', () => {
  it('ダミーの利用者でログインすることを示し、送信すると元の画面に戻る', async () => {
    const user = userEvent.setup();
    renderApp('/login?next=%2Factivity');

    expect(await screen.findByText(/ダミーの利用者でログインします/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請と募集' }),
    ).toBeInTheDocument();
  });

  it('入力の形式が違う場合は、送らずに項目の近くに示す', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/login');

    await user.type(await screen.findByLabelText(/メールアドレス/), 'test');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(screen.getByText('メールアドレスの形式で入力してください。')).toBeInTheDocument();
    expect(screen.getByText('パスワードを入力してください。')).toBeInTheDocument();
    expect(session.getUserId()).toBeNull();
  });

  it('外部のサイトへの戻り先は受け付けず、ホームに戻る', async () => {
    const user = userEvent.setup();
    renderApp('/login?next=https%3A%2F%2Fexample.com%2F');

    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'バレーしたい人、集まれ！' }),
    ).toBeInTheDocument();
  });

  it('パスワード再設定は、準備中と示すだけ', async () => {
    renderApp('/login');

    expect(
      await screen.findByText('パスワードを忘れた場合の再設定は、準備中です。'),
    ).toBeInTheDocument();
    // 上部の帯とログイン画面の両方にある
    for (const link of screen.getAllByRole('link', { name: '新規登録' })) {
      expect(link).toHaveAttribute('href', '/signup');
    }
  });
});

describe('新規登録（SCR-002）とメール認証（SCR-003）', () => {
  async function fillSignUp(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'abcdefghij');
    await user.click(screen.getByLabelText('18歳以上'));
    await user.click(screen.getByLabelText('利用規約とプライバシーポリシーに同意する'));
    await user.click(screen.getByLabelText('通報時のメッセージ確認に同意する'));
  }

  it('同意の欄は2つが別々で、最初はすべて未選択', async () => {
    renderApp('/signup');

    const boxes = [
      await screen.findByLabelText('利用規約とプライバシーポリシーに同意する'),
      screen.getByLabelText('通報時のメッセージ確認に同意する'),
    ];
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByLabelText('18歳以上')).not.toBeChecked();
    expect(screen.getByLabelText('18歳未満（保護者の同意あり）')).not.toBeChecked();
    expect(screen.getByText(/版：\s*仮-0/)).toBeInTheDocument();
  });

  it('18歳未満を選ぶと、保護者の同意の確認を出し、未選択なら登録しない', async () => {
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignUp(user);

    await user.click(screen.getByLabelText('18歳未満（保護者の同意あり）'));
    const consent = screen.getByLabelText('保護者が規約等を確かめ、利用に同意しています');
    expect(consent).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(screen.getByText('18歳未満の方は、保護者の同意が必要です。')).toBeInTheDocument();
    expect(consent).toHaveFocus();
  });

  it('同意しないと登録しない', async () => {
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignUp(user);
    await user.click(screen.getByLabelText('通報時のメッセージ確認に同意する'));

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(screen.getByText('通報時のメッセージ確認への同意が必要です。')).toBeInTheDocument();
    expect(
      screen.queryByText('利用規約とプライバシーポリシーへの同意が必要です。'),
    ).not.toBeInTheDocument();
  });

  it('登録 → 認証 → プロフィール入力へ進む', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/signup');
    await fillSignUp(user);

    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '認証メールを送りました' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/リンクの有効期限は、送ってから1時間です/)).toBeInTheDocument();
    expect(session.getUserId()).toBeNull();

    await user.click(screen.getByRole('link', { name: '認証に成功するリンク' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'メールアドレスを確認しました' }),
    ).toBeInTheDocument();
    expect(session.getUserId()).toBe('dev-registered-1');
    expect(screen.getByRole('link', { name: 'プロフィールを入力する' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
  });

  it.each([
    ['dev-verify-expired', 'リンクの有効期限が切れています'],
    ['dev-verify-invalid', 'このリンクは使えません'],
    ['', 'このリンクは使えません'],
  ])('認証のリンク（%s）の案内', async (token, heading) => {
    renderApp(`/auth/confirm?token=${token}`);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});

describe('プロフィール登録・編集（SCR-014）', () => {
  it('ログインした後、プロフィールが未登録なら入力画面へ移り、保存すると元の画面に戻る', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp('/login?next=%2Factivity');
    await screen.findByRole('heading', { level: 1, name: 'ログイン' });

    // 開発用の帯で、プロフィール未登録の利用者としてログインする
    switchUser('dev-user-no-profile');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'プロフィールを登録' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'あとで入力する' })).toHaveAttribute(
      'href',
      '/activity',
    );

    await user.type(screen.getByLabelText(/ニックネーム/), '  ななみ  ');
    await user.click(screen.getByLabelText('経験者'));
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請と募集' }),
    ).toBeInTheDocument();
  });

  it('登録 → 認証 → プロフィール入力 → ホームまで通せる', async () => {
    const user = userEvent.setup();
    renderApp('/signup');
    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'abcdefghij');
    await user.click(screen.getByLabelText('18歳以上'));
    await user.click(screen.getByLabelText('利用規約とプライバシーポリシーに同意する'));
    await user.click(screen.getByLabelText('通報時のメッセージ確認に同意する'));
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await user.click(await screen.findByRole('link', { name: '認証に成功するリンク' }));
    await user.click(await screen.findByRole('link', { name: 'プロフィールを入力する' }));

    await user.type(await screen.findByLabelText(/ニックネーム/), 'ななみ');
    await user.click(screen.getByLabelText('未経験者'));
    await user.type(screen.getByLabelText(/自己紹介/), 'よろしくお願いします。');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'バレーしたい人、集まれ！' }),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'プロフィール' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'ななみ' })).toBeInTheDocument();
    expect(screen.getByText('よろしくお願いします。')).toBeInTheDocument();
  });

  it('入力の誤りを、項目の近くに示す', async () => {
    const user = userEvent.setup();
    renderApp('/profile/edit', { userId: 'dev-user-no-profile' });

    await user.type(await screen.findByLabelText(/ニックネーム/), '   ');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(screen.getByText('ニックネームを入力してください。')).toBeInTheDocument();
    expect(screen.getByText('経験レベルを選んでください。')).toBeInTheDocument();
    expect(screen.getByLabelText(/ニックネーム/)).toHaveFocus();
  });

  it('項目ごとに公開範囲を示す', async () => {
    renderApp('/profile/edit', { userId: 'dev-user-a' });

    await screen.findByRole('heading', { level: 1, name: 'プロフィールを編集' });
    expect(screen.getAllByText('ログインした人に公開')).toHaveLength(3);
  });

  it('SCR-013 の「編集」から移り、今の内容を入れて始め、保存するとプロフィールに戻る', async () => {
    const user = userEvent.setup();
    renderApp('/profile', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: 'プロフィールを編集' }));
    const nickname = await screen.findByLabelText(/ニックネーム/);
    expect(nickname).toHaveValue('あおい');
    expect(screen.getByLabelText('初心者')).toBeChecked();
    await user.clear(nickname);
    await user.type(nickname, 'あおい2');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(await findToast()).toHaveTextContent('プロフィールを保存しました。');
    expect(screen.getByRole('heading', { level: 1, name: 'あおい2' })).toBeInTheDocument();
  });
});

describe('サイクル1の流れ', () => {
  it('作成 → 探す → 詳細 → 申請 → 承認 → 住所 を通せる', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp('/events/new', { userId: HOST });

    // 作成（利用者B）
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '公開する' }));
    expect(await findToast()).toHaveTextContent('募集を公開しました。');

    // 探す → 詳細 → 申請（利用者A）
    switchUser('dev-user-a');
    const [home] = screen.getAllByRole('link', { name: 'ホーム' });
    if (!home) throw new Error('ホームへの移動がありません。');
    await user.click(home);
    await user.click(await screen.findByRole('link', { name: /日曜の練習会/ }));
    await user.click(
      (await screen.findAllByRole('button', { name: '参加を申請する' }))[0] as HTMLElement,
    );
    expect(await screen.findByText('参加を申請しました。')).toBeInTheDocument();
    expect(screen.queryByText('ダミー住所Q（架空）')).not.toBeInTheDocument();

    // 承認（利用者B）
    switchUser(HOST);
    await user.click(
      (await screen.findAllByRole('link', { name: '申請者を見る' }))[0] as HTMLElement,
    );
    await user.click(await screen.findByRole('button', { name: 'あおいさんを承認する' }));
    expect(await screen.findByText('あおいさんの参加を承認しました。')).toBeInTheDocument();

    // 住所（利用者A）
    switchUser('dev-user-a');
    // 利用者Aには申請者一覧を見せない。そこから募集詳細へ移る
    await screen.findByRole('heading', { level: 1, name: '申請者一覧を表示できません' });
    await user.click(screen.getByRole('link', { name: '募集詳細へ' }));
    expect(await screen.findByText('ダミー住所Q（架空）')).toBeInTheDocument();
  });
});

describe('指摘の不具合', () => {
  it('1. 新規登録をやり直しても、18歳以上なら募集を作成できる', async () => {
    const user = userEvent.setup();
    const { db, session } = renderApp('/signup');
    // 先に18歳未満の利用者が登録・認証を済ませている
    db.users.push({ id: 'dev-registered-1', ageCategory: 'minor', profile: null });

    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'abcdefghij');
    await user.click(screen.getByLabelText('18歳以上'));
    await user.click(screen.getByLabelText('利用規約とプライバシーポリシーに同意する'));
    await user.click(screen.getByLabelText('通報時のメッセージ確認に同意する'));
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await user.click(await screen.findByRole('link', { name: '認証に成功するリンク' }));
    expect(session.getUserId()).toBe('dev-registered-2');
    await user.click(await screen.findByRole('link', { name: 'プロフィールを入力する' }));
    await user.type(await screen.findByLabelText(/ニックネーム/), 'ななみ');
    await user.click(screen.getByLabelText('未経験者'));
    await user.click(screen.getByRole('button', { name: '保存する' }));

    await user.click(
      (await screen.findAllByRole('link', { name: '募集を作る' }))[0] as HTMLElement,
    );
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '公開する' }));

    expect(await findToast()).toHaveTextContent('募集を公開しました。');
  });

  it('2. 申請と募集から開いた募集詳細は、申請と募集に戻る', async () => {
    const user = userEvent.setup();
    renderApp('/activity', { userId: HOST });

    const section = await screen.findByRole('region', { name: '主催する側' });
    await user.click(await within(section).findByRole('link', { name: '木曜夜のミニゲーム会' }));
    await user.click(await screen.findByRole('link', { name: '申請と募集へ' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請と募集' }),
    ).toBeInTheDocument();
  });

  it('2. 募集一覧から開いた募集詳細は、募集一覧に戻る', async () => {
    renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    expect(await screen.findByRole('link', { name: '募集一覧へ' })).toHaveAttribute('href', '/');
  });

  it('3. 申請者一覧から開いたプロフィールに、申請者一覧へ戻るボタンがある', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await user.click(await screen.findByRole('link', { name: 'こはる' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'こはる' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '申請者一覧へ' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請者一覧' }),
    ).toBeInTheDocument();
  });
});

describe('年代（M-01 のうち年代だけ）', () => {
  it('主催者は、申請者一覧で承認待ち・承認済みの人の年代を見られる', async () => {
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    const card = (await screen.findByRole('link', { name: 'こはる' })).closest('li');
    expect(card).toHaveTextContent('年代10代');
  });

  it('ほかの人のプロフィールには、年代を出さない', async () => {
    renderApp('/users/dev-user-a', { userId: HOST });

    expect(await screen.findByRole('heading', { level: 1, name: 'あおい' })).toBeInTheDocument();
    expect(screen.queryByText('年代')).not.toBeInTheDocument();
    expect(screen.queryByText('20代')).not.toBeInTheDocument();
  });

  it('本人のプロフィールには、公開範囲を示して年代を出す', async () => {
    renderApp('/profile', { userId: 'dev-user-a' });

    expect(await screen.findByText('20代')).toBeInTheDocument();
    expect(screen.getByText('本人と申請先の主催者だけ')).toBeInTheDocument();
  });

  it('年代を選んで保存できる。選ばないこともできる', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/profile/edit', { userId: 'dev-user-a' });

    const select = await screen.findByLabelText(/年代/);
    expect(select).toHaveValue('twenties');
    await user.selectOptions(select, '40代');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(await screen.findByText('40代')).toBeInTheDocument();
    expect(db.users.find((u) => u.id === 'dev-user-a')?.profile?.ageGroup).toBe('forties');
  });

  it('18歳未満の人は、年代を「10代」か「選ばない」だけ選べる', async () => {
    renderApp('/profile/edit', { userId: 'dev-user-minor' });

    const select = await screen.findByLabelText(/年代/);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['選ばない', '10代']);
  });
});

describe('年齢の区分を「18歳以上」に変える', () => {
  it('18歳以上の人には、変える欄を出さない', async () => {
    renderApp('/profile/edit', { userId: 'dev-user-a' });

    await screen.findByLabelText(/年代/);
    expect(
      screen.queryByRole('button', { name: '「18歳以上」に変更する' }),
    ).not.toBeInTheDocument();
  });

  it('戻せないことを確かめてから変え、募集を作成できるようになる', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/profile/edit', { userId: 'dev-user-minor' });

    await user.click(await screen.findByRole('button', { name: '「18歳以上」に変更する' }));
    const confirm = screen.getByRole('group', { name: '年齢の区分の変更の確認' });
    expect(confirm).toHaveTextContent('「18歳未満」に戻すことはできません');
    await user.click(within(confirm).getByRole('button', { name: 'やめる' }));
    expect(db.users.find((u) => u.id === 'dev-user-minor')?.ageCategory).toBe('minor');

    await user.click(screen.getByRole('button', { name: '「18歳以上」に変更する' }));
    await user.click(screen.getByRole('button', { name: '18歳以上に変える' }));

    expect(await findToast()).toHaveTextContent('年齢の区分を「18歳以上」に変えました。');
    expect(db.users.find((u) => u.id === 'dev-user-minor')?.ageCategory).toBe('adult');
    expect(
      screen.queryByRole('button', { name: '「18歳以上」に変更する' }),
    ).not.toBeInTheDocument();
    // 年代は、10代以外も選べるようになる
    expect(within(screen.getByLabelText(/年代/)).getAllByRole('option')).toHaveLength(7);
  });
});

describe('募集の絞り込み（EVT-05）', () => {
  it('スマートフォンでは「条件」ボタンで開き、区で絞り込む', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' });
    const toggle = screen.getByRole('button', { name: '条件' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.selectOptions(screen.getByLabelText('区'), '中村区');
    await user.click(screen.getByRole('button', { name: 'この条件で探す' }));

    expect(await screen.findByText('条件：', { exact: false })).toHaveTextContent('条件：中村区');
    expect(screen.getByRole('button', { name: '条件（1）' })).toBeInTheDocument();
    const list = await screen.findAllByRole('article');
    expect(list).toHaveLength(2);
  });

  it('条件に合う募集がなければ、そう示して条件をクリアできる', async () => {
    const user = userEvent.setup();
    renderApp('/?area=naka');

    expect(
      await screen.findByRole('heading', { name: '条件に合う募集はありません' }),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '条件をクリア' })[0] as HTMLElement);

    expect(
      await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }),
    ).toBeInTheDocument();
  });

  it('始まりの日が終わりの日より後なら、誤りを示して探さない', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: '条件' }));
    fireEvent.change(screen.getByLabelText('この日から'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('この日まで'), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: 'この条件で探す' }));

    expect(screen.getByText(/終わりの日は、始まりの日と同じか/)).toBeInTheDocument();
    expect(screen.getByLabelText('この日まで')).toHaveFocus();
  });

  it('PCでは、条件を左に出す', async () => {
    asPc();
    try {
      renderApp('/');

      const aside = await screen.findByRole('complementary', { name: '絞り込みの条件' });
      expect(within(aside).getByRole('form', { name: '募集の絞り込み' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '条件' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('絞り込んだ一覧から詳細を開くと、同じ条件の一覧に戻れる', async () => {
    const user = userEvent.setup();
    renderApp('/?area=nakamura');

    await user.click(await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }));
    expect(await screen.findByRole('link', { name: '募集一覧へ' })).toHaveAttribute(
      'href',
      '/?area=nakamura',
    );
  });
});

describe('ヘッダーのニックネームと設定への入口', () => {
  it('ログイン中は、ヘッダーにニックネームを示し、プロフィールへ移れる', async () => {
    renderApp('/', { userId: 'dev-user-a' });

    const header = await screen.findByRole('banner');
    const link = await within(header).findByRole('link', { name: 'ログイン中：あおい' });
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('プロフィール未登録なら、登録へ移る', async () => {
    renderApp('/', { userId: 'dev-user-no-profile' });

    const header = await screen.findByRole('banner');
    expect(
      await within(header).findByRole('link', { name: 'ログイン中：プロフィール未登録' }),
    ).toHaveAttribute('href', '/profile/edit');
  });

  it('未ログインでは、ニックネームを出さない', async () => {
    renderApp('/');

    const header = await screen.findByRole('banner');
    await within(header).findByRole('link', { name: 'ログイン' });
    expect(within(header).queryByText(/ログイン中/)).not.toBeInTheDocument();
  });

  it('プロフィールを保存すると、ヘッダーのニックネームも変わる', async () => {
    const user = userEvent.setup();
    renderApp('/profile/edit', { userId: 'dev-user-a' });

    const nickname = await screen.findByLabelText(/ニックネーム/);
    await user.clear(nickname);
    await user.type(nickname, 'あおい2');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(
      await within(screen.getByRole('banner')).findByRole('link', { name: 'ログイン中：あおい2' }),
    ).toBeInTheDocument();
  });

  it('本人のプロフィールの下に、設定への入口がある', async () => {
    const user = userEvent.setup();
    renderApp('/profile', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: /^設定/ }));

    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument();
  });
});

describe('主催者に質問する（SCR-006）', () => {
  it('申請前でも質問を始められ、会話へ移る', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/events/dev-easy-morning', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('button', { name: '主催者に質問する' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'はる' })).toBeInTheDocument();
    expect(screen.getByText('まだメッセージはありません。')).toBeInTheDocument();
    expect(db.conversations.at(-1)).toMatchObject({
      eventId: 'dev-easy-morning',
      inquirerId: 'dev-user-a',
    });
  });

  it('すでに会話があれば、その会話を開く', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/events/dev-beginner-afternoon', { userId: 'dev-user-a' });
    const count = db.conversations.length;

    await user.click(await screen.findByRole('button', { name: '主催者に質問する' }));

    expect(await screen.findByText('ありがとうございます。申請してみます。')).toBeInTheDocument();
    expect(db.conversations).toHaveLength(count);
  });

  it('承認済みの参加者には「主催者に連絡する」を示す', async () => {
    renderApp('/events/dev-family-morning', { userId: 'dev-user-a' });

    expect(await screen.findByRole('button', { name: '主催者に連絡する' })).toBeInTheDocument();
  });

  it('主催者には、自分の募集で示さない', async () => {
    renderApp('/events/dev-beginner-afternoon', { userId: 'dev-user-b' });

    await screen.findAllByRole('link', { name: '申請者を見る' });
    expect(screen.queryByRole('button', { name: /主催者に/ })).not.toBeInTheDocument();
  });

  it('開催中で承認されていない人には示さない', async () => {
    renderApp('/events/dev-ongoing', { userId: 'dev-user-minor' });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /主催者に/ })).not.toBeInTheDocument();
  });

  it('未ログインには、ログインへの案内を示す', async () => {
    renderApp('/events/dev-easy-morning');

    expect(
      await screen.findByRole('link', { name: 'ログインして主催者に質問する' }),
    ).toHaveAttribute('href', '/login?next=%2Fevents%2Fdev-easy-morning');
  });
});

describe('会話一覧（SCR-010）', () => {
  it('当事者の会話だけを、相手・募集・日時で示す。非表示の募集はタイトルを出さない', async () => {
    renderApp('/conversations', { userId: 'dev-user-a' });

    const list = await screen.findByRole('list', { name: '会話の一覧' });
    const items = within(list).getAllByRole('link');
    expect(items).toHaveLength(4);
    expect(within(list).getByText('はじめて歓迎！土曜の午後バレー')).toBeInTheDocument();
    expect(within(list).getByText('非表示になった募集')).toBeInTheDocument();
    expect(within(list).queryByText('非表示の会（見られない）')).not.toBeInTheDocument();
    expect(within(list).getByText('メッセージなし')).toBeInTheDocument();
  });

  it('会話がなければ、その旨を示す', async () => {
    renderApp('/conversations', { userId: 'dev-user-minor' });

    expect(await screen.findByText('会話はまだありません')).toBeInTheDocument();
  });

  it('スマートフォンでは、一覧と会話を別の画面にし、一覧へ戻れる', async () => {
    const user = userEvent.setup();
    renderApp('/conversations', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: /はじめて歓迎/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'そら' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '会話' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '‹ 会話一覧へ' }));
    expect(await screen.findByRole('heading', { level: 1, name: '会話' })).toBeInTheDocument();
  });

  it('PCでは、左に一覧、右に会話を示す', async () => {
    asPc();
    try {
      const user = userEvent.setup();
      renderApp('/conversations', { userId: 'dev-user-a' });

      expect(await screen.findByText('左の一覧から、会話を選んでください。')).toBeInTheDocument();
      const list = await screen.findByRole('list', { name: '会話の一覧' });
      await user.click(within(list).getByRole('link', { name: /はじめて歓迎/ }));

      expect(await screen.findByRole('heading', { level: 1, name: 'そら' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: '会話' })).toBeInTheDocument();
      expect(within(list).getByRole('link', { name: /はじめて歓迎/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.queryByRole('link', { name: '‹ 会話一覧へ' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('会話（SCR-011）', () => {
  it('送信すると、自分のメッセージとして示し、入力を空にする', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });

    const input = await screen.findByLabelText('メッセージ');
    await user.type(input, '当日はよろしくお願いします。');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByText('当日はよろしくお願いします。')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(db.messages.at(-1)).toMatchObject({ senderId: 'dev-user-a' });
  });

  it('送信中は二重に押せず、メッセージは1件だけ作る', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const send = vi.fn<ConversationRepository['send']>();
    const { db, session } = renderApp('/conversations/dev-conv-question', {
      userId: 'dev-user-a',
      conversations: { send: (input) => send(input) },
    });
    const real = createDevConversationRepository({ db, session });
    send.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          finish = () => {
            void real.send(input).then(resolve);
          };
        }),
    );
    const count = db.messages.length;

    await user.type(await screen.findByLabelText('メッセージ'), '二重に押します');
    const button = screen.getByRole('button', { name: '送信' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByRole('button', { name: '送信中' })).toBeDisabled();
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      finish();
    });
    expect(await screen.findByText('二重に押します')).toBeInTheDocument();
    expect(db.messages).toHaveLength(count + 1);
  });

  it('断られたら「送信できません」とだけ示し、入力を残す', async () => {
    const user = userEvent.setup();
    renderApp('/conversations/dev-conv-question', {
      userId: 'dev-user-a',
      conversations: {
        send: () => Promise.resolve({ status: 'rejected', reason: 'notAllowed' }),
      },
    });

    const input = await screen.findByLabelText('メッセージ');
    await user.type(input, '送れないかもしれない');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^送信できません$/);
    expect(input).toHaveValue('送れないかもしれない');
  });

  it('通信に失敗しても、入力を残す', async () => {
    const user = userEvent.setup();
    renderApp('/conversations/dev-conv-question', {
      userId: 'dev-user-a',
      conversations: { send: () => Promise.reject(new Error('通信の失敗')) },
    });

    const input = await screen.findByLabelText('メッセージ');
    await user.type(input, '届くかな');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('送信できませんでした');
    expect(input).toHaveValue('届くかな');
  });

  it('1,000文字を超えると送らず、文字数を示す', async () => {
    const send = vi.fn<ConversationRepository['send']>();
    renderApp('/conversations/dev-conv-question', {
      userId: 'dev-user-a',
      conversations: { send },
    });

    const input = await screen.findByLabelText('メッセージ');
    fireEvent.change(input, { target: { value: 'あ'.repeat(1001) } });
    expect(screen.getByText('1,001／1,000文字')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('1,000文字以内');
    expect(send).not.toHaveBeenCalled();
  });

  it('送信できる期間を過ぎた会話は、閲覧だけできる', async () => {
    renderApp('/conversations/dev-conv-expired', { userId: 'dev-user-b' });

    expect(
      await screen.findByText('先日はありがとうございました。また参加したいです。'),
    ).toBeInTheDocument();
    expect(screen.getByText(/閲覧だけできます/)).toBeInTheDocument();
    expect(screen.queryByLabelText('メッセージ')).not.toBeInTheDocument();
  });

  it('当事者でない会話は、見つからないと示す', async () => {
    renderApp('/conversations/dev-conv-question', { userId: 'dev-user-minor' });

    expect(
      await screen.findByRole('heading', { level: 1, name: '会話が見つかりません' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/中学の部活/)).not.toBeInTheDocument();
  });

  it('相手の名前からプロフィールへ移り、会話へ戻れる', async () => {
    const user = userEvent.setup();
    renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: 'そら' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'そら' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /会話へ/ }));

    expect(await screen.findByText(/中学の部活/)).toBeInTheDocument();
  });

  it('非表示の募集の会話では、タイトルを出さない', async () => {
    renderApp('/conversations/dev-conv-hidden', { userId: 'dev-user-a' });

    expect(await screen.findByText('非表示になった募集')).toBeInTheDocument();
    expect(screen.queryByText('非表示の会（見られない）')).not.toBeInTheDocument();
  });
});

describe('通しの流れ', () => {
  it('作成 → 探す → 詳細 → 申請 → 承認 → 住所 → 連絡', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp('/events/new', { userId: 'dev-user-b' });
    const nav = async () => {
      const [first] = await screen.findAllByRole('navigation', { name: '主な移動' });
      if (!first) throw new Error('移動がありません。');
      return first;
    };

    // 作成（主催者：そら）
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '公開する' }));
    await screen.findByRole('heading', { level: 1, name: '日曜の練習会' });

    // 探す → 詳細 → 申請（参加者：あおい）
    switchUser('dev-user-a');
    await user.click(within(await nav()).getByRole('link', { name: 'ホーム' }));
    await user.click(await screen.findByRole('link', { name: /日曜の練習会/ }));
    await screen.findByRole('heading', { level: 1, name: '日曜の練習会' });
    expect(screen.queryByText('ダミー住所Q（架空）')).not.toBeInTheDocument();
    await user.click((await screen.findAllByRole('button', { name: '参加を申請する' }))[0]!);
    expect((await screen.findAllByText('承認待ち')).length).toBeGreaterThan(0);

    // 承認（主催者）
    switchUser('dev-user-b');
    await user.click((await screen.findAllByRole('link', { name: '申請者を見る' }))[0]!);
    await user.click(await screen.findByRole('button', { name: 'あおいさんを承認する' }));
    expect(await findToast()).toHaveTextContent('あおいさんの参加を承認しました。');

    // 住所 → 連絡（参加者）
    switchUser('dev-user-a');
    await user.click(within(await nav()).getByRole('link', { name: '申請と募集' }));
    await user.click(await screen.findByRole('link', { name: /日曜の練習会/ }));
    expect(await screen.findByText('ダミー住所Q（架空）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '主催者に連絡する' }));
    await user.type(await screen.findByLabelText('メッセージ'), '承認ありがとうございます。');
    await user.click(screen.getByRole('button', { name: '送信' }));
    expect(await screen.findByText('承認ありがとうございます。')).toBeInTheDocument();

    // 主催者の会話一覧に届く
    switchUser('dev-user-b');
    await user.click(within(await nav()).getByRole('link', { name: '会話' }));
    const list = await screen.findByRole('list', { name: '会話の一覧' });
    await user.click(within(list).getByRole('link', { name: /あおい.*日曜の練習会/ }));
    expect(await screen.findByText('承認ありがとうございます。')).toBeInTheDocument();
  });
});
