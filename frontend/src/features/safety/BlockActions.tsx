import { useState } from 'react';
import { useToast } from '../../app/toastContext';
import { useResource } from '../../app/useResource';
import { Button } from '../../components/ui/Button';
import { useBlockRepository } from './repositoryContext';
import type { BlockResult } from './types';

/**
 * 自分が相手をブロックしているか。相手が自分をブロックしているかは分からない（docs/11の3-1）。
 * 読み込み中・失敗・相手が退会した場合は null とし、操作を出さない。
 */
export function useBlockState(userId: string) {
  const repository = useBlockRepository();
  const { result, reload } = useResource(`block:${userId}`, () => repository.getBlockState(userId));
  return {
    blockedByMe: result.status === 'ready' ? (result.value?.blockedByMe ?? null) : null,
    reload,
  };
}

interface BlockActionsProps {
  userId: string;
  /** 相手のニックネーム。確認の文と読み上げに使う */
  name: string;
  blockedByMe: boolean;
  /** 解除の操作を出すか。解除は相手のプロフィール（SCR-013）だけで行う（M-12） */
  allowUnblock: boolean;
  /** ブロック・解除の後に、状態を読み込み直す */
  onChanged: () => void;
}

const FAILED = '操作できませんでした。通信の状態を確認して、もう一度お試しください。';

/**
 * ブロック（SAFE-04）と解除（CND-06）。SCR-011・013の中で操作し、画面を移動しない（docs/10の6-6）。
 * ブロックは影響が大きいため、確認を挟む（docs/10の11-5）。解除は相手のプロフィールで行う。
 * 操作がブロックだけの間は、文字のボタンで置く。サイクル4で通報が加わったら、SCR-011・013とも
 * 「…」のメニューにまとめる（2026-11-27の決定、docs/11の3-1）。
 */
export function BlockActions({
  userId,
  name,
  blockedByMe,
  allowUnblock,
  onChanged,
}: BlockActionsProps) {
  const repository = useBlockRepository();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<BlockResult>, done: string, rejected: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.status === 'done') {
        toast(done);
        setConfirming(false);
      } else {
        // 相手が退会した場合など
        setError(rejected);
      }
      onChanged();
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  const errorLine = error && (
    <p role="alert" className="font-bold text-danger">
      {error}
    </p>
  );

  if (blockedByMe) {
    if (!allowUnblock) return null;
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-4">
        <p className="font-bold">この相手をブロックしています。</p>
        <p className="text-sub">お互いに、メッセージの送信と新しい参加申請ができません。</p>
        {errorLine}
        <Button
          variant="secondary"
          size="small"
          disabled={busy}
          onClick={() => {
            void run(
              () => repository.unblock(userId),
              'ブロックを解除しました。',
              'ブロックを解除できませんでした。',
            );
          }}
        >
          {busy ? '解除しています' : 'ブロックを解除する'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {errorLine}
      {confirming ? (
        <div
          role="group"
          aria-label="ブロックの確認"
          className="w-full rounded-xl border border-danger bg-surface p-3 text-left"
        >
          <p className="mb-2 font-bold">{name}さんをブロックしますか？</p>
          <ul className="mb-3 list-disc pl-5 text-sub">
            <li>お互いに、メッセージの送信と、新しい会話・参加申請ができなくなります。</li>
            <li>すでにある申請・参加と、これまでの会話は、そのまま残ります。</li>
            <li>相手に、ブロックしたことは知らされません。</li>
            <li>解除は、相手のプロフィールでできます。</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={() => {
                void run(
                  () => repository.block(userId),
                  `${name}さんをブロックしました。`,
                  'この相手は、ブロックできません。',
                );
              }}
            >
              {busy ? 'ブロックしています' : 'ブロックする'}
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
          aria-label={`${name}さんをブロックする`}
          onClick={() => {
            setConfirming(true);
            setError(null);
          }}
        >
          ブロックする
        </Button>
      )}
    </div>
  );
}
