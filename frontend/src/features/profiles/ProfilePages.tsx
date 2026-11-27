import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useFlashToast } from '../../app/useFlashToast';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { BlockActions, useBlockState } from '../safety/BlockActions';
import { Avatar } from './Avatar';
import { displayName, experienceLabel } from './format';
import { useProfileRepository } from './repositoryContext';
import { ageGroupLabel } from './profileRules';
import type { AgeGroup, MyProfile, PublicProfile } from './types';

/**
 * SCR-013 プロフィール（PROF-03）。ニックネーム・経験レベル・自己紹介と、画像の代わりの絵柄。
 * 年代は本人にだけ示す（主催者は申請者一覧で見る）。性別・活動地域（M-01）は加えない。
 * ほかの人のプロフィールでは、ブロックと解除ができる（SAFE-04・CND-06）。通報はサイクル4で加える。
 */
export function MyProfilePage() {
  const repository = useProfileRepository();
  const { result, retry } = useResource('my-profile', () => repository.getMyProfile());
  // 保存した直後は「プロフィールを保存しました」を通知で示す
  useFlashToast('profileSaved', 'プロフィールを保存しました。');

  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <LoadError onRetry={retry} />;
  if (!result.value) return <NoProfile />;
  return (
    <ProfileView profile={toPublic(result.value)} ageGroup={result.value.ageGroup}>
      <ButtonLink to="/profile/edit">プロフィールを編集</ButtonLink>
      <SettingsEntry />
    </ProfileView>
  );
}

function toPublic(profile: MyProfile): PublicProfile {
  const { userId, nickname, experienceLevel, bio } = profile;
  return { userId, isWithdrawn: false, nickname, experienceLevel, bio };
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
  if (!profile) return <NotFoundPage />;
  return (
    <ProfileView profile={profile}>
      {/* 退会した人はブロックできない（相手がいない） */}
      {!profile.isWithdrawn && <ProfileBlock userId={profile.userId} name={displayName(profile)} />}
    </ProfileView>
  );
}

/** 他人のプロフィールの、ブロックと解除。自分自身の場合は、窓口が状態を返さないため出さない。 */
function ProfileBlock({ userId, name }: { userId: string; name: string }) {
  const { blockedByMe, reload } = useBlockState(userId);
  if (blockedByMe === null) return null;
  return (
    <BlockActions
      userId={userId}
      name={name}
      blockedByMe={blockedByMe}
      allowUnblock
      onChanged={reload}
    />
  );
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
      <SettingsEntry />
    </StatusMessage>
  );
}

/** 本人のプロフィールの下に置く、設定への入口。何ができるかを添えて、ボタンと区別する。 */
function SettingsEntry() {
  return (
    <Link
      to="/settings"
      className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left hover:border-main"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 text-main"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
      </svg>
      <span className="flex grow flex-col">
        <span className="font-bold">設定</span>
        <span className="text-muted">ログアウトなど</span>
      </span>
      <span aria-hidden="true" className="text-xl text-muted">
        ›
      </span>
    </Link>
  );
}

interface ProfileViewProps {
  profile: PublicProfile;
  /** 本人のプロフィールの場合だけ渡す。ほかの人の画面には出さない */
  ageGroup?: AgeGroup | null;
  /** 本人の操作 */
  children?: ReactNode;
}

/** 画像（の代わりの絵柄）と名前、公開項目の順（docs/11の5-1）。 */
function ProfileView({ profile, ageGroup, children }: ProfileViewProps) {
  const name = displayName(profile);
  useDocumentTitle(`${name}のプロフィール`);
  const experience = experienceLabel(profile);

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
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
      {ageGroup !== undefined && (
        <section
          aria-labelledby="limited-profile-heading"
          className="mt-4 rounded-2xl border border-line bg-surface p-4"
        >
          <h2 id="limited-profile-heading" className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>本人と申請先の主催者だけ</Badge>
          </h2>
          <dl>
            <dt className="text-muted">年代</dt>
            <dd className="font-bold">
              {ageGroup ? (
                ageGroupLabel(ageGroup)
              ) : (
                <span className="font-normal text-muted">選んでいません。</span>
              )}
            </dd>
          </dl>
        </section>
      )}
      {children && <div className="mt-5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
