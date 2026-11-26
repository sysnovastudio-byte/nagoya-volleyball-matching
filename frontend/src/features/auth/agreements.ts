import type { AgreementDocument } from './types';

/**
 * 規約等の版（docs/06の4-17の version）。サイクル1は仮の文章で、公開前に正式な内容と版に置き換える。
 */
export const AGREEMENT_VERSION = '仮-0';

export interface AgreementText {
  document: AgreementDocument;
  title: string;
  /** 同意の欄の文言 */
  consent: string;
  /** 仮の本文。実際の規約ではないことが分かるようにする */
  body: string;
}

/** 同意を求める3つの文書（docs/11の7-2）。別々に、未選択の状態から同意してもらう。 */
export const AGREEMENTS: readonly AgreementText[] = [
  {
    document: 'terms',
    title: '利用規約',
    consent: '利用規約に同意します',
    body: 'これは開発中の仮の文章です。実際の利用規約ではありません。公開前に、正式な利用規約に置き換えます。',
  },
  {
    document: 'privacy',
    title: 'プライバシーポリシー',
    consent: 'プライバシーポリシーに同意します',
    body: 'これは開発中の仮の文章です。実際のプライバシーポリシーではありません。公開前に、正式な内容に置き換えます。',
  },
  {
    document: 'message_review',
    title: '通報時のメッセージ確認',
    consent: '通報されたメッセージを、運営者が確認することに同意します',
    body: 'これは開発中の仮の文章です。通報があった場合に、運営者が対象のメッセージを確認することについての説明を、公開前に正式な内容で示します。',
  },
];
