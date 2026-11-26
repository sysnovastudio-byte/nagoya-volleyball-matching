import { Navigate, Outlet, useLocation } from 'react-router';
import { profileEditPath } from './loginRedirect';
import { useViewer } from './sessionContext';

/**
 * 必須プロフィールが必要な画面（募集作成・会話など）。未登録なら SCR-014 へ移し、入力した後に戻す
 * （docs/11の3-4・Q-40・追加-10）。閲覧だけの画面には使わない。
 * RequireLogin の内側に置く。画面を見せないだけで、書き込みの可否はDB側で判定する。
 */
export function RequireProfile() {
  const viewer = useViewer();
  const { pathname, search } = useLocation();

  if (viewer && !viewer.profile)
    return <Navigate replace to={profileEditPath(`${pathname}${search}`)} />;
  return <Outlet />;
}
