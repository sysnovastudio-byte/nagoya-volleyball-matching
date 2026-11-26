import { Route, Routes } from 'react-router';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventListPage } from '../features/events/EventListPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { PendingPage } from './PendingPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<EventListPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route path="login" element={<PendingPage title="ログイン" />} />
        <Route path="signup" element={<PendingPage title="新規登録" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
