import { Route, Routes } from 'react-router';
import { ButtonLink } from '../components/ui/Button';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireLogin } from '../features/auth/RequireLogin';
import { SessionProvider } from '../features/auth/SessionProvider';
import { CreateEventPage } from '../features/events/CreateEventPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventListPage } from '../features/events/EventListPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { PendingPage } from './PendingPage';

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<EventListPage />} />
          <Route path="events/:eventId" element={<EventDetailPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<PendingPage title="新規登録" />} />

          {/* 要ログインの画面。仮の画面は、作るときに置き換える */}
          <Route element={<RequireLogin />}>
            <Route path="events/new" element={<CreateEventPage />} />
            <Route path="events/:eventId/applicants" element={<PendingPage title="申請者一覧" />} />
            <Route path="activity" element={<PendingPage title="申請と募集の管理" />} />
            <Route path="conversations" element={<PendingPage title="会話" />} />
            <Route path="notifications" element={<PendingPage title="通知" />} />
            <Route
              path="profile"
              element={
                <PendingPage title="プロフィール">
                  <ButtonLink to="/settings">設定</ButtonLink>
                </PendingPage>
              }
            />
            <Route path="profile/edit" element={<PendingPage title="プロフィールの入力" />} />
          </Route>
          {/* 要ログイン。ログアウトの後の移動先が違うため、画面の中で確認する */}
          <Route path="settings" element={<SettingsPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
