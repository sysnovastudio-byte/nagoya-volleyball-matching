import { useSyncExternalStore } from 'react';
import { devSession } from './devRepositories';
import { DEV_ADMIN_ID, DEV_PERSONAS } from './devUsers';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:DevBar');

const GUEST_VALUE = 'guest';

/**
 * 【開発専用】ログインしている利用者を切り替える帯。
 * AppLayout が import.meta.env.DEV のときだけ読み込むため、本番用のビルドには入らない。
 */
export default function DevBar() {
  const userId = useSyncExternalStore(devSession.subscribe, devSession.getUserId);
  const mfaVerified = useSyncExternalStore(devSession.subscribe, devSession.getMfaVerified);

  return (
    <div className="bg-ink px-4 py-1.5 text-white">
      <div className="mx-auto flex max-w-288 flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <p>開発用のダミーデータを表示中</p>
        <label className="flex flex-wrap items-center gap-2">
          <span>表示する利用者</span>
          <select
            value={userId ?? GUEST_VALUE}
            onChange={(event) => {
              const value = event.target.value;
              devSession.setUserId(value === GUEST_VALUE ? null : value);
            }}
            className="min-h-11 rounded-lg border border-white bg-ink px-2 text-white"
          >
            {/* 新規登録したダミーの利用者は、帯の選択肢にないため加える */}
            {userId !== null && !DEV_PERSONAS.some((persona) => persona.userId === userId) && (
              <option value={userId}>新規登録したダミーの利用者</option>
            )}
            {DEV_PERSONAS.map((persona) => (
              <option key={persona.label} value={persona.userId ?? GUEST_VALUE}>
                {persona.label}
              </option>
            ))}
          </select>
        </label>
        {/* 管理者（ダミー）のときだけ。「未」では、管理の画面の代わりに多要素認証が必要と示す */}
        {userId === DEV_ADMIN_ID && (
          <label className="flex flex-wrap items-center gap-2">
            <span>多要素認証</span>
            <select
              value={mfaVerified ? 'verified' : 'required'}
              onChange={(event) => {
                devSession.setMfaVerified(event.target.value === 'verified');
              }}
              className="min-h-11 rounded-lg border border-white bg-ink px-2 text-white"
            >
              <option value="verified">済</option>
              <option value="required">未</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
