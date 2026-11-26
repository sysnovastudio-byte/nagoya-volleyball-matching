import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { loginPath, profileEditPath } from '../auth/loginRedirect';
import { useViewer } from '../auth/sessionContext';
import type { EventDetail } from '../events/types';
import { sendableUntil } from './messageRules';
import { useConversationRepository } from './repositoryContext';

/**
 * 主催者との会話を開くか（表示のためだけの判定）。開始できるかは窓口（本番はDB）が決める（DB-10）。
 * - 申請前・承認待ちなど：開催開始まで。中止の募集では出さない
 * - 承認済み：送信できる期間内（終了日時の7日後まで）
 * - 主催者には、自分の募集で出さない（主催者からの開始 MSG-06 は作らない）
 */
export function canOpenHostConversation(event: EventDetail, now: Date) {
  if (event.isHost) return false;
  if (event.myApplication?.status === 'approved') return now <= sendableUntil(event.endsAt);
  return event.state !== 'cancelled' && now < new Date(event.startsAt);
}

/** SCR-006 の「主催者に質問する」。すでに会話があれば、その会話を開く。 */
export function StartConversationButton({ event }: { event: EventDetail }) {
  const repository = useConversationRepository();
  const viewer = useViewer();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `${pathname}${search}`;
  const approved = event.myApplication?.status === 'approved';
  const label = approved ? '主催者に連絡する' : '主催者に質問する';

  if (!canOpenHostConversation(event, new Date())) return null;
  if (!viewer) {
    return (
      <ButtonLink to={loginPath(here)} variant="secondary" size="small">
        ログインして{label}
      </ButtonLink>
    );
  }
  if (!viewer.profile) {
    return (
      <ButtonLink to={profileEditPath(here)} variant="secondary" size="small">
        プロフィールを登録して{label}
      </ButtonLink>
    );
  }

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.startConversation(event.id);
      if (result.status === 'opened') {
        await navigate(`/conversations/${result.conversationId}`);
        return;
      }
      // 理由は示さない（Q-20）
      setError('今は会話を始められません。');
    } catch {
      setError('会話を開けませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        size="small"
        disabled={busy}
        onClick={() => {
          void start();
        }}
      >
        {busy ? '開いています' : label}
      </Button>
      {error && (
        <p role="alert" className="font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
