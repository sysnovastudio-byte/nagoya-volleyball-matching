import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { REJECTED_MESSAGES, sendableUntil } from './messageRules';
import { useConversationRepository } from './repositoryContext';

interface StartApplicantConversationButtonProps {
  applicationId: string;
  /** 相手のニックネーム。読み上げで、だれとの会話かを示す */
  name: string;
  /** 募集の終了日時。送信できる期間（終了の7日後まで）を過ぎたら出さない */
  eventEndsAt: string;
}

/**
 * SCR-008 の「会話を始める」（MSG-06）。承認待ち・承認済みの申請者にだけ出す。
 * すでに会話があれば、その会話を開く。開始できるかは窓口（本番はDB）が決める（DB-10）。
 */
export function StartApplicantConversationButton({
  applicationId,
  name,
  eventEndsAt,
}: StartApplicantConversationButtonProps) {
  const repository = useConversationRepository();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (new Date() > sendableUntil(eventEndsAt)) return null;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.startConversationWithApplicant(applicationId);
      if (result.status === 'opened') {
        await navigate(`/conversations/${result.conversationId}`);
        return;
      }
      // 期限・ブロックなどの理由は示さない（Q-20）。回数の上限だけは案内する
      setError(
        result.reason === 'rateLimited'
          ? REJECTED_MESSAGES.startRateLimited
          : REJECTED_MESSAGES.notAllowed,
      );
    } catch {
      setError('会話を開けませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="small"
        disabled={busy}
        aria-label={`${name}さんと会話を始める`}
        onClick={() => {
          void start();
        }}
      >
        {busy ? '開いています' : '会話を始める'}
      </Button>
      {error && (
        <p role="alert" className="font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
