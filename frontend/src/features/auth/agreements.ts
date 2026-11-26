import type { AgreementDocument } from './types';

/**
 * 規約等の版（docs/06の4-17の version）。サイクル1は仮の文章で、公開前に正式な内容と版に置き換える。
 */
export const AGREEMENT_VERSION = '仮-0';

export interface AgreementText {
  document: AgreementDocument;
  title: string;
  /** 仮の本文。実際の規約ではないことが分かるようにする */
  body: string;
}

/** 同意の欄。1つの欄で、1つ以上の文書に同意する。 */
export type ConsentKey = 'termsAndPrivacy' | 'messageReview';

export interface ConsentItem {
  key: ConsentKey;
  /** 同意の欄の文言 */
  label: string;
  documents: readonly AgreementText[];
}

/**
 * 同意の欄は2つ（docs/11の7-2）。どちらも未選択の状態から、別々に同意してもらう。
 * 通報時のメッセージ確認は、通信の秘密に関わるため、個別の同意として分ける（Q-34）。
 * 同意の記録は、文書ごとに版と日時を残す（docs/06の4-17）。
 */
export const CONSENTS: readonly ConsentItem[] = [
  {
    key: 'termsAndPrivacy',
    label: '利用規約とプライバシーポリシーに同意する',
    documents: [
      {
        document: 'terms',
        title: '利用規約',
        body: 'これは開発中の仮の文章です。実際の利用規約ではありません。公開前に、正式な利用規約に置き換えます。',
      },
      {
        document: 'privacy',
        title: 'プライバシーポリシー',
        body: 'これは開発中の仮の文章です。実際のプライバシーポリシーではありません。公開前に、正式な内容に置き換えます。',
      },
    ],
  },
  {
    key: 'messageReview',
    label: '通報時のメッセージ確認に同意する',
    documents: [
      {
        document: 'message_review',
        title: '通報時のメッセージ確認',
        body: 'これは開発中の仮の文章です。通報があった場合に、運営者が対象のメッセージを確認することについての説明を、公開前に正式な内容で示します。',
      },
    ],
  },
];

/** 同意した欄から、記録する文書と版を作る。 */
export function agreedDocuments(agreed: Record<ConsentKey, boolean>) {
  return CONSENTS.filter((consent) => agreed[consent.key]).flatMap((consent) =>
    consent.documents.map(({ document }) => ({ document, version: AGREEMENT_VERSION })),
  );
}
