import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDevConversationRepository } from '../dev/devConversationRepository';
import type { ConversationRepository } from '../features/conversations/types';
import type { EventRepository } from '../features/events/types';
import { chooseFromMenu, findToast, renderApp } from '../test/renderApp';

const HOST = 'dev-user-b';
const HOSTED_EVENT = 'dev-beginner-afternoon';

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
  await user.selectOptions(screen.getByLabelText(/開催地/), '名古屋市');
  await user.selectOptions(screen.getByLabelText(/^区/), '中区');
  await user.click(screen.getByLabelText('初心者'));
  await user.type(screen.getByLabelText(/募集人数/), '8');
  await user.type(screen.getByLabelText(/参加費/), '300');
  await user.type(screen.getByLabelText(/くわしい住所/), 'ダミー住所Q（架空）');
  await user.type(screen.getByLabelText(/施設名/), 'ダミー体育館Q');
}

describe('ログイン後の移動', () => {
  it('5つの移動先を示す', async () => {
    renderApp('/', { userId: 'dev-user-a' });

    // 1つ目はPCの上部、2つ目はスマートフォンの下部
    const [top, bottom] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!top || !bottom) throw new Error('移動がありません。');
    const labels = (nav: HTMLElement) =>
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent);
    // PCの上部は「プロフィール」の代わりにニックネームを示す（読み上げでは「プロフィール：」を添える）
    // 通知には未読の数を示す（利用者Aには、未読が2件ある）
    await waitFor(() => {
      expect(labels(top)).toEqual([
        'ホーム',
        '申請と募集',
        '会話',
        '2通知（未読2件）',
        'プロフィール：あおい',
      ]);
    });
    expect(labels(bottom)).toEqual([
      'ホーム',
      '申請と募集',
      '会話',
      '2通知（未読2件）',
      'プロフィール',
    ]);
    expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument();
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
  it('ログインした人に示す', async () => {
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

  it('区は名古屋市を選んだときだけ選び、ほかの市町村では区を持たずに作る', async () => {
    const user = userEvent.setup();
    const createEvent = vi.fn<EventRepository['createEvent']>().mockResolvedValue({
      status: 'rejected',
      reason: 'rateLimited',
    });
    renderApp('/events/new', { userId: 'dev-user-a', events: { createEvent } });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);

    await user.selectOptions(screen.getByLabelText(/開催地/), '豊田市');
    expect(screen.queryByLabelText(/^区/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '公開する' }));

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ area: { municipality: 'toyota', ward: null } }),
    );
  });

  it('種別は任意で、選ぶと詳細に示す', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });
    await fillValidForm(user);

    const kind = screen.getByLabelText(/種別/);
    expect(kind).toHaveValue('');
    expect(
      within(kind)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['選ばない', '男子', '女子', '混合']);
    await user.selectOptions(kind, '女子');
    await user.click(screen.getByRole('button', { name: '公開する' }));

    await screen.findByRole('heading', { level: 1, name: '日曜の練習会' });
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toContain('種別');
    expect(screen.getAllByText('女子').length).toBeGreaterThan(0);
  });

  it('種別を選ばなかった募集の詳細には、種別の項目を出さない', async () => {
    renderApp('/events/dev-easy-morning');

    await screen.findByRole('heading', { level: 1, name: '日曜朝のゆるバレー' });
    expect(screen.getAllByRole('term').map((term) => term.textContent)).not.toContain('種別');
  });

  it('一覧のカードに種別を示す', async () => {
    renderApp('/');

    const link = await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' });
    expect(link.closest('article')).toHaveTextContent('混合');
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
    await user.click(within(nav).getByRole('link', { name: /^通知/ }));

    expect(screen.getByRole('heading', { level: 1, name: '通知' })).toBeInTheDocument();
  });

  it('終了が開始より前なら翌日として扱う。深夜にかかっても注意は出さない', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });
    await screen.findByRole('heading', { level: 1, name: '募集を作る' });

    await fillSchedule(user, 7, '21:00', '01:00');

    expect(screen.getByText('翌日')).toBeInTheDocument();
    expect(screen.getByLabelText(/終了時刻/)).toHaveAccessibleDescription(
      '終了時刻が開始より前のため、翌日の01:00に終わります。',
    );
    expect(screen.queryByText(/深夜/)).not.toBeInTheDocument();
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
    // 登録は20歳以上のため、未成年者に関する案内は出さない（docs/11の7-1）
    expect(screen.queryByText(/18歳未満/)).not.toBeInTheDocument();
    expect(screen.queryByText(/市町村から選びます/)).not.toBeInTheDocument();
  });

  it('「やめる」は「公開する」の下に置く', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });

    const publish = await screen.findByRole('button', { name: '公開する' });
    const cancel = screen.getByRole('button', { name: 'やめる' });
    expect(publish.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('公開する項目と、承認された人だけの項目を分けて示す', async () => {
    renderApp('/events/new', { userId: 'dev-user-a' });

    const publicSection = await screen.findByRole('region', { name: '全員に公開する項目' });
    const privateSection = screen.getByRole('region', { name: '承認された人だけに見せる項目' });
    expect(within(publicSection).queryByLabelText(/くわしい住所/)).not.toBeInTheDocument();
    expect(within(privateSection).getByLabelText(/くわしい住所/)).toBeInTheDocument();
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

describe('募集の中止（SCR-006）', () => {
  it('主催者は、影響を確かめてから中止し、参加者に通知が届く', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    const counts = await screen.findAllByText(
      (_, element) =>
        element?.tagName === 'P' && element.textContent === '承認待ち 3人・承認済み 9人',
    );
    expect(counts.length).toBeGreaterThan(0);
    await user.click(await findFirstButton('募集を中止する'));
    const [group] = screen.getAllByRole('group', { name: '募集の中止の確認' });
    if (!group) throw new Error('確認がありません。');
    expect(group).toHaveTextContent('元に戻せません');
    expect(group).toHaveTextContent('承認待ち・承認済みの12人に通知します。');
    await user.click(within(group).getByRole('button', { name: '募集を中止する' }));

    expect(await findToast()).toHaveTextContent('募集を中止しました。');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '募集を中止する' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('中止').length).toBeGreaterThan(0);

    // 承認待ちだった人に届く
    switchUser('dev-member-13');
    const [nav] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    await user.click(await within(nav).findByRole('link', { name: /^通知/ }));
    expect(await screen.findByRole('link', { name: '募集が中止されました。' })).toHaveAttribute(
      'href',
      `/events/${HOSTED_EVENT}`,
    );
  });

  it('中止の確認は、やめると何もしない', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    await user.click(await findFirstButton('募集を中止する'));
    const [group] = screen.getAllByRole('group', { name: '募集の中止の確認' });
    if (!group) throw new Error('確認がありません。');
    await user.click(within(group).getByRole('button', { name: 'やめる' }));

    expect(screen.queryByRole('group', { name: '募集の中止の確認' })).not.toBeInTheDocument();
    expect(screen.getAllByText('受付中').length).toBeGreaterThan(0);
  });

  it('開催中の募集には、中止を出さない', async () => {
    renderApp('/events/dev-ongoing', { userId: HOST });

    await screen.findAllByRole('link', { name: '申請者を見る' });
    expect(screen.queryByRole('button', { name: '募集を中止する' })).not.toBeInTheDocument();
  });

  it('中止された募集の参加者には、中止を示し、住所を見せない', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp('/events/dev-family-morning', { userId: 'dev-host-yui' });
    await user.click(await findFirstButton('募集を中止する'));
    const [group] = screen.getAllByRole('group', { name: '募集の中止の確認' });
    if (!group) throw new Error('確認がありません。');
    await user.click(within(group).getByRole('button', { name: '募集を中止する' }));
    await findToast();

    switchUser('dev-user-a');
    expect((await screen.findAllByText('この募集は中止されました。')).length).toBeGreaterThan(0);
    expect(screen.queryByText('ダミー住所E（架空）')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '参加をキャンセルする' })).not.toBeInTheDocument();
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

  it('開催中の募集では、申請できない案内を示す', async () => {
    // 申請の記録がない利用者にする
    renderApp('/events/dev-ongoing', { userId: 'dev-member-13' });

    expect((await screen.findAllByText('開催中のため、申請できません。')).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
  });

  it('満員の募集でも、主催者が判断することを添えて申請できる', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-easy-morning', { userId: 'dev-member-13' });

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
  it('承認の取り消しは、理由を選び確認してから行い、「そのほか」に移る', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    const summary = await screen.findByRole('region', { name: '定員と承認済みの数' });
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    await user.click(screen.getByRole('button', { name: 'ひなたさんの承認を取り消す' }));
    const group = screen.getByRole('group', { name: 'ひなたさんの承認の取り消しの確認' });
    expect(group).toHaveTextContent('この募集にもう申請できません');
    const submit = within(group).getByRole('button', { name: '承認を取り消す' });
    // 理由を選ぶまでは押せない
    expect(submit).toBeDisabled();
    await user.click(within(group).getByRole('radio', { name: '安全上の理由' }));
    await user.click(submit);

    expect(await findToast()).toHaveTextContent('ひなたさんの承認を取り消しました。');
    expect(summary).toHaveTextContent('承認済み 8人');
    await user.click(screen.getByRole('button', { name: /そのほか/ }));
    expect(screen.getByRole('link', { name: 'ひなた' }).closest('li')).toHaveTextContent(
      '承認取り消し',
    );
  });

  it('承認の取り消しは、やめると何もしない', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await screen.findByRole('region', { name: '定員と承認済みの数' });
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    await user.click(screen.getByRole('button', { name: 'ひなたさんの承認を取り消す' }));
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.getByRole('button', { name: 'ひなたさんの承認を取り消す' })).toBeInTheDocument();
  });

  it('承認すると承認済みに移り、定員の数が変わる', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    const summary = await screen.findByRole('region', { name: '定員と承認済みの数' });
    expect(summary).toHaveTextContent('承認済み 9人');
    await user.click(screen.getByRole('button', { name: 'りくさんを承認する' }));

    expect(await findToast()).toHaveTextContent('りくさんの参加を承認しました。');
    expect(summary).toHaveTextContent('承認済み 10人');
    expect(screen.queryByRole('button', { name: 'りくさんを承認する' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    expect(screen.getByRole('link', { name: 'りく' })).toHaveAttribute(
      'href',
      '/users/dev-member-13',
    );
  });

  it('却下は確認してから行う', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await user.click(await screen.findByRole('button', { name: 'りくさんの申請を却下する' }));
    const confirm = screen.getByRole('group', { name: 'りくさんの申請の却下の確認' });
    await user.click(within(confirm).getByRole('button', { name: 'やめる' }));
    expect(screen.getByRole('button', { name: 'りくさんを承認する' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'りくさんの申請を却下する' }));
    await user.click(
      within(screen.getByRole('group', { name: 'りくさんの申請の却下の確認' })).getByRole(
        'button',
        { name: '却下する' },
      ),
    );
    expect(await findToast()).toHaveTextContent('りくさんの申請を却下しました。');
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
    expect(screen.queryByText('りく')).not.toBeInTheDocument();
  });

  it('非表示の募集の申請者一覧は、主催者にも見せない', async () => {
    renderApp('/events/dev-b-hidden/applicants', { userId: HOST });

    expect(
      await screen.findByText('この募集は非表示になったため、申請者一覧を表示できません。'),
    ).toBeInTheDocument();
  });
});

