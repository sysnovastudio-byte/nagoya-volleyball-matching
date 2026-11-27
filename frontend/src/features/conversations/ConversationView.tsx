import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useResource } from '../../app/useResource';
import { Button } from '../../components/ui/Button';
import { INPUT_CLASS } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { textLength } from '../../lib/text';
import { formatDateTimeRange } from '../events/format';
import { Avatar } from '../profiles/Avatar';
import { displayName } from '../profiles/format';
import { BlockActions, useBlockState } from '../safety/BlockActions';
import { conversationEventTitle, messageDay, messageTime } from './format';
import { MESSAGE_MAX_LENGTH, REJECTED_MESSAGES, checkMessageBody } from './messageRules';
import { useConversationRepository } from './repositoryContext';
import type { ConversationDetail, Message } from './types';

interface ConversationViewProps {
  conversationId: string;
  /** 送信したとき・読んだときに、一覧の並びと「未読あり」を更新する */
  onChanged: () => void;
}

/**
 * SCR-011 会話。閲覧と送信。編集・削除はできない（docs/11の3-3）。
 * 開いたら、表示したメッセージまで読んだことにする（M-09）。相手には既読を示さない。
 * 相手のブロック（SAFE-04）もここでできる。解除は相手のプロフィールで行う（M-12）。
 */
export function ConversationView({ conversationId, onChanged }: ConversationViewProps) {
  const repository = useConversationRepository();
  const { result, retry, reload } = useResource(`conversation:${conversationId}`, () =>
    repository.getMessages(conversationId),
  );

  if (result.status === 'loading') {
    return (
      <p role="status" className="px-4 py-12 text-center text-muted">
        会話を読み込んでいます
      </p>
    );
  }
  if (result.status === 'error') {
    return (
      <StatusMessage title="会話を読み込めませんでした" headingLevel="h1" role="alert">
        <p>通信の状態を確認して、もう一度お試しください。</p>
        <Button onClick={retry}>もう一度読み込む</Button>
      </StatusMessage>
    );
  }
  // 当事者でない会話は、ない場合と同じに示す
  if (!result.value) {
    return (
      <StatusMessage title="会話が見つかりません" headingLevel="h1">
        <p>会話一覧から、もう一度選んでください。</p>
        <Link to="/conversations" className="font-bold text-main-strong underline">
          会話一覧へ
        </Link>
      </StatusMessage>
    );
  }
  return (
    <Conversation
      detail={result.value}
      onRefresh={reload}
      onRead={onChanged}
      onSent={() => {
        reload();
        onChanged();
      }}
    />
  );
}

interface ConversationProps {
  detail: ConversationDetail;
  onRefresh: () => void;
  /** 読んだことを記録した後に呼ぶ（一覧の「未読あり」を消す） */
  onRead: () => void;
  onSent: () => void;
}

