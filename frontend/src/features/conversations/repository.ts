import { lazyDev } from '../../lib/lazyDev';
import type { ConversationRepository } from './types';

const notConnected = () => Promise.reject(new Error('データの取得先に接続していません。'));

/** まだ接続していない場合の実装。本番用のビルドでは、今はこれを使う。 */
const notConnectedRepository: ConversationRepository = {
  startConversation: notConnected,
  startConversationWithApplicant: notConnected,
  listMine: notConnected,
  getMessages: notConnected,
  send: notConnected,
  markRead: notConnected,
};

/** 開発時だけ、ダミーデータの実装を動的に読み込む（events/repository.ts と同じ方法）。 */
function createRepository(): ConversationRepository {
  if (import.meta.env.DEV) {
    const repository = lazyDev(
      async () => (await import('../../dev/devRepositories')).devConversationRepository,
    );
    return {
      startConversation: async (eventId) => (await repository()).startConversation(eventId),
      startConversationWithApplicant: async (applicationId) =>
        (await repository()).startConversationWithApplicant(applicationId),
      listMine: async () => (await repository()).listMine(),
      getMessages: async (id) => (await repository()).getMessages(id),
      send: async (input) => (await repository()).send(input),
      markRead: async (id, seq) => (await repository()).markRead(id, seq),
    };
  }
  return notConnectedRepository;
}

export const conversationRepository = createRepository();