describe('キャンセル・取り下げ・再申請（SCR-006）', () => {
  it('承認済みの参加は、確認してからキャンセルし、住所を隠して再申請を示す', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-family-morning', { userId: 'dev-user-a' });
    await screen.findByText('ダミー住所E（架空）');

    await user.click(await findFirstButton('参加をキャンセルする'));
    const [group] = screen.getAllByRole('group', { name: '参加のキャンセルの確認' });
    if (!group) throw new Error('確認がありません。');
    expect(group).toHaveTextContent('くわしい住所を見られなくなり、主催者に知らせます');
    await user.click(within(group).getByRole('button', { name: '参加をキャンセルする' }));

    expect(await findToast()).toHaveTextContent('参加をキャンセルしました。');
    await waitFor(() => {
      expect(screen.queryByText('ダミー住所E（架空）')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('キャンセル').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'もう一度申請する' }).length).toBeGreaterThan(0);
  });

  it('キャンセルの確認は、やめると何もしない', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-family-morning', { userId: 'dev-user-a' });

    await user.click(await findFirstButton('参加をキャンセルする'));
    const [group] = screen.getAllByRole('group', { name: '参加のキャンセルの確認' });
    if (!group) throw new Error('確認がありません。');
    await user.click(within(group).getByRole('button', { name: 'やめる' }));

    expect(screen.queryByRole('group', { name: '参加のキャンセルの確認' })).not.toBeInTheDocument();
    expect(screen.getByText('ダミー住所E（架空）')).toBeInTheDocument();
  });

  it('承認待ちの申請は、確認してから取り下げる', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-weekday-night', { userId: 'dev-user-a' });

    await user.click(await findFirstButton('申請を取り下げる'));
    const [group] = screen.getAllByRole('group', { name: '申請の取り下げの確認' });
    if (!group) throw new Error('確認がありません。');
    await user.click(within(group).getByRole('button', { name: '申請を取り下げる' }));

    expect(await findToast()).toHaveTextContent('申請を取り下げました。');
    expect((await screen.findAllByText('取り下げ')).length).toBeGreaterThan(0);
  });

  it('キャンセルした満員の募集に、もう一度申請できる', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-easy-morning', { userId: 'dev-user-a' });

    expect((await screen.findAllByText('参加をキャンセルしました。')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('満員です。申請すると主催者が判断します。').length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('同じ募集への申請は合計3回までです。').length).toBeGreaterThan(0);
    await user.click(await findFirstButton('もう一度申請する'));

    expect(await findToast()).toHaveTextContent('参加を申請しました。');
    expect((await screen.findAllByText('承認待ち')).length).toBeGreaterThan(0);
  });

  it('承認を取り消された募集では、再申請できないことを示す', async () => {
    renderApp('/events/dev-b-full', { userId: 'dev-user-a' });

    expect(
      (
        await screen.findAllByText(
          '主催者が参加の承認を取り消しました。この募集には、もう申請できません。',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('承認取り消し').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /申請する/ })).not.toBeInTheDocument();
  });

  it('却下の後は、取り下げ・再申請の操作を出さない', async () => {
    renderApp('/events/dev-spike-practice', { userId: 'dev-user-a' });

    await screen.findAllByText('この募集への申請は却下されました。');
    expect(screen.queryByRole('button', { name: 'もう一度申請する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '申請を取り下げる' })).not.toBeInTheDocument();
  });

  it('開催中の承認済みには、キャンセルを出さない', async () => {
    renderApp('/events/dev-ongoing', { userId: 'dev-user-a' });

    await screen.findAllByText('承認済み');
    expect(screen.queryByRole('button', { name: '参加をキャンセルする' })).not.toBeInTheDocument();
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

  it('承認済みの参加を、この画面からキャンセルできる', async () => {
    const user = userEvent.setup();
    renderApp('/activity', { userId: 'dev-user-a' });

    const section = await screen.findByRole('region', { name: '参加する側' });
    const item = (
      await within(section).findByRole('link', { name: '家族や友人と楽しむ午前バレー' })
    ).closest('li');
    if (!item) throw new Error('申請がありません。');
    await user.click(within(item).getByRole('button', { name: '参加をキャンセルする' }));
    await user.click(
      within(within(item).getByRole('group')).getByRole('button', { name: '参加をキャンセルする' }),
    );

    expect(await findToast()).toHaveTextContent('参加をキャンセルしました。');
    await waitFor(() => {
      expect(item).toHaveTextContent('キャンセル');
    });
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
  });

  it('キャンセル・取り下げの申請には、操作を出さない', async () => {
    renderApp('/activity', { userId: 'dev-user-a' });

    const section = await screen.findByRole('region', { name: '参加する側' });
    const item = (await within(section).findByRole('link', { name: '日曜朝のゆるバレー' })).closest(
      'li',
    );
    if (!item) throw new Error('申請がありません。');
    expect(item).toHaveTextContent('キャンセル');
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
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
      ).toEqual([
        'ニックネーム',
        '経験レベル',
        '年代',
        '性別',
        '自己紹介',
        '申請日時',
        '状態',
        '操作',
      ]);
      const row = within(table).getByRole('row', { name: /りく/ });
      expect(row).toHaveTextContent('経験者');
      expect(row).toHaveTextContent('50代');
      expect(row).toHaveTextContent('承認待ち');
      // カードと二重に置かない
      expect(screen.getAllByRole('button', { name: 'りくさんを承認する' })).toHaveLength(1);

      await user.click(within(row).getByRole('button', { name: 'りくさんを承認する' }));
      expect(await findToast()).toHaveTextContent('りくさんの参加を承認しました。');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('スマートフォンでは、表を使わない', async () => {
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    expect(await screen.findByRole('button', { name: 'りくさんを承認する' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('通知一覧（SCR-012）', () => {
  it('自分の通知を新しい順に示し、開くと未読の数が消える', async () => {
    const user = userEvent.setup();
    renderApp('/', { userId: 'dev-user-a' });

    const [nav] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    await user.click(await within(nav).findByRole('link', { name: '通知（未読2件）' }));

    expect(await screen.findByRole('heading', { level: 1, name: '通知' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').filter((item) => item.closest('main'));
    expect(items.map((item) => within(item).getByText(/。$/).textContent)).toEqual([
      '参加が承認されました。',
      '募集が非表示になりました。',
      '参加の申請は却下されました。',
    ]);
    // 開いた時点の未読には印を残し、移動の数は消える
    expect(within(items[0] ?? document.body).getByText('未読')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: '通知' })).toBeInTheDocument();
    });
  });

  it('非表示の募集は名前を示さず、移る先も示さない', async () => {
    renderApp('/notifications', { userId: 'dev-user-a' });

    const text = await screen.findByText('募集が非表示になりました。');
    expect(text.closest('a')).toBeNull();
    const row = text.closest('li');
    if (!row) throw new Error('通知の行がありません。');
    expect(within(row).getByText(/非表示になった募集/)).toBeInTheDocument();
    expect(within(row).queryByText(/非表示の会/)).not.toBeInTheDocument();
  });

  it('承認の通知から募集詳細へ移る', async () => {
    const user = userEvent.setup();
    renderApp('/notifications', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: '参加が承認されました。' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '家族や友人と楽しむ午前バレー' }),
    ).toBeInTheDocument();
  });

  it('申請すると主催者に届き、通知から申請者一覧へ移る', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp(`/events/${HOSTED_EVENT}`, { userId: 'dev-user-a' });
    await user.click(await findFirstButton('参加を申請する'));

    switchUser(HOST);
    const [nav] = await screen.findAllByRole('navigation', { name: '主な移動' });
    if (!nav) throw new Error('移動がありません。');
    await user.click(await within(nav).findByRole('link', { name: '通知（未読2件）' }));
    await user.click(await screen.findByRole('link', { name: 'あおいさんが参加を申請しました。' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請者一覧' }),
    ).toBeInTheDocument();
  });

  it('通知がなければ、その旨を示す', async () => {
    renderApp('/notifications', { userId: 'dev-user-no-profile' });

    expect(await screen.findByText('まだ通知はありません。')).toBeInTheDocument();
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
    await user.click(screen.getByLabelText('20歳以上です'));
    await user.click(screen.getByLabelText('利用規約・プライバシーポリシーに同意する'));
    await user.click(
      screen.getByLabelText('通報されたメッセージを、運営者が確認することに同意する'),
    );
  }

  it('同意の欄は2つが別々で、最初はすべて未選択', async () => {
    renderApp('/signup');

    const boxes = [
      await screen.findByLabelText('利用規約・プライバシーポリシーに同意する'),
      screen.getByLabelText('通報されたメッセージを、運営者が確認することに同意する'),
    ];
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByLabelText('20歳以上です')).not.toBeChecked();
    expect(screen.queryByText(/保護者/)).not.toBeInTheDocument();
    expect(screen.getByText(/版：\s*仮-0/)).toBeInTheDocument();
  });

  it('1つ目は「読む」のリンクと「同意する」、リンクは新しいタブで仮の文章を開く', async () => {
    renderApp('/signup');

    const link = await screen.findByRole('link', { name: /利用規約・プライバシーポリシーを読む/ });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('同意する')).toBeInTheDocument();
  });

  it('規約等の仮の画面を示す', async () => {
    renderApp('/terms');

    expect(
      await screen.findByRole('heading', { level: 1, name: '利用規約・プライバシーポリシー' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '利用規約' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'プライバシーポリシー' })).toBeInTheDocument();
  });

  it('「20歳以上です」を選ばないと登録しない', async () => {
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignUp(user);

    const adult = screen.getByLabelText('20歳以上です');
    await user.click(adult);
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(screen.getByText('20歳以上の方だけが登録できます。')).toBeInTheDocument();
    expect(adult).toHaveFocus();
    expect(screen.queryByRole('heading', { name: /メールを送りました/ })).not.toBeInTheDocument();
  });

  it('同意しないと登録しない', async () => {
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignUp(user);
    await user.click(
      screen.getByLabelText('通報されたメッセージを、運営者が確認することに同意する'),
    );

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(
      screen.getByText('通報されたメッセージを運営者が確認することへの同意が必要です。'),
    ).toBeInTheDocument();
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
    await user.click(screen.getByLabelText('20歳以上です'));
    await user.click(screen.getByLabelText('利用規約・プライバシーポリシーに同意する'));
    await user.click(
      screen.getByLabelText('通報されたメッセージを、運営者が確認することに同意する'),
    );
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
    // ニックネーム・経験レベル・年代・性別・自己紹介。年代と性別もログインした人に公開する
    expect(screen.getAllByText('ログインした人に公開')).toHaveLength(5);
    expect(screen.queryByText('本人と申請先の主催者だけ')).not.toBeInTheDocument();
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
  it('1. 新規登録をやり直しても、別の利用者になり、募集を作成できる', async () => {
    const user = userEvent.setup();
    const { db, session } = renderApp('/signup');
    // 先に別の利用者が登録・認証を済ませている
    db.users.push({ id: 'dev-registered-1', role: 'user', status: 'active', profile: null });

    await user.type(await screen.findByLabelText(/メールアドレス/), 'test@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'abcdefghij');
    await user.click(screen.getByLabelText('20歳以上です'));
    await user.click(screen.getByLabelText('利用規約・プライバシーポリシーに同意する'));
    await user.click(
      screen.getByLabelText('通報されたメッセージを、運営者が確認することに同意する'),
    );
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
    await user.click(await screen.findByRole('button', { name: '申請と募集に戻る' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請と募集' }),
    ).toBeInTheDocument();
  });

  it('2. 募集一覧から開いた募集詳細は、募集一覧に戻る', async () => {
    renderApp(`/events/${HOSTED_EVENT}`, { userId: HOST });

    // 前の画面がない（アドレスを直接開いた）ので、親の画面（募集一覧）に戻る
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '募集一覧に戻る' }));

    expect(await screen.findByRole('link', { name: /はじめて歓迎/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /に戻る$/ })).not.toBeInTheDocument();
  });

  it('3. 申請者一覧から開いたプロフィールに、申請者一覧へ戻るボタンがある', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await user.click(await screen.findByRole('link', { name: 'りく' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'りく' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '申請者一覧に戻る' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '申請者一覧' }),
    ).toBeInTheDocument();
  });
});

describe('年代・性別（ログインした人全員に公開）', () => {
  it('主催者は、申請者一覧で申請者の年代と性別を見られる。未選択はそう示す', async () => {
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    const card = (await screen.findByRole('link', { name: 'りく' })).closest('li');
    expect(card).toHaveTextContent('年代50代');
    expect(card).toHaveTextContent('性別未選択');
  });

  it('ほかの人のプロフィールにも、年代と性別を出す', async () => {
    renderApp('/users/dev-user-a', { userId: HOST });

    expect(await screen.findByRole('heading', { level: 1, name: 'あおい' })).toBeInTheDocument();
    expect(screen.getByText('20代')).toBeInTheDocument();
    expect(screen.getByText('女性')).toBeInTheDocument();
  });

  it('本人のプロフィールにも、年代と性別を出す。未選択はそう示す', async () => {
    renderApp('/profile', { userId: 'dev-member-13' });

    expect(await screen.findByText('50代')).toBeInTheDocument();
    expect(screen.getByText('性別').nextElementSibling).toHaveTextContent('選んでいません。');
  });

  it('性別は任意で、選んで保存できる', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/profile/edit', { userId: 'dev-member-13' });

    const group = await screen.findByRole('group', { name: /性別/ });
    const options = within(group).getAllByRole('radio');
    expect(options.map((option) => option.closest('label')?.textContent)).toEqual([
      '男性',
      '女性',
      'その他',
      '回答しない',
    ]);
    for (const option of options) expect(option).not.toBeChecked();
    await user.click(within(group).getByLabelText('回答しない'));
    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(await screen.findByText('回答しない')).toBeInTheDocument();
    expect(db.users.find((u) => u.id === 'dev-member-13')?.profile?.gender).toBe('noAnswer');
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

  it('年代は「選ばない」と20代〜60代以上から選ぶ', async () => {
    renderApp('/profile/edit', { userId: 'dev-user-a' });

    const select = await screen.findByLabelText(/年代/);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['選ばない', '20代', '30代', '40代', '50代', '60代以上']);
  });
});

describe('募集の絞り込み（EVT-05）', () => {
  it('スマートフォンでは「条件」ボタンで開き、名古屋市の区で絞り込む', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' });
    const toggle = screen.getByRole('button', { name: '条件' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    // 区は、市町村で名古屋市を選んだときだけ出す
    expect(screen.queryByLabelText('区')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('市町村'), '名古屋市');
    await user.selectOptions(screen.getByLabelText('区'), '中村区');
    await user.click(screen.getByRole('button', { name: 'この条件で探す' }));

    expect(await screen.findByText('条件：', { exact: false })).toHaveTextContent(
      '条件：名古屋市中村区',
    );
    expect(screen.getByRole('button', { name: '条件（1）' })).toBeInTheDocument();
    const list = await screen.findAllByRole('article');
    expect(list).toHaveLength(2);
  });

  it('条件に合う募集がなければ、そう示して条件をクリアできる', async () => {
    const user = userEvent.setup();
    renderApp('/?city=nagoya&ward=naka');

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
    renderApp('/?city=nagoya&ward=nakamura');

    await user.click(await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }));
    await user.click(await screen.findByRole('button', { name: '募集一覧に戻る' }));

    // 来た画面に戻るため、条件（名古屋市中村区）は残る
    expect(
      await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /日曜朝のゆるバレー/ })).not.toBeInTheDocument();
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
    renderApp('/events/dev-ongoing', { userId: 'dev-member-13' });

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

describe('主催者からの会話の開始（SCR-008）', () => {
  it('承認待ちの申請者と会話を始め、会話へ移る', async () => {
    const user = userEvent.setup();
    const { db } = renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await user.click(await screen.findByRole('button', { name: 'りくさんと会話を始める' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'りく' })).toBeInTheDocument();
    expect(db.conversations.at(-1)).toMatchObject({
      eventId: HOSTED_EVENT,
      inquirerId: 'dev-member-13',
      startedBy: HOST,
    });
  });

  it('承認済みの人にも示し、却下した人には示さない', async () => {
    const user = userEvent.setup();
    renderApp(`/events/${HOSTED_EVENT}/applicants`, { userId: HOST });

    await screen.findByRole('region', { name: '定員と承認済みの数' });
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    expect(screen.getByRole('button', { name: 'ひなたさんと会話を始める' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /そのほか/ }));
    expect(screen.queryByRole('button', { name: /と会話を始める$/ })).not.toBeInTheDocument();
  });

  it('送信できる期間を過ぎた募集では、示さない', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-b-ended/applicants', { userId: HOST });

    await screen.findByRole('region', { name: '定員と承認済みの数' });
    await user.click(screen.getByRole('button', { name: /承認済み/ }));
    expect(screen.queryByRole('button', { name: /と会話を始める$/ })).not.toBeInTheDocument();
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
    renderApp('/conversations', { userId: 'dev-member-13' });

    expect(await screen.findByText('会話はまだありません')).toBeInTheDocument();
  });

  it('スマートフォンでは、一覧と会話を別の画面にし、一覧へ戻れる', async () => {
    const user = userEvent.setup();
    renderApp('/conversations', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: /はじめて歓迎/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'そら' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '会話' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '会話一覧に戻る' }));
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
      expect(screen.queryByRole('button', { name: /に戻る$/ })).not.toBeInTheDocument();
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
    renderApp('/conversations/dev-conv-question', { userId: 'dev-member-13' });

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
    await user.click(screen.getByRole('button', { name: '会話に戻る' }));

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

describe('戻るボタン（docs/11の5-1）', () => {
  it.each(['/', '/activity', '/conversations', '/notifications', '/profile'])(
    '下部の移動から直接開く画面（%s）には置かない',
    async (path) => {
      renderApp(path, { userId: 'dev-user-a' });

      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('button', { name: /に戻る$|^戻る$/ })).not.toBeInTheDocument();
    },
  );

  it.each([
    ['/events/dev-easy-morning', '募集一覧に戻る'],
    ['/events/new', '募集一覧に戻る'],
    ['/events/dev-beginner-afternoon/applicants', '募集詳細に戻る'],
    ['/conversations/dev-conv-question', '会話一覧に戻る'],
    ['/profile/edit', 'プロフィールに戻る'],
    ['/users/dev-host-haru', '募集一覧に戻る'],
    ['/settings', 'プロフィールに戻る'],
    ['/terms', '新規登録に戻る'],
    ['/unknown', '募集一覧に戻る'],
  ])('前の画面がなければ、親の画面を示す（%s → %s）', async (path, label) => {
    renderApp(path, { userId: path.endsWith('applicants') ? 'dev-user-b' : 'dev-user-a' });

    const button = await screen.findByRole('button', { name: label });
    // 「←」を添え、押せる範囲は44px以上にする
    expect(button).toHaveTextContent(`←${label}`);
    expect(button).toHaveClass('min-h-11');
  });

  it('未ログインの画面にも置く', async () => {
    renderApp('/login');

    expect(await screen.findByRole('button', { name: '募集一覧に戻る' })).toBeInTheDocument();
  });

  it('前の画面がなければ、押すと親の画面へ移る', async () => {
    const user = userEvent.setup();
    renderApp('/events/dev-beginner-afternoon/applicants', { userId: 'dev-user-b' });

    await user.click(await screen.findByRole('button', { name: '募集詳細に戻る' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'はじめて歓迎！土曜の午後バレー' }),
    ).toBeInTheDocument();
  });

  it('アプリの中で来た画面の名前を示し、その画面に戻る', async () => {
    const user = userEvent.setup();
    renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });

    await user.click(await screen.findByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }));
    await user.click(await screen.findByRole('button', { name: '会話に戻る' }));

    expect(await screen.findByText(/中学の部活/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '会話一覧に戻る' })).toBeInTheDocument();
  });

  it('入力中の募集作成では、「やめる」と同じ確認を出す', async () => {
    const user = userEvent.setup();
    renderApp('/events/new', { userId: 'dev-user-a' });

    await user.type(await screen.findByLabelText(/タイトル/), '日曜の練習会');
    await user.click(screen.getByRole('button', { name: '募集一覧に戻る' }));

    expect(
      await screen.findByText('入力した内容は保存されません。入力をやめますか？'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '入力を続ける' }));
    expect(screen.getByLabelText(/タイトル/)).toHaveValue('日曜の練習会');
  });
});

describe('ブロックと解除（SAFE-04・CND-06）', () => {
  it('相手のプロフィールで、影響を確かめてからブロックし、解除もできる', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/users/dev-user-b', { userId: 'dev-user-a' });

    await chooseFromMenu(user, 'そらさんへの操作', 'ブロックする');
    const confirm = screen.getByRole('group', { name: 'ブロックの確認' });
    expect(confirm).toHaveTextContent('相手に、ブロックしたことは知らされません。');
    expect(confirm).toHaveTextContent(
      'すでにある申請・参加と、これまでの会話は、そのまま残ります。',
    );
    await user.click(within(confirm).getByRole('button', { name: 'ブロックする' }));

    expect(await findToast()).toHaveTextContent('そらさんをブロックしました。');
    expect(db.blocks).toMatchObject([{ blockerId: 'dev-user-a', blockedId: 'dev-user-b' }]);
    expect(screen.getByText('この相手をブロックしています。')).toBeInTheDocument();

    // ブロック中は、メニューに通報だけを出す
    await user.click(screen.getByRole('button', { name: 'そらさんへの操作' }));
    expect(screen.queryByRole('button', { name: 'ブロックする' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '通報する' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'ブロックを解除する' }));
    expect(await findToast()).toHaveTextContent('ブロックを解除しました。');
    expect(db.blocks).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'そらさんへの操作' }));
    expect(screen.getByRole('button', { name: 'ブロックする' })).toBeInTheDocument();
  });

  it('ブロックの確認は、やめると何もしない', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/users/dev-user-b', { userId: 'dev-user-a' });

    await chooseFromMenu(user, 'そらさんへの操作', 'ブロックする');
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.queryByRole('group', { name: 'ブロックの確認' })).not.toBeInTheDocument();
    expect(db.blocks).toEqual([]);
  });

  it('自分のプロフィールには、ブロックを出さない', async () => {
    renderApp('/users/dev-user-a', { userId: 'dev-user-a' });

    expect(await screen.findByRole('heading', { level: 1, name: 'あおい' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ブロック|への操作/ })).not.toBeInTheDocument();
  });

  it('ブロックされた側のプロフィールには、ブロックされたことを示さない', async () => {
    const { db } = renderApp('/users/dev-user-b', { userId: 'dev-user-a' });
    db.blocks.push({ blockerId: 'dev-user-b', blockedId: 'dev-user-a', createdAt: new Date() });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'そらさんへの操作' }));
    expect(screen.getByRole('button', { name: 'ブロックする' })).toBeInTheDocument();
    expect(screen.queryByText(/ブロックしています|ブロックされ/)).not.toBeInTheDocument();
  });

  it('会話からもブロックでき、その後は送信の代わりに解除の場所を示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });

    await chooseFromMenu(user, 'この会話の操作', 'ブロックする');
    await user.click(
      within(screen.getByRole('group', { name: 'ブロックの確認' })).getByRole('button', {
        name: 'ブロックする',
      }),
    );

    expect(
      await screen.findByText(/この相手をブロックしているため、送信できません。/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('メッセージ')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '相手のプロフィール' })).toHaveAttribute(
      'href',
      '/users/dev-user-b',
    );
    // 会話の中では解除しない（解除は相手のプロフィール、M-12）
    expect(screen.queryByRole('button', { name: 'ブロックを解除する' })).not.toBeInTheDocument();
    // これまでの会話は読める
    expect(screen.getByText('ありがとうございます。申請してみます。')).toBeInTheDocument();
    expect(db.blocks).toHaveLength(1);
  });

  it('ブロックされた側が送信すると、「送信できません」とだけ示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });
    db.blocks.push({ blockerId: 'dev-user-b', blockedId: 'dev-user-a', createdAt: new Date() });

    await user.type(await screen.findByLabelText('メッセージ'), 'こんにちは');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^送信できません$/);
    expect(screen.getByLabelText('メッセージ')).toHaveValue('こんにちは');
  });

  it('ブロックされた側が申請すると、「申請できません」とだけ示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp(`/events/${HOSTED_EVENT}`, { userId: 'dev-user-a' });
    db.blocks.push({ blockerId: HOST, blockedId: 'dev-user-a', createdAt: new Date() });

    await user.click(await findFirstButton('参加を申請する'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^申請できません$/);
  });

  it('ブロックの間は、新しく質問を始められず、「送信できません」とだけ示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/events/dev-b-full', { userId: 'dev-user-a' });
    db.blocks.push({ blockerId: HOST, blockedId: 'dev-user-a', createdAt: new Date() });

    await user.click(await screen.findByRole('button', { name: '主催者に質問する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^送信できません$/);
  });
});

