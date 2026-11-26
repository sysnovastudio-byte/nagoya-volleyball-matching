import { createRoutesFromElements, Route } from 'react-router';
import { ActivityPage } from '../features/applications/ActivityPage';
import { ApplicantsPage } from '../features/applications/ApplicantsPage';
import { AgreementsPage } from '../features/auth/AgreementsPage';
import { ConfirmEmailPage, VerificationSentPage } from '../features/auth/EmailVerificationPages';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireLogin } from '../features/auth/RequireLogin';
import { RequireProfile } from '../features/auth/RequireProfile';
import { SessionProvider } from '../features/auth/SessionProvider';
import { SignUpPage } from '../features/auth/SignUpPage';
import { CreateEventPage } from '../features/events/CreateEventPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventListPage } from '../features/events/EventListPage';
import { ProfileEditPage } from '../features/profiles/ProfileEditPage';
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
    <Route path="terms" element={<AgreementsPage />} />

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
    </Route>
    {/* 要ログイン。ログアウトの後の移動先が違うため、画面の中で確認する */}
    <Route path="settings" element={<SettingsPage />} />

    <Route path="*" element={<NotFoundPage />} />
  </Route>,
);
