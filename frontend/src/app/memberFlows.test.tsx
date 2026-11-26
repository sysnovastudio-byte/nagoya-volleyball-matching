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
  return { db, session, switchUser };
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

    expect(await screen.findByRole('status')).toHaveTextContent(
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

describe('申請者一覧（PC）', () => {
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
      ).toEqual(['ニックネーム', '経験レベル', '自己紹介', '申請日時', '状態', '操作']);
      const row = within(table).getByRole('row', { name: /こはる/ });
      expect(row).toHaveTextContent('未経験者');
      expect(row).toHaveTextContent('承認待ち');
      // カードと二重に置かない
      expect(screen.getAllByRole('button', { name: 'こはるさんを承認する' })).toHaveLength(1);

      await user.click(within(row).getByRole('button', { name: 'こはるさんを承認する' }));
      expect(await screen.findByRole('status')).toHaveTextContent(
        'こはるさんの参加を承認しました。',
      );
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

    expect(await screen.findByText('プロフィールを保存しました。')).toHaveAttribute(
      'role',
      'status',
    );
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
    expect((await screen.findAllByText('募集を公開しました。')).length).toBeGreaterThan(0);

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

    expect((await screen.findAllByText('募集を公開しました。')).length).toBeGreaterThan(0);
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
