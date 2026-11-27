import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDevUser } from '../dev/devDatabase';
import { renderApp } from '../test/renderApp';

const A = 'dev-user-a';
const B = 'dev-user-b';

afterEach(() => {
  vi.useRealTimers();
});

describe('パスワード再設定（SCR-004）', () => {
  it('ログインから申し込み、リンクを開いて新しいパスワードを設定する', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/login');

    await user.click(await screen.findByRole('link', { name: 'パスワードを忘れた場合' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'パスワード再設定' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bot対策の確認' })).toHaveTextContent('未接続');

    await user.click(screen.getByRole('button', { name: '再設定のメールを送る' }));
    expect(screen.getByText('メールアドレスを入力してください。')).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toHaveFocus();

    await user.type(screen.getByLabelText(/メールアドレス/), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: '再設定のメールを送る' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '再設定のメールを送りました' }),
    ).toBeInTheDocument();
    // 登録の有無が分かる文言にしない
    expect(screen.getByText(/登録されていれば/)).toBeInTheDocument();
    expect(screen.queryByText(/登録されていません|見つかりません/)).not.toBeInTheDocument();
    // 送った直後は、もう一度の申し込みを60秒待たせる
    expect(screen.getByRole('button', { name: /あと\d+秒で申し込めます/ })).toBeDisabled();

    await user.click(screen.getByRole('link', { name: '再設定に進むリンク' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '新しいパスワードの設定' }),
    ).toBeInTheDocument();
    expect(session.getUserId()).toBe(A);

    await user.type(screen.getByLabelText(/新しいパスワード/, { selector: 'input' }), 'short');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更する' }));
    expect(screen.getByText('パスワードは10文字以上にしてください。')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/新しいパスワード/, { selector: 'input' }), 'abcdefghij');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更する' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'パスワードを変更しました' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['dev-reset-expired', 'リンクの有効期限が切れています'],
    ['dev-reset-invalid', 'このリンクは使えません'],
    ['', 'このリンクは使えません'],
  ])('リンク %s は「%s」と示し、申し込みへ戻れる', async (token, title) => {
    renderApp(`/password-reset/confirm?token=${token}`);

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '再設定を申し込む' })).toHaveAttribute(
      'href',
      '/password-reset',
    );
    expect(
      screen.queryByLabelText(/新しいパスワード/, { selector: 'input' }),
    ).not.toBeInTheDocument();
  });

  it('ログイン中は、設定からパスワードを変更する。宛先は入力しない', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/settings', { userId: B });

    await user.click(await screen.findByRole('link', { name: /パスワードの変更/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'パスワードの変更' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/メールアドレス/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bot対策の確認' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再設定のメールを送る' }));
    expect(
      await screen.findByText(/登録しているメールアドレスに、パスワード再設定のメールを送りました/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '再設定に進むリンク' }));
    await user.type(
      await screen.findByLabelText(/新しいパスワード/, { selector: 'input' }),
      'abcdefghij',
    );
    await user.click(screen.getByRole('button', { name: 'パスワードを変更する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'パスワードを変更しました' }),
    ).toBeInTheDocument();
    expect(session.getUserId()).toBe(B);
  });

  it('リンクを開いた後に期限が切れたら、変わっていないことを示す', async () => {
    const user = userEvent.setup();
    renderApp('/password-reset/confirm?token=dev-reset-success', {
      auth: {
        verifyPasswordReset: () => Promise.resolve({ status: 'verified' }),
        updatePassword: () => Promise.resolve({ status: 'rejected', reason: 'expired' }),
      },
    });

    await user.type(
      await screen.findByLabelText(/新しいパスワード/, { selector: 'input' }),
      'abcdefghij',
    );
    await user.click(screen.getByRole('button', { name: 'パスワードを変更する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '再設定の期限が切れました' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/パスワードは変わっていません/)).toBeInTheDocument();
  });
});

describe('認証メールの再送（AUTH-05、SCR-003）', () => {
  it('登録の直後は60秒待ち、その後に再送でき、再送するとまた60秒待つ', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderApp('/signup/sent');

    const form = await screen.findByRole('form', { name: '認証メールの再送' });
    expect(within(form).getByRole('button', { name: 'あと60秒で再送できます' })).toBeDisabled();
    // 開発中は、メールの代わりのリンクを示す（今の新規登録と同じ形）
    expect(screen.getByText('メールのリンクを開く（開発用）')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const button = within(form).getByRole('button', { name: '認証メールを再送する' });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(screen.getByText('メールアドレスを入力してください。')).toBeInTheDocument();

    await user.type(within(form).getByLabelText(/メールアドレス/), 'test@example.com');
    await user.click(button);

    // 認証待ちでないアドレスでも同じ文を示す
    expect(await within(form).findByRole('status')).toHaveTextContent(
      '入力したメールアドレスが認証待ちであれば、認証メールを再送しました。',
    );
    expect(within(form).getByRole('button', { name: /あと\d+秒で再送できます/ })).toBeDisabled();
  });

  it('期限切れのリンクから再送でき、再送した後に開発用のリンクを示す', async () => {
    const user = userEvent.setup();
    renderApp('/auth/confirm?token=dev-verify-expired');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'リンクの有効期限が切れています' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('メールのリンクを開く（開発用）')).not.toBeInTheDocument();

    const form = screen.getByRole('form', { name: '認証メールの再送' });
    await user.type(within(form).getByLabelText(/メールアドレス/), 'test@example.com');
    await user.click(within(form).getByRole('button', { name: '認証メールを再送する' }));

    expect(await screen.findByText('メールのリンクを開く（開発用）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '認証に成功するリンク' })).toBeInTheDocument();
  });

  it('ログイン画面の「認証メールが届かない場合」から再送できる', async () => {
    const user = userEvent.setup();
    renderApp('/login');

    await user.click(await screen.findByRole('link', { name: '認証メールが届かない場合' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '認証メールの再送' }),
    ).toBeInTheDocument();
    // 画面の見出しと同じ見出しを、もう1つ置かない
    expect(
      screen.queryByRole('heading', { level: 2, name: '認証メールの再送' }),
    ).not.toBeInTheDocument();

    const form = screen.getByRole('form', { name: '認証メールの再送' });
    await user.type(within(form).getByLabelText(/メールアドレス/), 'test@example.com');
    await user.click(within(form).getByRole('button', { name: '認証メールを再送する' }));

    expect(await within(form).findByRole('status')).toHaveTextContent(
      '入力したメールアドレスが認証待ちであれば、認証メールを再送しました。',
    );
    expect(screen.getByText('メールのリンクを開く（開発用）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログインに戻る' })).toBeInTheDocument();
  });

  it('登録の画面にも、Bot対策の置き場所と未接続の表示がある', async () => {
    renderApp('/signup');

    expect(await screen.findByRole('group', { name: 'Bot対策の確認' })).toHaveTextContent('未接続');
  });
});

describe('退会（SCR-017）', () => {
  it('設定から開き、説明を読み、パスワードを再入力して退会する', async () => {
    const user = userEvent.setup();
    const { db, session } = renderApp('/settings', { userId: A });

    await user.click(await screen.findByRole('link', { name: /^退会/ }));
    expect(await screen.findByRole('heading', { level: 1, name: '退会' })).toBeInTheDocument();
    const effects = await screen.findByRole('region', { name: '退会すると' });
    expect(effects).toHaveTextContent('開催場所住所を、すべて削除します');
    expect(effects).toHaveTextContent('「退会したユーザー」として残ります');
    expect(effects).toHaveTextContent('参加2件、承認待ちの申請1件');

    await user.click(screen.getByRole('button', { name: '退会する' }));
    expect(screen.getByText('パスワードを入力してください。')).toBeInTheDocument();
    expect(session.getUserId()).toBe(A);

    await user.type(screen.getByLabelText(/パスワード/), 'password');
    await user.click(screen.getByRole('button', { name: '退会する' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '退会しました' }),
    ).toBeInTheDocument();
    expect(session.getUserId()).toBeNull();
    expect(findDevUser(db, A)).toBeUndefined();
    // ログアウトした状態の上部の帯になる
    expect(screen.getAllByRole('link', { name: 'ログイン' }).length).toBeGreaterThan(0);
  });

  it('退会した人は、相手の会話で「退会したユーザー」と示す', async () => {
    const user = userEvent.setup();
    const { switchUser, router } = renderApp('/settings/withdraw', { userId: A });

    await user.type(await screen.findByLabelText(/パスワード/), 'password');
    await user.click(screen.getByRole('button', { name: '退会する' }));
    await screen.findByRole('heading', { level: 1, name: '退会しました' });

    switchUser(B);
    await act(() => router.navigate('/conversations'));
    const conversations = await screen.findByRole('list', { name: '会話の一覧' });
    expect(within(conversations).getAllByText('退会したユーザー').length).toBeGreaterThan(0);
  });

  it('パスワードが違えば、退会しない', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/settings/withdraw', {
      userId: A,
      account: {
        withdraw: () => Promise.resolve({ status: 'rejected', reason: 'wrongPassword' }),
      },
    });

    await user.type(await screen.findByLabelText(/パスワード/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '退会する' }));

    expect(await screen.findByText('パスワードが違います。')).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/)).toHaveFocus();
    expect(session.getUserId()).toBe(A);
  });

  it('開催前の募集を主催している人には、その募集を示し、申し込みの欄を出さない', async () => {
    renderApp('/settings/withdraw', { userId: B });

    const notice = await screen.findByRole('region', { name: '今は退会できません' });
    expect(
      within(notice).getByRole('link', { name: 'はじめて歓迎！土曜の午後バレー' }),
    ).toHaveAttribute('href', '/events/dev-beginner-afternoon');
    expect(screen.queryByLabelText(/パスワード/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退会する' })).not.toBeInTheDocument();
  });

  it('利用停止中の人には、問い合わせで受け付けることを示す（M-06）', async () => {
    renderApp('/settings/withdraw', { userId: 'dev-user-suspended' });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '利用停止中は、この画面から退会できません',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.queryByRole('button', { name: '退会する' })).not.toBeInTheDocument();
  });

  it('管理用のアカウントは退会できず、設定にも退会を出さない', async () => {
    renderApp('/settings', { userId: 'dev-admin' });

    expect(await screen.findByRole('link', { name: /パスワードの変更/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^退会/ })).not.toBeInTheDocument();
  });

  it('管理用のアカウントで退会の画面を開くと、退会できないと示す', async () => {
    renderApp('/settings/withdraw', { userId: 'dev-admin' });

    expect(
      await screen.findByRole('heading', { level: 1, name: '管理用のアカウントは退会できません' }),
    ).toBeInTheDocument();
  });

  it('未ログインならログイン画面へ移る', async () => {
    renderApp('/settings/withdraw');

    expect(await screen.findByRole('heading', { level: 1, name: 'ログイン' })).toBeInTheDocument();
  });
});

