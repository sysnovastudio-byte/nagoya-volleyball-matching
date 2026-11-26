import { useSyncExternalStore } from 'react';
import { devSession } from './devRepositories';
import { DEV_PERSONAS } from './devUsers';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:DevBar');

const GUEST_VALUE = 'guest';

/**
 * 【開発専用】ログインしている利用者を切り替える帯。
 * AppLayout が import.meta.env.DEV のときだけ読み込むため、本番用のビルドには入らない。
 */
export default function DevBar() {
  const userId = useSyncExternalStore(devSession.subscribe, devSession.getUserId);

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
      </div>
    </div>
  );
}
