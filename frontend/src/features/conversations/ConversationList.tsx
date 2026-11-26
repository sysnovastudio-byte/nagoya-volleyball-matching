import { Link } from 'react-router';
import type { Resource } from '../../app/useResource';
import { Button } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { formatDateTimeRange } from '../events/format';
import { Avatar } from '../profiles/Avatar';
import { displayName } from '../profiles/format';
import { conversationEventTitle, shortDateTime } from './format';
import type { ConversationSummary } from './types';

interface ConversationListProps {
  result: Resource<ConversationSummary[]>;
  selectedId: string | null;
  onRetry: () => void;
  onRefresh: () => void;
}

/** SCR-010 会話一覧。自分が当事者の会話だけ（窓口が決める）。 */
export function ConversationList({
  result,
  selectedId,
  onRetry,
  onRefresh,
}: ConversationListProps) {
  return (
    <section aria-labelledby="conversation-list-heading" className="px-4 py-6 lg:p-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 id="conversation-list-heading" className="text-2xl font-bold">
          会話
        </h1>
        {/* 自動更新（M-07）は作らないため、手動で更新する */}
        <Button variant="text" size="small" onClick={onRefresh}>
          更新する
        </Button>
      </div>
      <ListBody result={result} selectedId={selectedId} onRetry={onRetry} />
    </section>
  );
}

function ListBody({
  result,
  selectedId,
  onRetry,
}: Pick<ConversationListProps, 'result' | 'selectedId' | 'onRetry'>) {
  if (result.status === 'loading') {
    return (
      <p role="status" className="py-6 text-center text-muted">
        会話を読み込んでいます
      </p>
    );
  }
  if (result.status === 'error') {
    return (
      <StatusMessage title="会話を読み込めませんでした" role="alert">
        <p>通信の状態を確認して、もう一度お試しください。</p>
        <Button onClick={onRetry}>もう一度読み込む</Button>
      </StatusMessage>
    );
  }
  if (result.value.length === 0) {
    return (
      <StatusMessage title="会話はまだありません">
        <p>募集の詳細から、主催者に質問できます。</p>
      </StatusMessage>
    );
  }
  return (
    <ul aria-label="会話の一覧" className="flex flex-col gap-2">
      {result.value.map((conversation) => (
        <li key={conversation.id}>
          <ConversationItem conversation={conversation} selected={conversation.id === selectedId} />
        </li>
      ))}
    </ul>
  );
}

function ConversationItem({
  conversation,
  selected,
}: {
  conversation: ConversationSummary;
  selected: boolean;
}) {
  const { event } = conversation;
  return (
    <Link
      to={`/conversations/${conversation.id}`}
      aria-current={selected ? 'page' : undefined}
      className={`flex min-h-16 gap-3 rounded-2xl border p-3 hover:border-main ${
        selected ? 'border-2 border-main bg-main-tint' : 'border-line bg-surface'
      }`}
    >
      <Avatar />
      <span className="flex min-w-0 grow flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">{displayName(conversation.partner)}</span>
          <span className="shrink-0 text-sm text-muted">
            {conversation.lastMessageAt
              ? shortDateTime(conversation.lastMessageAt)
              : 'メッセージなし'}
          </span>
        </span>
        <span className="truncate text-sub">{conversationEventTitle(event)}</span>
        <span className="text-sm text-muted">
          {formatDateTimeRange(event.startsAt, event.endsAt)}
        </span>
        {/* 「未読あり」（M-09、未承認）を加える場合は、この行に札を置く */}
      </span>
    </Link>
  );
}
