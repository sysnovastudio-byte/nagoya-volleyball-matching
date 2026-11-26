import type { ReactNode } from 'react';
import { ButtonLink } from '../components/ui/Button';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useDocumentTitle } from './useDocumentTitle';

interface PendingPageProps {
  title: string;
  /** 仮の画面から移動できる先など */
  children?: ReactNode;
}

/** まだ実装していない画面の仮の表示。実装したら置き換える。 */
export function PendingPage({ title, children }: PendingPageProps) {
  useDocumentTitle(title);

  return (
    <StatusMessage title={`${title}は準備中です`} headingLevel="h1">
      <p>この画面は、まだ作っていません。</p>
      {children}
      <ButtonLink to="/" variant="secondary">
        募集一覧へ戻る
      </ButtonLink>
    </StatusMessage>
  );
}
