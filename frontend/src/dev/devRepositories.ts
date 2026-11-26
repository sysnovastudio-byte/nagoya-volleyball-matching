import { createDevConversationRepository } from './devConversationRepository';
import { createDevApplicationRepository } from './devApplicationRepository';
import { createDevAuthRepository } from './devAuthRepository';
import { createDevDatabase } from './devDatabase';
import { createDevEventRepository } from './devEventRepository';
import { createDevProfileRepository } from './devProfileRepository';
import { createDevSession } from './devSession';
import { DEV_DATA_MARKER, markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devRepositories');

/**
 * 【開発専用】画面が使う開発用の窓口。すべて同じデータとログイン状態を共有する。
 * 各機能の repository.ts が、開発時にだけ動的に読み込む。
 */
console.info(`[${DEV_DATA_MARKER}] 開発用のダミーデータを使っています。`);

export const devSession = createDevSession();
export const devDatabase = createDevDatabase(new Date());

export const devAuthRepository = createDevAuthRepository({
  db: devDatabase,
  session: devSession,
});
export const devEventRepository = createDevEventRepository({
  db: devDatabase,
  session: devSession,
});
export const devApplicationRepository = createDevApplicationRepository({
  db: devDatabase,
  session: devSession,
});
export const devProfileRepository = createDevProfileRepository({
  db: devDatabase,
  session: devSession,
});
export const devConversationRepository = createDevConversationRepository({
  db: devDatabase,
  session: devSession,
});
