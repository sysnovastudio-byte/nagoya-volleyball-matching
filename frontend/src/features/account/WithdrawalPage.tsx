import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useDocumentTitle } from '../../app/useDocumentTitle';
import { useResource } from '../../app/useResource';
import { Button, ButtonLink } from '../../components/ui/Button';
import { FormField, INPUT_CLASS } from '../../components/ui/FormField';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { DevNotice, FormError } from '../auth/AuthLayout';
import { loginPath } from '../auth/loginRedirect';
import { useSession } from '../auth/sessionContext';
import { formatDateTimeRange } from '../events/format';
import { useAccountRepository } from './repositoryContext';
import type { UpcomingHostedEvent, WithdrawalCheck } from './types';

const PATH = '/settings/withdraw';

/**
 * SCR-017 退会（CND-08）。退会の説明と申し込み。
 * 退会の前にパスワードを再入力してもらう（DB-26）。開催開始前の募集を主催している間は退会できない【合意済み】。
 * 利用停止中の人には、問い合わせで受け付けることを示す（M-06）。
 * 退会した瞬間にログアウトするため、要ログインの確認（RequireLogin）をこの画面で行う。
 */
export function WithdrawalPage() {
  useDocumentTitle('退会');
  const session = useSession();
  const [phase, setPhase] = useState<'form' | 'withdrawing' | 'done'>('form');

  if (phase === 'done') {
    return (
      <StatusMessage title="退会しました" headingLevel="h1" role="status">
        <p>ご利用ありがとうございました。</p>
        <ButtonLink to="/">募集一覧へ</ButtonLink>
      </StatusMessage>
    );
  }
  if (session.status === 'loading' || (phase === 'withdrawing' && !session.viewer)) {
    return (
      <div role="status" className="px-4 py-12 text-center text-muted">
        読み込んでいます
      </div>
    );
  }
  const { viewer } = session;
  if (!viewer) return <Navigate replace to={loginPath(PATH)} />;
  if (viewer.role === 'admin') {
    return (
      <StatusMessage title="管理用のアカウントは退会できません" headingLevel="h1">
        <p>管理用のアカウントは、この画面から退会できません。</p>
        <ButtonLink to="/settings" variant="secondary">
          設定へ
        </ButtonLink>
      </StatusMessage>
    );
  }
  if (viewer.status === 'suspended') return <SuspendedNotice />;

  return (
    <div className="mx-auto w-full max-w-160 px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">退会</h1>
      {import.meta.env.DEV && (
        <DevNotice>
          <p>
            ダミーのデータの上だけで退会します。パスワードは確かめません（空のときだけ断ります）。再読み込みすると元に戻ります。
          </p>
        </DevNotice>
      )}
      <WithdrawalContent
        onStart={() => {
          setPhase('withdrawing');
        }}
        onFinish={(withdrawn) => {
          setPhase(withdrawn ? 'done' : 'form');
        }}
      />
    </div>
  );
}

/** 利用停止中の退会は、問い合わせで受け付ける（M-06）。運営者が本人確認のうえ、退会の処理を行う。 */
function SuspendedNotice() {
  return (
    <StatusMessage title="利用停止中は、この画面から退会できません" headingLevel="h1">
      <p>
        退会を希望する場合は、問い合わせ先へご連絡ください。運営者が本人であることを確かめたうえで、退会の手続きをします。問い合わせ先は、
        <Link to="/privacy" className="font-bold text-main-strong underline">
          プライバシーポリシー
        </Link>
        に示します。
      </p>
      <ButtonLink to="/settings" variant="secondary">
        設定へ
      </ButtonLink>
    </StatusMessage>
  );
}

interface WithdrawalContentProps {
  onStart: () => void;
  onFinish: (withdrawn: boolean) => void;
}

function WithdrawalContent({ onStart, onFinish }: WithdrawalContentProps) {
  const repository = useAccountRepository();
  const { result, retry, reload } = useResource('withdrawal-check', () =>
    repository.getWithdrawalCheck(),
  );

  if (result.status === 'loading') {
    return (
      <p role="status" className="py-8 text-center text-muted">
        読み込んでいます
      </p>
    );
  }
  if (result.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>読み込めませんでした。通信の状態を確認して、もう一度お試しください。</p>
        <Button variant="secondary" onClick={retry}>
          もう一度読み込む
        </Button>
      </div>
    );
  }
  const check = result.value;
  return (
    <div className="flex flex-col gap-6">
      <WithdrawalExplanation check={check} />
      {check.status === 'hostingUpcoming' && <HostingNotice events={check.events} />}
      {check.status === 'available' && (
        <WithdrawalForm onStart={onStart} onFinish={onFinish} onHostingFound={reload} />
      )}
      {check.status === 'unavailable' && (
        <p role="alert" className="font-bold text-danger">
          今は退会できません。画面を読み込み直してください。
        </p>
      )}
    </div>
  );
}

