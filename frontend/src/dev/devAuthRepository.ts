import { AGREEMENT_VERSION } from '../features/auth/agreements';
import { checkSignUpForm, emailError, newPasswordError } from '../features/auth/authRules';
import type { AgreementDocument, AuthRepository, Viewer } from '../features/auth/types';
import { findDevUser, type DevDatabase } from './devDatabase';
import type { DevSession } from './devSession';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devAuthRepository');

interface DevAuthRepositoryOptions {
  db: DevDatabase;
  session: DevSession;
  now?: () => Date;
}

/** ログインの画面から送ると、この利用者になる */
export const DEV_SIGN_IN_USER_ID = 'dev-user-a';

/** 開発用のメール認証のリンクに付ける値。SCR-003 の表示を切り替えて確かめるためのもの */
export const DEV_VERIFY_TOKENS = {
  success: 'dev-verify-success',
  expired: 'dev-verify-expired',
} as const;

/** 開発用のパスワード再設定のリンクに付ける値。SCR-004 の表示を切り替えて確かめるためのもの */
export const DEV_RESET_TOKENS = {
  success: 'dev-reset-success',
  expired: 'dev-reset-expired',
} as const;

const DOCUMENTS: AgreementDocument[] = ['terms', 'privacy', 'message_review'];

/**
 * 【開発専用】開発用の帯で選んだ利用者を、ログインしている人として返す。
 * **本物の認証ではない。** 入力はどこにも送らず、メールも送らない。
 * パスワードは照合も保存もせず、メールアドレスも保存しない。**権限の確認にはならない。**
 * メールアドレスを保存しないため、未ログインで申し込んだ再設定のリンクは、利用者Aのものとして扱う。
 */
export function createDevAuthRepository({
  db,
  session,
  now = () => new Date(),
}: DevAuthRepositoryOptions): AuthRepository {
  return {
    getViewer: () => {
      const user = findDevUser(db, session.getUserId());
      const viewer: Viewer | null = user
        ? {
            role: user.role,
            status: user.status,
            profile: user.profile ? { nickname: user.profile.nickname } : null,
          }
        : null;
      return Promise.resolve(viewer);
    },
    onViewerChange: (listener) => session.subscribe(listener),

    // 入力は確かめず、利用者Aになる
    signIn: () => {
      session.setUserId(DEV_SIGN_IN_USER_ID);
      return Promise.resolve({ status: 'signedIn' });
    },

    signUp: (input) => {
      const has = (document: AgreementDocument) =>
        input.agreements.some((item) => item.document === document);
      // 画面と同じ検証。本番では Supabase Auth と登録の関数が確かめる
      const errors = checkSignUpForm({
        email: input.email,
        password: input.password,
        adultDeclared: input.adultDeclared,
        agreements: {
          termsAndPrivacy: has('terms') && has('privacy'),
          messageReview: has('message_review'),
        },
      });
      if (Object.keys(errors).length > 0) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }
      if (input.agreements.some((item) => item.version !== AGREEMENT_VERSION)) {
        return Promise.resolve({ status: 'rejected', reason: 'outdatedAgreement' });
      }

      // メールアドレスとパスワードは保存しない。同意だけを、ダミーの利用者に記録する
      // IDは登録した人数から決める。認証待ちの人数から決めると、認証の後に同じIDが付いてしまう
      const registered = db.users.filter((user) => user.id.startsWith('dev-registered-')).length;
      const id = `dev-registered-${registered + 1}`;
      db.users.push({
        id,
        role: 'user',
        status: 'active',
        profile: null,
      });
      // 文書ごとに、版と日時（ダミー）を別々に記録する（docs/06の4-17）
      for (const document of DOCUMENTS) {
        db.agreements.push({ userId: id, document, version: AGREEMENT_VERSION, agreedAt: now() });
      }
      db.pendingVerifications.push(id);
      return Promise.resolve({ status: 'confirmationSent' });
    },

    verifyEmail: (token) => {
      if (token === DEV_VERIFY_TOKENS.expired) {
        return Promise.resolve({ status: 'rejected', reason: 'expired' });
      }
      // 最後に登録したダミーの利用者を、認証済みにしてログインさせる
      const userId = db.pendingVerifications.at(-1);
      if (token !== DEV_VERIFY_TOKENS.success || !userId) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }
      db.pendingVerifications = db.pendingVerifications.filter((id) => id !== userId);
      session.setUserId(userId);
      return Promise.resolve({ status: 'verified' });
    },

    // 入力の形式だけを確かめる。認証を待っている利用者のリンクは、そのまま使える
    resendVerification: ({ email }) =>
      Promise.resolve(
        emailError(email) ? { status: 'rejected', reason: 'invalid' } : { status: 'sent' },
      ),

    requestPasswordReset: ({ email }) => {
      if (emailError(email)) return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      // 登録の有無は確かめない（本番も、未登録のアドレスに同じ結果を返す）
      db.pendingPasswordResets.push(DEV_SIGN_IN_USER_ID);
      return Promise.resolve({ status: 'sent' });
    },

    // 宛先は、ログイン中の人から決める（画面から受け取らない）
    requestPasswordChange: () => {
      const user = findDevUser(db, session.getUserId());
      if (!user) return Promise.resolve({ status: 'rejected', reason: 'notLoggedIn' });
      db.pendingPasswordResets.push(user.id);
      return Promise.resolve({ status: 'sent' });
    },

    verifyPasswordReset: (token) => {
      if (token === DEV_RESET_TOKENS.expired) {
        return Promise.resolve({ status: 'rejected', reason: 'expired' });
      }
      // 最後に申し込んだ利用者（退会した人を除く）でログインさせる
      const userId = db.pendingPasswordResets.at(-1);
      if (token !== DEV_RESET_TOKENS.success || !userId || !findDevUser(db, userId)) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }
      // リンクは1回だけ使える
      db.pendingPasswordResets = db.pendingPasswordResets.filter((id) => id !== userId);
      db.passwordRecoveryUserId = userId;
      session.setUserId(userId);
      return Promise.resolve({ status: 'verified' });
    },

    updatePassword: ({ password }) => {
      const userId = session.getUserId();
      // 再設定のリンクを開いた人だけ。帯で利用者を切り替えた場合も断る
      if (!userId || !findDevUser(db, userId) || db.passwordRecoveryUserId !== userId) {
        return Promise.resolve({ status: 'rejected', reason: 'expired' });
      }
      if (newPasswordError(password)) {
        return Promise.resolve({ status: 'rejected', reason: 'invalid' });
      }
      // パスワードは保存しない
      db.passwordRecoveryUserId = null;
      return Promise.resolve({ status: 'updated' });
    },

    signOut: () => {
      db.passwordRecoveryUserId = null;
      session.setUserId(null);
      return Promise.resolve();
    },
  };
}
