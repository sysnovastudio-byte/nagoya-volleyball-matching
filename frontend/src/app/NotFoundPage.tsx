import { ButtonLink } from '../components/ui/Button';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useDocumentTitle } from './useDocumentTitle';

/** ページがない場合と、見られない募集の場合の共通の表示（追加-08、DB-08）。 */
export function NotFoundPage() {
  useDocumentTitle('ページが見つかりません');

  return (
    <StatusMessage title="ページが見つかりません" headingLevel="h1">
      <p>募集が終わったか、アドレスが変わった可能性があります。</p>
      <ButtonLink to="/">募集一覧へ</ButtonLink>
    </StatusMessage>
  );
}
