import { useParams } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { PC_QUERY, useMediaQuery } from '../../app/useMediaQuery';
import { useResource } from '../../app/useResource';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { useConversationRepository } from './repositoryContext';

/**
 * SCR-010 会話一覧・SCR-011 会話（MSG-01〜03）。
 * PC（1024px以上）は左に一覧、右に会話の2列。スマートフォンは一覧と会話を別の画面にする（docs/11の5-1）。
 * 自動更新（M-07、公開後）は作らず、手動で更新するボタンを置く。一覧には会話ごとの「未読あり」（M-09）を示す。
 */
export function ConversationsPage() {
  const { conversationId } = useParams();
  const isPc = useMediaQuery(PC_QUERY);
  const repository = useConversationRepository();
  const list = useResource('my-conversations', () => repository.listMine());
  useDocumentTitle('会話');

  const listPanel = (
    <ConversationList
      result={list.result}
      selectedId={conversationId ?? null}
      onRetry={list.retry}
      onRefresh={list.reload}
    />
  );
  const view = conversationId && (
    <ConversationView
      // 別の会話へ移ったときに、入力中の内容や誤りを持ち越さない
      key={conversationId}
      conversationId={conversationId}
      onChanged={list.reload}
    />
  );

  if (!isPc) return view || listPanel;

  return (
    <div className="mx-auto grid w-full max-w-288 grow grid-cols-[20rem_minmax(0,1fr)] items-start gap-6 px-4 py-6">
      <div className="sticky top-4">{listPanel}</div>
      {view || (
        <div className="flex min-h-80 items-center justify-center rounded-2xl border border-line bg-surface p-6 text-muted">
          左の一覧から、会話を選んでください。
        </div>
      )}
    </div>
  );
}
