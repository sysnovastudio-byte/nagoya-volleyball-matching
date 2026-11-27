import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { chooseFromMenu, findToast, renderApp } from '../test/renderApp';

const A = 'dev-user-a';
const B = 'dev-user-b';
const SUSPENDED = 'dev-user-suspended';
const ADMIN = 'dev-admin';

describe('通報（SCR-019、SAFE-01〜03）', () => {
  it('プロフィールの「…」から通報し、受け付けたら元の画面に戻る', async () => {
    const user = userEvent.setup();
    const { db, router } = renderApp(`/users/${B}`, { userId: A });

    await user.click(await screen.findByRole('button', { name: 'そらさんへの操作' }));
    await user.click(screen.getByRole('link', { name: '通報する' }));

    expect(await screen.findByRole('heading', { level: 1, name: '通報する' })).toBeInTheDocument();
    // 緊急時の案内（docs/11の4-3）
    expect(screen.getByRole('complementary', { name: '身の危険を感じたときは' })).toHaveTextContent(
      '110番',
    );
    expect(screen.getByText('そら')).toBeInTheDocument();

    // 理由は必須
    await user.click(screen.getByRole('button', { name: '通報する' }));
    expect(screen.getByText('理由を選んでください。')).toBeInTheDocument();
    expect(db.reports.filter((report) => report.reporterId === A)).toEqual([]);

    await user.click(screen.getByRole('radio', { name: '勧誘・宣伝' }));
    await user.type(screen.getByLabelText(/補足/), '別の会への勧誘がありました。');
    await user.click(screen.getByRole('button', { name: '通報する' }));

    expect(await findToast()).toHaveTextContent('通報を受け付けました。');
    expect(router.state.location.pathname).toBe(`/users/${B}`);
    expect(db.reports.filter((report) => report.reporterId === A)).toMatchObject([
      { targetKind: 'user', reason: 'solicitation', detail: '別の会への勧誘がありました。' },
    ]);
  });

  it('同じ対象への、対応が終わっていない通報があれば、受け付け済みと示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp(`/report/user/${B}`, { userId: A });
    const [seed] = db.reports;
    if (!seed) throw new Error('通報のダミーがありません');
    db.reports.push({
      ...seed,
      id: 'earlier',
      reporterId: A,
      subjectUserId: B,
      targetKind: 'user',
      targetId: B,
      status: 'open',
    });

    await user.click(await screen.findByRole('radio', { name: '迷惑行為・嫌がらせ' }));
    await user.click(screen.getByRole('button', { name: '通報する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この対象への通報は、すでに受け付けています。',
    );
    expect(db.reports.filter((report) => report.reporterId === A)).toHaveLength(1);
  });

  it('補足は500文字まで', async () => {
    const user = userEvent.setup();
    const { db } = renderApp(`/report/user/${B}`, { userId: A });

    await user.click(await screen.findByRole('radio', { name: 'その他' }));
    await user.click(screen.getByLabelText(/補足/));
    await user.paste('あ'.repeat(501));
    await user.click(screen.getByRole('button', { name: '通報する' }));

    expect(screen.getByText('補足は500文字以内にしてください。')).toBeInTheDocument();
    expect(db.reports.filter((report) => report.reporterId === A)).toEqual([]);
  });

  it('24時間に10件を超えると、上限を示す', async () => {
    const user = userEvent.setup();
    const { db } = renderApp(`/report/user/${B}`, { userId: A });
    for (let index = 0; index < 10; index += 1) {
      db.reports.push({
        id: `limit-${index}`,
        reporterId: A,
        subjectUserId: 'dev-host-haru',
        targetKind: 'event',
        targetId: `limit-${index}`,
        reason: 'other',
        detail: null,
        status: 'dismissed',
        snapshot: { kind: 'event', title: '', description: null },
        handledBy: null,
        handledAt: null,
        resolutionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await user.click(await screen.findByRole('radio', { name: 'その他' }));
    await user.click(screen.getByRole('button', { name: '通報する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通報できるのは、24時間に10件までです。',
    );
  });

  it('会話の「…」から、相手のメッセージだけを選んで通報できる', async () => {
    const user = userEvent.setup();
    const { db, router } = renderApp('/conversations/dev-conv-question', { userId: A });

    await chooseFromMenu(user, 'この会話の操作', 'メッセージを通報する');
    expect(screen.getByText('通報するメッセージを選んでください。')).toBeInTheDocument();
    // 相手（利用者B）のメッセージは1通だけ
    const links = screen.getAllByRole('link', { name: 'このメッセージを通報する' });
    expect(links).toHaveLength(1);
    await user.click(links[0] as HTMLElement);

    const quoted = await screen.findByText(/久しぶりの方も多いので大丈夫です/);
    expect(quoted.tagName).toBe('BLOCKQUOTE');
    await user.click(screen.getByRole('radio', { name: '出会い目的' }));
    await user.click(screen.getByRole('button', { name: '通報する' }));

    expect(await findToast()).toHaveTextContent('通報を受け付けました。');
    expect(router.state.location.pathname).toBe('/conversations/dev-conv-question');
    expect(db.reports.filter((report) => report.reporterId === A)).toMatchObject([
      { targetKind: 'message', subjectUserId: B, snapshot: { kind: 'message' } },
    ]);
  });

  it('選ぶのをやめると、通報の入口を消す', async () => {
    const user = userEvent.setup();
    renderApp('/conversations/dev-conv-question', { userId: A });

    await chooseFromMenu(user, 'この会話の操作', 'メッセージを通報する');
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(
      screen.queryByRole('link', { name: 'このメッセージを通報する' }),
    ).not.toBeInTheDocument();
  });

  it('募集の詳細からも通報できる。主催者と未ログインには出さない', async () => {
    const { switchUser } = renderApp('/events/dev-beginner-afternoon', { userId: A });

    const link = await screen.findByRole('link', { name: 'この募集を通報する' });
    expect(link).toHaveAttribute('href', '/report/event/dev-beginner-afternoon');

    switchUser(B);
    await screen.findAllByRole('link', { name: '申請者を見る' });
    expect(screen.queryByRole('link', { name: 'この募集を通報する' })).not.toBeInTheDocument();

    switchUser(null);
    await screen.findAllByRole('link', { name: 'ログインして申請する' });
    expect(screen.queryByRole('link', { name: 'この募集を通報する' })).not.toBeInTheDocument();
  });

  it('通報できない対象は、理由を分けずに示す', async () => {
    renderApp(`/report/user/${A}`, { userId: A });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'この対象は通報できません' }),
    ).toBeInTheDocument();
  });
});

describe('管理者・利用停止中の人（docs/11の4-1・4-2）', () => {
  it('利用停止中の人には、停止中であることと問い合わせ先を示し、一般の画面を見せない', async () => {
    renderApp('/activity', { userId: SUSPENDED });

    expect(
      await screen.findByRole('heading', { level: 1, name: '利用停止中です' }),
    ).toBeInTheDocument();
    // 問い合わせ先は、プライバシーポリシー（SCR-024）に示す
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: '設定（ログアウト）へ' })).toHaveAttribute(
      'href',
      '/settings',
    );
    // 上部の帯にも示し、一般の利用者の移動は出さない
    expect(
      screen.getByText('利用停止中です。公開されている募集の閲覧と、ログアウトだけができます。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '主な移動' })).not.toBeInTheDocument();
  });

  it('利用停止中の人は、募集を見られるが申請・質問・通報はできない', async () => {
    renderApp('/events/dev-beginner-afternoon', { userId: SUSPENDED });

    expect(
      (await screen.findAllByText('利用停止中のため、申請・質問などの操作はできません。')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '参加を申請する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '主催者に質問する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'この募集を通報する' })).not.toBeInTheDocument();
  });

  it('管理者は、一般の画面の代わりに案内を示し、申請できない', async () => {
    renderApp('/conversations', { userId: ADMIN });

    expect(
      await screen.findByRole('heading', { level: 1, name: '管理用のアカウントです' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '設定へ' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('navigation', { name: '主な移動' })).not.toBeInTheDocument();
  });

  it('管理者は、募集の詳細で申請できない', async () => {
    renderApp('/events/dev-beginner-afternoon', { userId: ADMIN });

    expect(
      (
        await screen.findAllByText(
          '管理用のアカウントでは、申請・質問などの一般の操作はできません。',
        )
      ).length,
    ).toBeGreaterThan(0);
    const actions = screen.getByRole('complementary', { name: '開催の情報と申し込み' });
    expect(within(actions).queryByRole('button')).not.toBeInTheDocument();
  });
});