function Conversation({ detail, onRefresh, onRead, onSent }: ConversationProps) {
  const repository = useConversationRepository();
  const { conversation } = detail;
  const { event, partner } = conversation;
  const partnerName = displayName(partner);
  // 自分が相手をブロックしているか。退会した相手は null（操作を出さない）
  const block = useBlockState(partner.userId);
  const readSeq = detail.messages.at(-1)?.seq;
  const { hasUnread } = conversation;
  // 呼び出し元で毎回作られる関数のため、効果の依存に含めない
  const notifyRead = useEffectEvent(onRead);

  useEffect(() => {
    // 未読がある場合だけ、表示した最後のメッセージまで読んだことにする
    if (!hasUnread || readSeq === undefined) return;
    let active = true;
    repository.markRead(conversation.id, readSeq).then(
      () => {
        if (active) notifyRead();
      },
      // 記録できなくても、閲覧は続けられる。次に開いたときに、もう一度記録する
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repository, conversation.id, hasUnread, readSeq]);
  // 送信した直後は、読み込み直す前でも自分のメッセージを示す
  const [sent, setSent] = useState<Message[]>([]);
  const messages = [
    ...detail.messages,
    ...sent.filter((item) => !detail.messages.some((message) => message.id === item.id)),
  ];
  const lastRef = useRef<HTMLLIElement>(null);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    // 最新のメッセージが見える位置に移す。テストの環境にはないため、ある場合だけ呼ぶ
    lastRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastId]);

  return (
    <section
      aria-labelledby="conversation-heading"
      className="flex grow flex-col lg:min-h-[32rem] lg:rounded-2xl lg:border lg:border-line lg:bg-surface"
    >
      <header className="border-b border-line bg-surface px-4 pt-2 pb-3 lg:rounded-t-2xl">
        <div className="flex items-center gap-3">
          <Avatar />
          <div className="flex min-w-0 grow flex-col">
            <h1 id="conversation-heading" className="text-xl font-bold">
              {partner.isWithdrawn ? (
                partnerName
              ) : (
                <Link to={`/users/${partner.userId}`} className="text-main-strong underline">
                  {partnerName}
                </Link>
              )}
            </h1>
            <p className="truncate text-sub">
              {event.hidden ? (
                conversationEventTitle(event)
              ) : (
                <Link to={`/events/${event.id}`} className="underline">
                  {event.title}
                </Link>
              )}
            </p>
            <p className="text-sm text-muted">
              {formatDateTimeRange(event.startsAt, event.endsAt)}
            </p>
          </div>
          {/* 自動更新（M-07）は作らないため、手動で更新する */}
          <Button variant="text" size="small" onClick={onRefresh}>
            更新する
          </Button>
        </div>
        {block.blockedByMe === false && (
          <div className="mt-2 flex justify-end">
            <BlockActions
              userId={partner.userId}
              name={partnerName}
              blockedByMe={false}
              allowUnblock={false}
              onChanged={block.reload}
            />
          </div>
        )}
      </header>

      <div className="grow px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-muted">まだメッセージはありません。</p>
        ) : (
          <ol aria-label="メッセージの一覧" className="flex flex-col gap-3">
            {messages.map((message, index) => {
              const day = messageDay(message.createdAt);
              const previous = messages[index - 1];
              const newDay = !previous || messageDay(previous.createdAt) !== day;
              return (
                <li
                  key={message.id}
                  ref={message.id === lastId ? lastRef : undefined}
                  className="flex flex-col"
                >
                  {newDay && <p className="my-2 text-center text-sm text-muted">{day}</p>}
                  <MessageBubble message={message} partnerName={partnerName} />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!conversation.withinSendPeriod ? (
        <p className={FOOTER_NOTE_CLASS}>
          送信できる期間（開催の終了から7日後まで）が過ぎたため、閲覧だけできます。
        </p>
      ) : block.blockedByMe ? (
        // ブロックした本人にだけ示す。相手の画面では、送信したときに「送信できません」とだけ示す
        <p className={FOOTER_NOTE_CLASS}>
          この相手をブロックしているため、送信できません。解除は
          <Link to={`/users/${partner.userId}`} className="font-bold text-main-strong underline">
            相手のプロフィール
          </Link>
          でできます。
        </p>
      ) : (
        <Composer
          conversationId={conversation.id}
          onSent={(message) => {
            setSent((items) => [...items, message]);
            onSent();
          }}
        />
      )}
    </section>
  );
}

const FOOTER_NOTE_CLASS =
  'sticky bottom-(--member-nav-h) border-t border-line bg-surface px-4 py-3 text-muted lg:rounded-b-2xl';

function MessageBubble({ message, partnerName }: { message: Message; partnerName: string }) {
  return (
    <div
      className={`flex max-w-[85%] flex-col ${message.isMine ? 'items-end self-end' : 'items-start'}`}
    >
      <span className="sr-only">{message.isMine ? 'あなた' : partnerName}：</span>
      <p
        className={`rounded-2xl px-4 py-2 break-words whitespace-pre-line ${
          message.isMine ? 'bg-main-tint' : 'border border-line bg-surface'
        }`}
      >
        {message.body}
      </p>
      <span className="text-sm text-muted">
        <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
      </span>
    </div>
  );
}

function newRequestId() {
  return crypto.randomUUID();
}

interface ComposerProps {
  conversationId: string;
  onSent: (message: Message) => void;
}

/** 入力欄。スマートフォンでは画面下（下部の移動の上）に固定する。 */
function Composer({ conversationId, onSent }: ComposerProps) {
  const repository = useConversationRepository();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同じ下書きの送り直しは、同じ値で送る。窓口が1件にまとめる（二重送信の防止）
  const requestId = useRef(newRequestId());
  const sending = useRef(false);
  const length = textLength(body.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // 送信中は、もう一度押しても送らない
    if (sending.current) return;
    const invalid = checkMessageBody(body);
    if (invalid) {
      setError(invalid);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await repository.send({
        conversationId,
        body,
        clientRequestId: requestId.current,
      });
      if (result.status === 'sent') {
        setBody('');
        requestId.current = newRequestId();
        onSent(result.message);
      } else {
        // 期間・ブロックなどの理由は示さない（docs/11の3-1、Q-20）。回数の上限だけは案内する。
        // 入力した内容は残す
        setError(
          result.reason === 'rateLimited'
            ? REJECTED_MESSAGES.sendRateLimited
            : REJECTED_MESSAGES.notAllowed,
        );
      }
    } catch {
      setError('送信できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="メッセージを送る"
      onSubmit={(event) => {
        void submit(event);
      }}
      className="sticky bottom-(--member-nav-h) z-10 border-t border-line bg-surface px-4 py-3 lg:rounded-b-2xl"
    >
      {error && (
        <p id="message-error" role="alert" className="mb-2 font-bold text-danger">
          {error}
        </p>
      )}
      <label htmlFor="message-body" className="sr-only">
        メッセージ
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="message-body"
          rows={2}
          value={body}
          aria-describedby={`message-counter${error ? ' message-error' : ''}`}
          {...(error ? { 'aria-invalid': true } : {})}
          onChange={(event) => {
            setBody(event.target.value);
            // 内容を変えたら、別の送信として扱う
            requestId.current = newRequestId();
          }}
          className={`${INPUT_CLASS} max-h-40 resize-y`}
        />
        <div className="shrink-0">
          <Button type="submit" disabled={busy}>
            {busy ? '送信中' : '送信'}
          </Button>
        </div>
      </div>
      <p
        id="message-counter"
        className={`mt-1 text-right text-sm ${length > MESSAGE_MAX_LENGTH ? 'font-bold text-danger' : 'text-muted'}`}
      >
        {length.toLocaleString('ja-JP')}／{MESSAGE_MAX_LENGTH.toLocaleString('ja-JP')}文字
      </p>
    </form>
  );
}
