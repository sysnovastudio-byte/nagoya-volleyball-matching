import { AGREEMENT_VERSION } from '../auth/agreements';

/** 規約等の画面（SCR-023・024）に示す文書。 */
export interface LegalDocument {
  path: '/terms' | '/privacy';
  title: string;
  /** 目立つように示す注意で、「実際の〇〇ではありません」の〇〇 */
  noun: string;
  version: string;
  /** 施行日。決まっていない間は null（「未定」と示す） */
  effectiveDate: string | null;
  /** 予定している内容（未確認）の見出し。本文はまだ書かない */
  plannedHeadings: readonly string[];
  /** 合わせて読む文書 */
  related: { path: string; title: string };
}

/**
 * SCR-023 利用規約。【仮】開発中の仮の文章（docs/10の5-11、2026-11-26の決定）。
 * 見出しは docs/11の7-2 の項目。正式な文章にするときは版を上げ、改定時の再同意を入れる（M-13）。
 */
export const TERMS: LegalDocument = {
  path: '/terms',
  title: '利用規約',
  noun: '規約',
  version: AGREEMENT_VERSION,
  effectiveDate: null,
  plannedHeadings: [
    '同意',
    '改定',
    'サービスの位置付け',
    '禁止事項',
    'けが・事故',
    '金銭',
    '利用停止',
    '免責',
    '準拠法・裁判所',
  ],
  related: { path: '/privacy', title: 'プライバシーポリシー' },
};

/**
 * SCR-024 プライバシーポリシー。【仮】扱いは SCR-023 と同じ。見出しは docs/11の7-3 の項目。
 */
export const PRIVACY_POLICY: LegalDocument = {
  path: '/privacy',
  title: 'プライバシーポリシー',
  noun: 'プライバシーポリシー',
  version: AGREEMENT_VERSION,
  effectiveDate: null,
  plannedHeadings: [
    '取得する情報',
    '目的',
    '第三者への提供',
    '外部サービス',
    '保存期間',
    '本人の請求',
    '問い合わせ先',
    '運営者の表示',
    'Cookieなど',
  ],
  related: { path: '/terms', title: '利用規約' },
};
