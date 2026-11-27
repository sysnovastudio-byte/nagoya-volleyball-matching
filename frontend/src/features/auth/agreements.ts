import type { AgreementDocument } from './types';

/**
 * 規約等の版（docs/06の4-17の version）。サイクル1は仮の文章で、公開前に正式な内容と版に置き換える。
 */
export const AGREEMENT_VERSION = '仮-0';

/** 同意の欄。1つの欄で、1つ以上の文書に同意する。 */
export type ConsentKey = 'termsAndPrivacy' | 'messageReview';

export interface ConsentItem {
  key: ConsentKey;
  /** 同意の欄に見える文言 */
  label: string;
  /** 読み上げで使う、何に同意するかが分かる文言 */
  accessibleLabel: string;
  /** 文書を読むリンク（新しいタブで開く）。ない場合は欄の文言だけを示す */
  readLink: { to: string; text: string } | null;
  /** 同意を記録する文書。内容は SCR-023・024（src/features/legal/documents.ts）に示す */
  documents: readonly AgreementDocument[];
}

/**
 * 同意の欄は2つ（docs/11の7-2、文言は2026-11-26の決定）。どちらも未選択の状態から、別々に同意してもらう。
 * 通報時のメッセージ確認は、通信の秘密に関わるため、個別の同意として分ける（Q-34）。
 * 同意の記録は、文書ごとに版と日時を残す（docs/06の4-17）。
 */
export const CONSENTS: readonly ConsentItem[] = [
  {
    key: 'termsAndPrivacy',
    label: '同意する',
    accessibleLabel: '利用規約・プライバシーポリシーに同意する',
    readLink: { to: '/terms', text: '利用規約・プライバシーポリシーを読む' },
    // 「読む」のリンクは1つ（docs/11の7-2）。利用規約の画面から、プライバシーポリシーへ移れる
    documents: ['terms', 'privacy'],
  },
  {
    key: 'messageReview',
    label: '通報されたメッセージを、運営者が確認することに同意する',
    accessibleLabel: '通報されたメッセージを、運営者が確認することに同意する',
    readLink: null,
    documents: ['message_review'],
  },
];

/** 同意した欄から、記録する文書と版を作る。 */
export function agreedDocuments(agreed: Record<ConsentKey, boolean>) {
  return CONSENTS.filter((consent) => agreed[consent.key]).flatMap((consent) =>
    consent.documents.map((document) => ({ document, version: AGREEMENT_VERSION })),
  );
}
