import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastProvider';
import { TOAST_DURATION_MS, useToast } from './toastContext';

function Trigger({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(text);
      }}
    >
      出す
    </button>
  );
}

describe('自動的に消える通知', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('読み上げに伝わる場所に出し、3秒ほどで消える', () => {
    render(
      <ToastProvider>
        <Trigger text="参加を申請しました。" />
      </ToastProvider>,
    );
    const region = screen.getByRole('status', { name: 'お知らせ' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: '出す' }));
    expect(region).toHaveTextContent('参加を申請しました。');

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(region).toHaveTextContent('参加を申請しました。');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region).toBeEmptyDOMElement();
  });

  it('続けて出すと、新しい文に替わり、時間を数え直す', () => {
    render(
      <ToastProvider>
        <Trigger text="承認しました。" />
      </ToastProvider>,
    );
    const region = screen.getByRole('status', { name: 'お知らせ' });
    fireEvent.click(screen.getByRole('button', { name: '出す' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole('button', { name: '出す' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(region).toHaveTextContent('承認しました。');
  });
});
