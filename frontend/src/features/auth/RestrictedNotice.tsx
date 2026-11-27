import { Link } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import type { Viewer } from './types';

/** 一般の操作ができない理由の短い文。募集詳細などの操作の場所に示す。 */
export function restrictedReason(viewer: Viewer) {
  return viewer.role === 'admin'
    ? '管理用のアカウントでは、申請・質問などの一般の操作はできません。'
    : '利用停止中のため、申請・質問などの操作はできません。';
}

/**
 * 管理者・利用停止中の人が、一般の利用者の画面を開いたときの表示（docs/11の4-1・4-2）。
 * 画面を見せないだけで、操作はDB側（開発中は開発用の窓口）が断る。
 */
export function RestrictedNotice({ viewer }: { viewer: Viewer }) {
  const suspended = viewer.role === 'user' && viewer.status === 'suspended';
  useDocumentTitle(suspended ? '利用停止中' : '管理用のアカウント');

  if (suspended) {
    return (
      <StatusMessage title="利用停止中です" headingLevel="h1">
        <p>
          この間は、公開されている募集の閲覧と、ログアウトだけができます。停止や退会についてのお問い合わせは、
          <Link to="/privacy" className="font-bold text-main-strong underline">
            プライバシーポリシー
          </Link>
          に示す問い合わせ先へお願いします。
        </p>
        <ButtonLink to="/settings" variant="secondary">
          設定（ログアウト）へ
        </ButtonLink>
      </StatusMessage>
    );
  }
  return (
    <StatusMessage title="管理用のアカウントです" headingLevel="h1">
      <p>
        管理用のアカウントでは、申請・募集の作成・メッセージなどの一般の操作はできません。管理の画面は、設定から開きます。
      </p>
      <ButtonLink to="/settings">設定へ</ButtonLink>
    </StatusMessage>
  );
}
