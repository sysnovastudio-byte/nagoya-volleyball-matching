import { useState } from 'react';
import { useToast } from '../../app/toastContext';
import { Button } from '../../components/ui/Button';
import type { EventState } from '../events/types';
import { useApplicationRepository } from './repositoryContext';
import { MAX_ATTEMPTS, type ApplicationStatus, type OwnActionRejection } from './types';

/** キャンセル・取り下げができる募集の状態。開催開始前で、中止・非表示でない（docs/06の14-3）。 */
export function canChangeOwnApplication(state: EventState) {
  return state === 'open' || state === 'full' || state === 'closed';
}

const ERRORS: Record<OwnActionRejection, string> = {
  notFound: '申請が見つかりませんでした。',
  invalidState: '申請の状態が変わったため、操作できませんでした。',
  notAccepting: '開催が始まったか、募集が中止されたため、操作できませんでした。',
};

interface OwnApplicationActionsProps {
  applicationId: string;
  status: ApplicationStatus;
  eventState: EventState;
  /** 操作の後に、表示を読み込み直す */
  onChanged: () => void;
}

/**
 * 自分の申請の取り下げ（承認待ち、CND-10）と、参加のキャンセル（承認済み、APP-08）。
 * どちらも確認を挟む（docs/10の11-3）。押し間違いを防ぐため、文字だけのボタンで控えめに置く。
 */
export function OwnApplicationActions({
  applicationId,
  status,
  eventState,
  onChanged,
}: OwnApplicationActionsProps) {
  const repository = useApplicationRepository();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canChangeOwnApplication(eventState)) return null;
  if (status !== 'pending' && status !== 'approved') return null;
  const isCancel = status === 'approved';

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = isCancel
        ? await repository.cancelParticipation(applicationId)
        : await repository.retractApplication(applicationId);
      if (result.status === 'done') {
        toast(isCancel ? '参加をキャンセルしました。' : '申請を取り下げました。');
        setConfirming(false);
      } else {
        setError(ERRORS[result.reason]);
      }
      onChanged();
    } catch {
      setError('操作できませんでした。通信の状態を確認して、もう一度お試しください。');
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
          aria-label={isCancel ? '参加のキャンセルの確認' : '申請の取り下げの確認'}
          className="rounded-xl border border-danger bg-surface p-3 text-left"
        >
          <p className="mb-2 font-bold">
            {isCancel
              ? 'キャンセルすると、開催場所住所を見られなくなり、主催者に知らせます。キャンセルしますか？'
              : '取り下げると、この申請は主催者に判断されません。取り下げますか？'}
          </p>
          <p className="mb-3 text-sub">
            もう一度申請することはできます（同じ募集への申請は合計{MAX_ATTEMPTS}回まで）。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={() => {
                void submit();
              }}
            >
              {busy
                ? isCancel
                  ? 'キャンセルしています'
                  : '取り下げています'
                : isCancel
                  ? '参加をキャンセルする'
                  : '申請を取り下げる'}
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
          {isCancel ? '参加をキャンセルする' : '申請を取り下げる'}
        </Button>
      )}
    </div>
  );
}
