import { createRoutesFromElements, Route } from 'react-router';
import { RequireAdmin } from '../features/admin/AdminParts';
import { ReportDetailPage, ReportListPage } from '../features/admin/ReportAdminPages';
import { UserDetailPage, UserSearchPage } from '../features/admin/UserAdminPages';
import { ActivityPage } from '../features/applications/ActivityPage';
import { ApplicantsPage } from '../features/applications/ApplicantsPage';
import { ConfirmEmailPage, VerificationSentPage } from '../features/auth/EmailVerificationPages';
import { LoginPage } from '../features/auth/LoginPage';
import {
  PasswordResetConfirmPage,
  PasswordResetRequestPage,
} from '../features/auth/PasswordResetPages';
import { RequireLogin } from '../features/auth/RequireLogin';
import { RequireProfile } from '../features/auth/RequireProfile';
import { SessionProvider } from '../features/auth/SessionProvider';
import { SignUpPage } from '../features/auth/SignUpPage';
import { CreateEventPage } from '../features/events/CreateEventPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventListPage } from '../features/events/EventListPage';
import { PrivacyPolicyPage, TermsPage } from '../features/legal/LegalPages';
import { ProfileEditPage } from '../features/profiles/ProfileEditPage';
import { ReportPage } from '../features/reports/ReportPage';
import { MyProfilePage, UserProfilePage } from '../features/profiles/ProfilePages';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ConversationsPage } from '../features/conversations/ConversationsPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';

/** すべての画面の外側。ログイン状態を、どの画面からも読めるようにする。 */
function RootLayout() {
  return (
    <SessionProvider>
      <AppLayout />
    </SessionProvider>
  );
}

/**
 * 画面の経路。createBrowserRouter（本番）と createMemoryRouter（テスト）で同じものを使う。
 * 入力中の移動を確認する useBlocker を使うため、データルーターにしている。
 */
export const appRoutes = createRoutesFromElements(
  <Route element={<RootLayout />}>
    <Route index element={<EventListPage />} />
    <Route path="events/:eventId" element={<EventDetailPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="signup" element={<SignUpPage />} />
    <Route path="signup/sent" element={<VerificationSentPage />} />
    <Route path="auth/confirm" element={<ConfirmEmailPage />} />
    {/* パスワード再設定（SCR-004）。ログイン中はパスワードの変更として使う（Q-50） */}
    <Route path="password-reset" element={<PasswordResetRequestPage />} />
    <Route path="password-reset/confirm" element={<PasswordResetConfirmPage />} />
    <Route path="terms" element={<TermsPage />} />
    <Route path="privacy" element={<PrivacyPolicyPage />} />

    {/* 要ログインの画面。仮の画面は、作るときに置き換える */}
    <Route element={<RequireLogin />}>
      {/* 必須プロフィールが必要な画面。未登録なら SCR-014 へ移る（docs/11の3-4） */}
      <Route element={<RequireProfile />}>
        <Route path="events/new" element={<CreateEventPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="conversations/:conversationId" element={<ConversationsPage />} />
      </Route>
      <Route path="events/:eventId/applicants" element={<ApplicantsPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="profile" element={<MyProfilePage />} />
      <Route path="profile/edit" element={<ProfileEditPage />} />
      <Route path="users/:userId" element={<UserProfilePage />} />
      {/* 通報（SCR-019）。管理者・利用停止中の人は RequireLogin が案内を示す */}
      <Route path="report/:kind/:targetId" element={<ReportPage />} />
    </Route>
    {/* 要ログイン。ログアウトの後の移動先が違うため、画面の中で確認する */}
    <Route path="settings" element={<SettingsPage />} />
    {/* 管理の画面（SCR-021・022）。入口は設定だけ（docs/11の4-1）。権限は窓口が確かめる */}
    <Route path="admin" element={<RequireAdmin />}>
      <Route path="reports" element={<ReportListPage />} />
      <Route path="reports/:reportId" element={<ReportDetailPage />} />
      <Route path="users" element={<UserSearchPage />} />
      <Route path="users/:userId" element={<UserDetailPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Route>,
);
