import { act, render, screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect } from 'vitest';
import { appRoutes } from '../app/App';
import { createDevAccountRepository } from '../dev/devAccountRepository';
import { createDevAdminRepository } from '../dev/devAdminRepository';
import { createDevApplicationRepository } from '../dev/devApplicationRepository';
import { createDevAuthRepository } from '../dev/devAuthRepository';
import { createDevBlockRepository } from '../dev/devBlockRepository';
import { createDevConversationRepository } from '../dev/devConversationRepository';
import { createDevDatabase } from '../dev/devDatabase';
import { createDevEventRepository } from '../dev/devEventRepository';
import { createDevNotificationRepository } from '../dev/devNotificationRepository';
import { createDevProfileRepository } from '../dev/devProfileRepository';
import { createDevReportRepository } from '../dev/devReportRepository';
import { createDevSession } from '../dev/devSession';
import { AccountRepositoryContext } from '../features/account/repositoryContext';
import type { AccountRepository } from '../features/account/types';
import { AdminRepositoryContext } from '../features/admin/repositoryContext';
import { ApplicationRepositoryContext } from '../features/applications/repositoryContext';
import { AuthRepositoryContext } from '../features/auth/repositoryContext';
import { ConversationRepositoryContext } from '../features/conversations/repositoryContext';
import type { ConversationRepository } from '../features/conversations/types';
import { EventRepositoryContext } from '../features/events/repositoryContext';
import type { AuthRepository } from '../features/auth/types';
import type { EventRepository } from '../features/events/types';
import { NotificationRepositoryContext } from '../features/notifications/repositoryContext';
import { ProfileRepositoryContext } from '../features/profiles/repositoryContext';
import { ReportRepositoryContext } from '../features/reports/repositoryContext';
import { BlockRepositoryContext } from '../features/safety/repositoryContext';

/** 【テスト専用】開発用の窓口を、テストごとの新しいデータとログイン状態でつなぐ。 */
export function renderApp(
  path: string,
  {
    userId = null,
    mfaVerified = true,
    events,
    conversations,
    auth,
    account,
  }: {
    userId?: string | null;
    /** 管理者（ダミー）の多要素認証 */
    mfaVerified?: boolean;
    events?: Partial<EventRepository>;
    conversations?: Partial<ConversationRepository>;
    auth?: Partial<AuthRepository>;
    account?: Partial<AccountRepository>;
  } = {},
) {
  const db = createDevDatabase(new Date());
  const session = createDevSession(userId, { mfaVerified });
  const eventRepository = { ...createDevEventRepository({ db, session }), ...events };
  const conversationRepository = {
    ...createDevConversationRepository({ db, session }),
    ...conversations,
  };
  const authRepository = { ...createDevAuthRepository({ db, session }), ...auth };
  const accountRepository = { ...createDevAccountRepository({ db, session }), ...account };
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <AuthRepositoryContext value={authRepository}>
      <EventRepositoryContext value={eventRepository}>
        <ApplicationRepositoryContext value={createDevApplicationRepository({ db, session })}>
          <ProfileRepositoryContext value={createDevProfileRepository({ db, session })}>
            <ConversationRepositoryContext value={conversationRepository}>
              <NotificationRepositoryContext
                value={createDevNotificationRepository({ db, session })}
              >
                <BlockRepositoryContext value={createDevBlockRepository({ db, session })}>
                  <ReportRepositoryContext value={createDevReportRepository({ db, session })}>
                    <AdminRepositoryContext value={createDevAdminRepository({ db, session })}>
                      <AccountRepositoryContext value={accountRepository}>
                        <RouterProvider router={router} />
                      </AccountRepositoryContext>
                    </AdminRepositoryContext>
                  </ReportRepositoryContext>
                </BlockRepositoryContext>
              </NotificationRepositoryContext>
            </ConversationRepositoryContext>
          </ProfileRepositoryContext>
        </ApplicationRepositoryContext>
      </EventRepositoryContext>
    </AuthRepositoryContext>,
  );
  const switchUser = (next: string | null) => {
    act(() => {
      session.setUserId(next);
    });
  };
  return { db, session, router, switchUser };
}

/** 自動的に消える通知（aria-live の「お知らせ」）。中身が入るまで待つ。 */
export async function findToast() {
  const region = screen.getByRole('status', { name: 'お知らせ' });
  await waitFor(() => {
    expect(region).not.toBeEmptyDOMElement();
  });
  return region;
}

/** 「…」のメニューを開いて、操作を選ぶ。 */
export async function chooseFromMenu(
  user: ReturnType<typeof userEvent.setup>,
  menuName: string,
  itemName: string,
) {
  await user.click(await screen.findByRole('button', { name: menuName }));
  await user.click(screen.getByRole('button', { name: itemName }));
}
