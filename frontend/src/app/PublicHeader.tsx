import { Link } from 'react-router';
import { ButtonLink } from '../components/ui/Button';

/** 未ログインの上部の帯（docs/11の5-1）。サービス名は仮（Q-38）。 */
export function PublicHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-15 max-w-288 items-center gap-2 px-4 py-2">
        <Link
          to="/"
          className="flex min-h-11 grow items-center font-bold text-main-strong hover:underline"
        >
          サービス名（仮）
        </Link>
        <nav aria-label="アカウント" className="flex shrink-0 items-center gap-1">
          <ButtonLink to="/login" variant="text" size="small">
            ログイン
          </ButtonLink>
          <ButtonLink to="/signup" size="small">
            新規登録
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
