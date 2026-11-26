import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { BackLink } from '../../app/BackLink';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { Avatar } from './Avatar';
import type { ProfileLocationState } from './ProfileEditPage';
import { displayName, experienceLabel } from './format';
import { useProfileRepository } from './repositoryContext';
import type { PublicProfile } from './types';

/**
 * SCR-013 プロフィール（PROF-03）。サイクル1は、ニックネーム・経験レベル・自己紹介と、画像の代わりの絵柄だけ。
 * 年代・性別・活動地域（M-01）と、ブロック・通報（限定公開まで）は加えない。
 */
export function MyProfilePage() {
  const repository = useProfileRepository();
  const { result, retry } = useResource('my-profile', () => repository.getMyProfile());
  const saved = (useLocation().state as ProfileLocationState | null)?.profileSaved === true;

  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <LoadError onRetry={retry} />;
  if (!result.value) return <NoProfile />;
  return (
    <ProfileView profile={result.value} notice={saved ? 'プロフィールを保存しました。' : null}>
      <ButtonLink to="/profile/edit">プロフィールを編集</ButtonLink>
      <ButtonLink to="/settings" variant="secondary">
        設定
      </ButtonLink>
    </ProfileView>
  );
}

/** ほかの人のプロフィール。申請者一覧などから移る。 */
export function UserProfilePage() {
  const { userId = '' } = useParams();
  const repository = useProfileRepository();
  const { result, retry } = useResource(`profile:${userId}`, () =>
    repository.getProfiles([userId]),
  );

  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <LoadError onRetry={retry} />;
  const [profile] = result.value;
  return profile ? <ProfileView profile={profile} showBack /> : <NotFoundPage />;
}

function Loading() {
  useDocumentTitle('プロフィール');
  return (
    <div role="status" className="px-4 py-12 text-center text-muted">
      プロフィールを読み込んでいます
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  useDocumentTitle('プロフィール');
  return (
    <StatusMessage title="プロフィールを読み込めませんでした" headingLevel="h1" role="alert">
      <p>通信の状態を確認して、もう一度お試しください。</p>
      <Button onClick={onRetry}>もう一度読み込む</Button>
    </StatusMessage>
  );
}

function NoProfile() {
  useDocumentTitle('プロフィール');
  return (
    <StatusMessage title="プロフィールが登録されていません" headingLevel="h1">
      <p>ニックネームと経験レベルを登録すると、募集への申請や作成ができます。</p>
      <ButtonLink to="/profile/edit">プロフィールを登録する</ButtonLink>
      <ButtonLink to="/settings" variant="secondary">
        設定
      </ButtonLink>
    </StatusMessage>
  );
}

interface ProfileViewProps {
  profile: PublicProfile;
  notice?: string | null;
  /** 申請者一覧などから来た場合に、戻る先を示す */
  showBack?: boolean;
  /** 本人の操作 */
  children?: ReactNode;
}

/** 画像（の代わりの絵柄）と名前、公開項目の順（docs/11の5-1）。 */
function ProfileView({ profile, notice = null, showBack = false, children }: ProfileViewProps) {
  const name = displayName(profile);
  useDocumentTitle(`${name}のプロフィール`);
  const experience = experienceLabel(profile);

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      {showBack && (
        <div className="-mt-4 mb-2">
          <BackLink />
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-main bg-main-tint px-4 py-3 font-bold text-main-strong"
        >
          {notice}
        </p>
      )}
      <div className="mb-5 flex items-center gap-4">
        <Avatar size="large" />
        <h1 className="min-w-0 text-2xl font-bold break-words">{name}</h1>
      </div>
      {!profile.isWithdrawn && (
        <dl className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
          <div>
            <dt className="text-muted">経験レベル</dt>
            <dd className="font-bold">{experience}</dd>
          </div>
          <div>
            <dt className="text-muted">自己紹介</dt>
            <dd className="break-words whitespace-pre-line">
              {profile.bio ?? <span className="text-muted">まだ書かれていません。</span>}
            </dd>
          </div>
        </dl>
      )}
      {children && <div className="mt-5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
