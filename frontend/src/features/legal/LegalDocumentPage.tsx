import { Link } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import type { LegalDocument } from './documents';

/**
 * SCR-023 利用規約・SCR-024 プライバシーポリシー。【仮】開発中は本文を書かず、
 * 予定している内容（未確認）の目次と見出しだけを並べる（docs/10の5-11）。
 * 仮の文章であることは、本番用のビルドでも同じように示す。問い合わせ先は仮で、実在のアドレスを載せない。
 */
export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  useDocumentTitle(doc.title);
  const idPrefix = doc.path.slice(1);
  const headingId = (index: number) => `${idPrefix}-section-${index + 1}`;

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">{doc.title}</h1>
      <p
        role="note"
        className="mb-5 rounded-xl border-2 border-danger bg-surface px-4 py-3 text-lg font-bold text-danger"
      >
        開発中の仮の文章です。実際の{doc.noun}ではありません。
      </p>
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-bold">版</dt>
        <dd>{doc.version}</dd>
        <dt className="font-bold">施行日</dt>
        <dd>{doc.effectiveDate ?? '未定'}</dd>
      </dl>
      <p className="mb-6">
        合わせて{' '}
        <Link to={doc.related.path} className="font-bold text-main-strong underline">
          {doc.related.title}
        </Link>{' '}
        もお読みください。
      </p>

      <section aria-labelledby={`${idPrefix}-planned`} className="mb-6">
        <h2 id={`${idPrefix}-planned`} className="mb-2 text-xl font-bold">
          予定している内容（未確認）
        </h2>
        <p className="mb-4 text-muted">
          本文はまだありません。内容は公開前に確認し、正式な文章にします。
        </p>
        <nav aria-label="目次" className="mb-5 rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 font-bold">目次</p>
          <ol className="flex list-decimal flex-col pl-6">
            {doc.plannedHeadings.map((heading, index) => (
              <li key={heading}>
                <a
                  href={`#${headingId(index)}`}
                  className="inline-flex min-h-11 items-center text-main-strong underline"
                >
                  {heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex flex-col gap-3">
          {doc.plannedHeadings.map((heading, index) => (
            <h3 key={heading} id={headingId(index)} className="scroll-mt-4 text-lg font-bold">
              {index + 1}. {heading}
            </h3>
          ))}
        </div>
      </section>

      <section
        aria-labelledby={`${idPrefix}-contact`}
        className="rounded-xl border border-line bg-surface p-4"
      >
        <h2 id={`${idPrefix}-contact`} className="mb-2 text-xl font-bold">
          問い合わせ先（仮）
        </h2>
        <p>
          準備中です。公開前に、問い合わせ用のメールアドレスをここに示します。利用停止中の方の退会や、個人情報についての請求も、この問い合わせ先で受け付ける予定です。
        </p>
      </section>
    </div>
  );
}
