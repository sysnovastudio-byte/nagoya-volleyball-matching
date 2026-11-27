import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('ログイン中は、パスワードの変更として申し込む。宛先は入力しない', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/password-reset', { userId: B });

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

  it('登録の画面にも、Bot対策の置き場所と未接続の表示がある', async () => {
    renderApp('/signup');

    expect(await screen.findByRole('group', { name: 'Bot対策の確認' })).toHaveTextContent('未接続');
  });
});
