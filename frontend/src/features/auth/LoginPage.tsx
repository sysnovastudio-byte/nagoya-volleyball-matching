import { Navigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { NEXT_PARAM, safeNextPath } from './loginRedirect';
import { useViewer } from './sessionContext';

/** SCR-001 ログイン（仮）。ログインしたら、元の画面に戻る（docs/11の追加-10）。 */
export function LoginPage() {
  useDocumentTitle('ログイン');
  const [searchParams] = useSearchParams();
  const viewer = useViewer();

  if (viewer) return <Navigate replace to={safeNextPath(searchParams.get(NEXT_PARAM))} />;

  return (
    <StatusMessage title="ログインは準備中です" headingLevel="h1">
      <p>この画面は、まだ作っていません。</p>
      {import.meta.env.DEV && (
        <p className="rounded-xl bg-main-tint px-4 py-3 font-bold text-main-strong">
          開発用の帯で利用者を切り替えてください。切り替えると、元の画面に戻ります。
        </p>
      )}
      <ButtonLink to="/" variant="secondary">
        募集一覧へ戻る
      </ButtonLink>
    </StatusMessage>
  );
}