describe('回数の上限（MSG-05・SAFE-09）', () => {
  it('送信の上限に達したら、上限を示し、入力を残す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/conversations/dev-conv-question', { userId: 'dev-user-a' });
    for (let i = 0; i < 10; i += 1) {
      db.messages.push({
        id: `recent-${i}`,
        seq: 1000 + i,
        conversationId: 'dev-conv-approved',
        senderId: 'dev-user-a',
        body: 'よろしくお願いします',
        clientRequestId: `recent-${i}`,
        createdAt: new Date(),
      });
    }

    await user.type(await screen.findByLabelText('メッセージ'), 'もう1通');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '送信は、1分間に10通・1時間に60通までです。時間をおいてお試しください。',
    );
    expect(screen.getByLabelText('メッセージ')).toHaveValue('もう1通');
  });

  it('新しい会話の上限に達したら、上限を示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/events/dev-b-full', { userId: 'dev-user-a' });
    for (let i = 0; i < 10; i += 1) {
      db.conversations.push({
        id: `recent-${i}`,
        eventId: 'dev-ongoing',
        hostId: HOST,
        inquirerId: 'dev-user-a',
        startedBy: 'dev-user-a',
        createdAt: new Date(),
        lastMessageAt: null,
        hostLastReadSeq: 0,
        inquirerLastReadSeq: 0,
      });
    }

    await user.click(await screen.findByRole('button', { name: '主催者に質問する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '新しい会話を始められるのは、24時間に10件までです。時間をおいてお試しください。',
    );
  });
});

