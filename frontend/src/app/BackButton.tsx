import { useState } from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType } from 'react-router';
import { findScreen } from './screens';
import { PC_QUERY, useMediaQuery } from './useMediaQuery';

interface Entry {
  key: string;
  pathname: string;
}

interface InAppHistory {
  entries: Entry[];
  index: number;
}

/**
 * アプリの中で開いた画面の履歴。ブラウザの履歴のうち、このアプリで移った分だけを数える。
 * 前の画面があれば「戻る」で来た画面に戻り、なければ親の画面へ移る。
 */
function useInAppHistory() {
  const location = useLocation();
  const type = useNavigationType();
  const current = { key: location.key, pathname: location.pathname };
  const [history, setHistory] = useState<InAppHistory>({ entries: [current], index: 0 });

  // 画面が移ったら、描画の中で履歴を合わせる（React の「前の値から state を調整する」方法）
  if (history.entries[history.index]?.key !== current.key) {
    const { entries, index } = history;
    const found = entries.findIndex((entry) => entry.key === current.key);
    if (type === NavigationType.Pop && found !== -1) {
      setHistory({ entries, index: found });
    } else if (type === NavigationType.Replace) {
      setHistory({ entries: [...entries.slice(0, index), current], index });
    } else {
      setHistory({ entries: [...entries.slice(0, index + 1), current], index: index + 1 });
    }
  }
  return history.index > 0 ? (history.entries[history.index - 1] ?? null) : null;
}

/**
 * 全画面で共通の戻るボタン（docs/11の5-1「戻るボタン」、2026-11-26）。
 * ヘッダーのすぐ下・画面のタイトルの上・左端に置く。下部の移動から直接開く5つの画面には置かない。
 * 入力中の画面（募集作成）では、移る前に画面の確認（useBlocker）が出る。
 */
export function BackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const previous = useInAppHistory();
  const isPc = useMediaQuery(PC_QUERY);
  const found = findScreen(pathname);
  // ページがない場合も、募集一覧へ戻れるようにする
  const parent = found ? found.screen.parent : { to: () => '/', name: '募集一覧' };
  // 下部の移動から直接開く画面と、PCで一覧と並べて示す会話には置かない
  if (!parent || (isPc && found?.screen.mobileOnly)) return null;

  const previousName = previous ? findScreen(previous.pathname)?.screen.name : undefined;
  const label = previous
    ? previousName
      ? `${previousName}に戻る`
      : '戻る'
    : `${parent.name}に戻る`;

  return (
    <div className="mx-auto w-full max-w-288 px-4 pt-2">
      <button
        type="button"
        onClick={() => {
          if (previous) void navigate(-1);
          else void navigate(parent.to(found?.params ?? {}));
        }}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-lg pr-2 font-bold text-main-strong hover:underline"
      >
        <span aria-hidden="true">←</span>
        {label}
      </button>
    </div>
  );
}
