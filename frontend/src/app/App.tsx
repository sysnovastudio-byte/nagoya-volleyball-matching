import { createRoutesFromElements, Route } from 'react-router';
import { ActivityPage } from '../features/applications/ActivityPage';
import { ApplicantsPage } from '../features/applications/ApplicantsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireLogin } from '../features/auth/RequireLogin';
import { SessionProvider } from '../features/auth/SessionProvider';
import { CreateEventPage } from '../features/events/CreateEventPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventListPage } from '../features/events/EventListPage';
import { MyProfilePage, UserProfilePage } from '../features/profiles/ProfilePages';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { PendingPage } from './PendingPage';

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
    <Route path="signup" element={<PendingPage title="新規登録" />} />

    {/* 要ログインの画面。仮の画面は、作るときに置き換える */}
    <Route element={<RequireLogin />}>
      <Route path="events/new" element={<CreateEventPage />} />
      <Route path="events/:eventId/applicants" element={<ApplicantsPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="conversations" element={<PendingPage title="会話" />} />
      <Route path="notifications" element={<PendingPage title="通知" />} />
      <Route path="profile" element={<MyProfilePage />} />
      <Route path="profile/edit" element={<PendingPage title="プロフィールの入力" />} />
      <Route path="users/:userId" element={<UserProfilePage />} />
    </Route>
    {/* 要ログイン。ログアウトの後の移動先が違うため、画面の中で確認する */}
    <Route path="settings" element={<SettingsPage />} />

    <Route path="*" element={<NotFoundPage />} />
  </Route>,
);