describe('「未読あり」（M-09）', () => {
  it('会話一覧に、相手から未読のメッセージがある会話だけ示し、開くと消える', async () => {
    const user = userEvent.setup();
    renderApp('/conversations', { userId: 'dev-user-a' });

    const list = await screen.findByRole('list', { name: '会話の一覧' });
    expect(within(list).getAllByText('未読あり')).toHaveLength(1);
    const unread = within(list).getByRole('link', { name: /未読あり/ });
    expect(unread).toHaveTextContent('ゆい');

    await user.click(unread);
    expect(await screen.findByRole('heading', { level: 1, name: 'ゆい' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '会話一覧に戻る' }));

    const after = await screen.findByRole('list', { name: '会話の一覧' });
    await waitFor(() => {
      expect(within(after).queryByText('未読あり')).not.toBeInTheDocument();
    });
  });

  it('PCでは、会話を開くと左の一覧からも消える', async () => {
    asPc();
    try {
      renderApp('/conversations/dev-conv-approved', { userId: 'dev-user-a' });

      const list = await screen.findByRole('list', { name: '会話の一覧' });
      await waitFor(() => {
        expect(within(list).queryByText('未読あり')).not.toBeInTheDocument();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('相手には、自分が読んだかどうかを示さない', async () => {
    const user = userEvent.setup();
    const { switchUser } = renderApp('/conversations/dev-conv-approved', {
      userId: 'dev-user-a',
    });
    await screen.findByRole('heading', { level: 1, name: 'ゆい' });

    switchUser('dev-host-yui');
    await user.click(await screen.findByRole('button', { name: '会話一覧に戻る' }));
    await screen.findByRole('list', { name: '会話の一覧' });
    expect(screen.queryByText(/既読|読みました/)).not.toBeInTheDocument();
  });
});
