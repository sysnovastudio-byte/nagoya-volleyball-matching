import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { findToast, renderApp } from '../test/renderApp';

const ADMIN = 'dev-admin';
const A = 'dev-user-a';

describe('管理の画面の入口（docs/11の4-1）', () => {
  it('管理者の設定にだけ、通報管理と利用者管理の入口を示す', async () => {
    const { switchUser } = renderApp('/settings', { userId: ADMIN });

    const admin = await screen.findByRole('region', { name: '管理' });
    expect(within(admin).getByRole('link', { name: '通報管理' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
    expect(within(admin).getByRole('link', { name: '利用者管理' })).toHaveAttribute(
      'href',
      '/admin/users',
    );

    switchUser(A);
    await screen.findByRole('button', { name: 'ログアウト' });
    expect(screen.queryByRole('region', { name: '管理' })).not.toBeInTheDocument();
  });

  it('多要素認証が「未」なら、管理の画面の代わりに案内を示す', async () => {
    const { session } = renderApp('/admin/reports', { userId: ADMIN, mfaVerified: false });

    expect(
      await screen.findByRole('heading', { level: 1, name: '多要素認証が必要です' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/未対応/)).not.toBeInTheDocument();

    act(() => {
      session.setMfaVerified(true);
    });
    expect(await screen.findByRole('heading', { level: 1, name: '通報管理' })).toBeInTheDocument();
  });

  it('一般の利用者には、管理の画面があることを示さない', async () => {
    renderApp('/admin/users', { userId: A });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ページが見つかりません' }),
    ).toBeInTheDocument();
  });
});

describe('通報管理（SCR-021、SAFE-06・07）', () => {
  it('未対応の件数と一覧を示し、状態で絞り込める', async () => {
    const user = userEvent.setup();
    renderApp('/admin/reports', { userId: ADMIN });

    expect(
      await screen.findByText((_, element) => element?.textContent === '未対応 2件'),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: '通報の一覧' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    // 1日以上たった未対応の通報に印を付ける
    expect(within(list).getByText('1日以上経過')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '対応済み' }));
    expect(
      await screen.findByRole('link', { name: /メッセージの通報：出会い目的/ }),
    ).toBeInTheDocument();
  });

  it('控えを確かめ、対応中から対応済みにする。終わった通報は戻せない', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/admin/reports/dev-report-2', { userId: ADMIN });

    const snapshot = await screen.findByRole('region', { name: '控え（通報したときの内容）' });
    expect(snapshot).toHaveTextContent('別のサービスの練習会にも参加しませんか。');
    expect(screen.getByRole('region', { name: '今のプロフィール' })).toHaveTextContent('なし');

    await user.click(screen.getByRole('button', { name: '対応中にする' }));
    expect(await findToast()).toHaveTextContent('「対応中」にしました。');
    await user.type(screen.getByRole('textbox', { name: /対応の記録/ }), '本人に注意した。');
    await user.click(await screen.findByRole('button', { name: '対応済みにする' }));

    expect(await screen.findByText('対応が終わった通報は、状態を戻せません。')).toBeInTheDocument();
    expect(db.reports.find((report) => report.id === 'dev-report-2')).toMatchObject({
      status: 'resolved',
      resolutionNote: '本人に注意した。',
    });
  });

  it('募集の通報から、確認してから募集を非表示にし、同時に中止する', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/admin/reports/dev-report-1', { userId: ADMIN });

    const hide = await screen.findByRole('region', { name: '募集の非表示' });
    expect(hide).toHaveTextContent('開催前のため、同時に中止します。');
    expect(hide).toHaveTextContent('非表示は戻せません。');
    await user.click(within(hide).getByRole('button', { name: 'この募集を非表示にする' }));
    const confirm = screen.getByRole('group', { name: '非表示の確認' });
    await user.click(within(confirm).getByRole('button', { name: '非表示にする' }));

    expect(await findToast()).toHaveTextContent('募集を非表示にし、中止しました。');
    expect(await screen.findByRole('region', { name: '今の募集' })).toHaveTextContent('非表示');
    expect(screen.queryByRole('region', { name: '募集の非表示' })).not.toBeInTheDocument();
    expect(db.events.find((event) => event.id === 'dev-weekday-night')).toMatchObject({
      hidden: true,
      status: 'cancelled',
    });
  });

  it('通報された人の利用者管理へ移れる', async () => {
    const user = userEvent.setup();
    renderApp('/admin/reports/dev-report-2', { userId: ADMIN });

    await user.click(await screen.findByRole('link', { name: '利用者管理で見る' }));

    expect(await screen.findByRole('heading', { level: 2, name: /つばさ/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'きっかけの通報へ戻る' })).toHaveAttribute(
      'href',
      '/admin/reports/dev-report-2',
    );
  });
});

describe('利用者管理（SCR-022、SAFE-05・CND-07）', () => {
  it('ニックネームで探し、影響を確かめてから停止し、解除する', async () => {
    const user = userEvent.setup();
    const { db } = renderApp('/admin/users', { userId: ADMIN });

    await user.type(await screen.findByRole('searchbox', { name: 'ニックネーム' }), 'あおい');
    await user.click(screen.getByRole('button', { name: '検索' }));
    await user.click(await screen.findByRole('link', { name: /あおい/ }));

    const suspend = await screen.findByRole('region', { name: '利用停止' });
    expect(suspend).toHaveTextContent('開催前の参加 1件');
    expect(suspend).toHaveTextContent('キャンセルと中止は、停止を解除しても戻りません。');

    // 理由の分類と補足は必須
    await user.click(within(suspend).getByRole('button', { name: '利用停止にする' }));
    expect(within(suspend).getByText('理由の分類を選んでください。')).toBeInTheDocument();
    expect(within(suspend).getByText('補足を入力してください。')).toBeInTheDocument();

    await user.selectOptions(within(suspend).getByRole('combobox'), '迷惑行為・嫌がらせ');
    await user.type(within(suspend).getByLabelText(/補足/), '嫌がらせが続いたため。');
    await user.click(within(suspend).getByRole('button', { name: '利用停止にする' }));
    const confirm = screen.getByRole('group', { name: '利用停止の確認' });
    await user.click(within(confirm).getByRole('button', { name: '利用停止にする' }));

    expect(await findToast()).toHaveTextContent(
      'あおいさんを利用停止にしました。参加のキャンセル1件・申請の取り下げ1件・募集の中止0件。',
    );
    const unsuspend = await screen.findByRole('region', { name: '停止の解除' });
    expect(screen.getByRole('list', { name: '措置の履歴' })).toHaveTextContent('利用停止');
    expect(db.users.find((item) => item.id === A)?.status).toBe('suspended');

    await user.type(within(unsuspend).getByLabelText(/補足/), '誤りだったため。');
    await user.click(within(unsuspend).getByRole('button', { name: '停止を解除する' }));
    expect(await screen.findByRole('region', { name: '利用停止' })).toBeInTheDocument();
    expect(db.users.find((item) => item.id === A)?.status).toBe('active');
  });

  it('停止中の人は、検索の結果と状態に「利用停止中」と示す', async () => {
    renderApp('/admin/users?q=かいと', { userId: ADMIN });

    const result = await screen.findByRole('list', { name: '検索の結果' });
    expect(result).toHaveTextContent('かいと');
    expect(result).toHaveTextContent('利用停止中');
  });
});