describe('利用規約（SCR-023）・プライバシーポリシー（SCR-024）', () => {
  it.each([
    [
      '/terms',
      '利用規約',
      '開発中の仮の文章です。実際の規約ではありません。',
      [
        '同意',
        '改定',
        'サービスの位置付け',
        '禁止事項',
        'けが・事故',
        '金銭',
        '利用停止',
        '免責',
        '準拠法・裁判所',
      ],
    ],
    [
      '/privacy',
      'プライバシーポリシー',
      '開発中の仮の文章です。実際のプライバシーポリシーではありません。',
      [
        '取得する情報',
        '目的',
        '第三者への提供',
        '外部サービス',
        '保存期間',
        '本人の請求',
        '問い合わせ先',
        '運営者の表示',
        'Cookieなど',
      ],
    ],
  ])(
    '%s：仮の文章と分かるように示し、項目を見出しだけ並べる',
    async (path, title, warning, items) => {
      renderApp(path);

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByRole('note')).toHaveTextContent(warning);
      expect(screen.getByText('版').nextElementSibling).toHaveTextContent('仮-0');
      expect(screen.getByText('施行日').nextElementSibling).toHaveTextContent('未定');
      expect(
        screen.getByRole('heading', { level: 2, name: '予定している内容（未確認）' }),
      ).toBeInTheDocument();
      const toc = screen.getByRole('navigation', { name: '目次' });
      expect(
        within(toc)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(items);
      expect(
        screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
      ).toEqual(items.map((item, index) => `${index + 1}. ${item}`));
      // 問い合わせ先は仮で、実在のメールアドレスを載せない
      expect(
        screen.getByRole('heading', { level: 2, name: '問い合わせ先（仮）' }),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/@/);
    },
  );

  it('利用規約とプライバシーポリシーは、互いに移れる', async () => {
    const user = userEvent.setup();
    renderApp('/terms');

    await user.click(await screen.findByRole('link', { name: 'プライバシーポリシー' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'プライバシーポリシー' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms');
  });

  it('設定から、規約等へ移れる', async () => {
    renderApp('/settings', { userId: A });

    const legal = await screen.findByRole('region', { name: '規約等' });
    expect(within(legal).getByRole('link', { name: /利用規約/ })).toHaveAttribute('href', '/terms');
    expect(within(legal).getByRole('link', { name: /プライバシーポリシー/ })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
