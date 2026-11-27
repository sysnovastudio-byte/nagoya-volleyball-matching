import { LegalDocumentPage } from './LegalDocumentPage';
import { PRIVACY_POLICY, TERMS } from './documents';

/** SCR-023 利用規約 */
export function TermsPage() {
  return <LegalDocumentPage doc={TERMS} />;
}

/** SCR-024 プライバシーポリシー */
export function PrivacyPolicyPage() {
  return <LegalDocumentPage doc={PRIVACY_POLICY} />;
}
