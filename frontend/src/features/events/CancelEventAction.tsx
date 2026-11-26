import { useState } from 'react';
import { useToast } from '../../app/toastContext';
import { Button } from '../../components/ui/Button';
import { useEventRepository } from './repositoryContext';
import type { CancelEventRejection, EventDetail } from './types';

const ERRORS: Record<CancelEventRejection, string> = {
  notFound: 'この募集は見つかりませんでした。',
  notCancellable: '開催が始まったか、すでに中止したため、中止できませんでした。',
};

interface CancelEventActionProps {
  event: EventDetail;
  onChanged: () => void;
}

/**
 * 募集の中止（CND-03）。主催者だけが、開催開始前に行える。元に戻せないため確認を挟む（docs/10の11-3）。
 * MVPでは締切・再開・編集がない（M-02・M-03）ため、主催者の操作は中止だけ。
 */
export function CancelEventAction({ event, onChanged }: CancelEventActionProps) {
  const repository = useEventRepository();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event.isHost) return null;
  if (event.state !== 'open' && event.state !== 'full' && event.state !== 'closed') return null;
  const notified = (event.hostSummary?.approvedCount ?? 0) + (event.hostSummary?.pendingCount ?? 0);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.cancelEvent(event.id);
      if (result.status === 'cancelled') {
        toast('募集を中止しました。');
        setConfirming(false);
      } else {
        setError(ERRORS[result.reason]);
      }
      onChanged();
    } catch {
      setError('中止できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-2">
      {error && (
        <p role="alert" className="font-bold text-danger">
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label="募集の中止の確認"
          className="rounded-xl border border-danger bg-surface p-3 text-left"
        >
          <p className="mb-2 font-bold">中止すると、元に戻せません。中止しますか？</p>
          <ul className="mb-3 list-disc pl-5 text-sub">
            <li>
              {notified > 0
                ? `承認待ち・承認済みの${notified}人に通知します。`
                : '承認待ち・承認済みの人はいないため、通知は送りません。'}
            </li>
            <li>参加者は、くわしい住所を見られなくなります。</li>
            <li>新しい申請と、承認・却下はできなくなります。</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={() => {
                void submit();
              }}
            >
              {busy ? '中止しています' : '募集を中止する'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setConfirming(true);
            setError(null);
          }}
        >
          募集を中止する
        </Button>
      )}
    </div>
  );
}
