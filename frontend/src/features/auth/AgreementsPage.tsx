import { useDocumentTitle } from '../../app/useDocumentTitle';
import { AGREEMENT_VERSION, CONSENTS } from './agreements';

const TITLE = '利用規約・プライバシーポリシー';

/**
 * 新規登録の「利用規約・プライバシーポリシーを読む」のリンク先。
 * 【仮】サイクル1では仮の文章だけを示す。SCR-023・024（目次・版・施行日・問い合わせ先）は後のサイクルで作る。
 */
export function AgreementsPage() {
  useDocumentTitle(TITLE);
  const documents = CONSENTS.find((consent) => consent.key === 'termsAndPrivacy')?.documents ?? [];

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">{TITLE}</h1>
      <p className="mb-5 text-muted">開発中の仮の文章です（版：{AGREEMENT_VERSION}）。</p>
      <div className="flex flex-col gap-5">
        {documents.map((document) => (
          <section key={document.document} aria-labelledby={`agreement-${document.document}`}>
            <h2 id={`agreement-${document.document}`} className="mb-1 text-lg font-bold">
              {document.title}
            </h2>
            <p className="whitespace-pre-line">{document.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