/** 退会で行うこと（docs/06の5-8、docs/11の3-4）。住所が消えることを必ず示す（DB-01）。 */
function WithdrawalExplanation({ check }: { check: WithdrawalCheck }) {
  const impact = check.status === 'available' ? check.impact : null;
  return (
    <section
      aria-labelledby="withdrawal-effects"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="withdrawal-effects" className="mb-3 text-lg font-bold">
        退会すると
      </h2>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>
          プロフィール（ニックネーム・経験レベル・自己紹介・年代・性別）と、メールアドレスをすぐに削除します。
        </li>
        <li>
          主催した募集の開催場所住所を、すべて削除します。終了・中止・開催中の募集の住所も削除します。
        </li>
        <li>
          開催前の募集への参加はキャンセルし、承認待ちの申請は取り下げます。参加のキャンセルは、主催者へ通知します。
          {impact &&
            (impact.approvedParticipations > 0 || impact.pendingApplications > 0) &&
            `（今の対象：参加${impact.approvedParticipations}件、承認待ちの申請${impact.pendingApplications}件）`}
        </li>
        <li>受け取った通知と、自分がしたブロックを削除します。</li>
        <li>
          募集・参加・メッセージなどの記録は、「退会したユーザー」として残ります。メッセージや募集の説明に書いた内容は消えません。
        </li>
        <li>
          退会は取り消せません。もう一度使うときは新しいアカウントとして登録でき、以前の記録は引き継ぎません。
        </li>
      </ul>
    </section>
  );
}

/** 開催開始前の募集を主催している間は退会できない【合意済み】。募集を中止するか、終わるまで待ってもらう。 */
function HostingNotice({ events }: { events: UpcomingHostedEvent[] }) {
  return (
    <section
      aria-labelledby="withdrawal-hosting"
      className="rounded-2xl border-2 border-danger bg-surface p-4"
    >
      <h2 id="withdrawal-hosting" className="mb-2 text-lg font-bold text-danger">
        今は退会できません
      </h2>
      <p className="mb-3">
        開催前の募集を主催しています。募集を中止するか、開催が終わってから退会してください。
      </p>
      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link to={`/events/${event.id}`} className="font-bold text-main-strong underline">
              {event.title}
            </Link>
            <p className="text-muted">{formatDateTimeRange(event.startsAt, event.endsAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface WithdrawalFormProps extends WithdrawalContentProps {
  /** 退会の時に、主催する開催前の募集が見つかった（画面を開いた後に作った場合など） */
  onHostingFound: () => void;
}

function WithdrawalForm({ onStart, onFinish, onHostingFound }: WithdrawalFormProps) {
  const repository = useAccountRepository();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    if (password === '') {
      setError('パスワードを入力してください。');
      document.getElementById('withdrawal-password')?.focus();
      return;
    }
    setError(undefined);
    setSubmitting(true);
    onStart();
    let withdrawn = false;
    try {
      const result = await repository.withdraw({ password });
      if (result.status === 'withdrawn') {
        withdrawn = true;
        return;
      }
      if (result.reason === 'wrongPassword') {
        setError('パスワードが違います。');
        document.getElementById('withdrawal-password')?.focus();
      } else if (result.reason === 'hostingUpcoming') {
        onHostingFound();
      } else {
        setSubmitError('退会できませんでした。画面を読み込み直してください。');
      }
    } catch {
      setSubmitError('退会できませんでした。通信の状態を確認して、もう一度お試しください。');
    } finally {
      setSubmitting(false);
      onFinish(withdrawn);
    }
  };

  return (
    <form
      noValidate
      aria-label="退会の申し込み"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="flex flex-col gap-5"
    >
      <FormError message={submitError} />
      <FormField
        id="withdrawal-password"
        label="パスワード"
        required
        hint="本人であることを確かめるため、ログインに使っているパスワードを入力してください。"
        error={error}
      >
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            className={INPUT_CLASS}
          />
        )}
      </FormField>
      <p className="font-bold">退会すると、元に戻せません。</p>
      <Button type="submit" variant="danger" disabled={submitting}>
        {submitting ? '退会しています' : '退会する'}
      </Button>
      <ButtonLink to="/settings" variant="secondary">
        やめる
      </ButtonLink>
    </form>
  );
}
