/** 通報の対象の種類（docs/11の4-3）。 */
export type ReportTargetKind = 'user' | 'event' | 'message';

/** 通報の理由（docs/11の4-3・docs/06の4-19）。措置の理由の分類にも使う。 */
export type ReportReason =
  | 'harassment'
  | 'solicitation'
  | 'falseInformation'
  | 'dating'
  | 'dangerousOrIllegal'
  | 'personalInformation'
  | 'other';

/** 通報の状態（docs/11の4-3）。 */
export type ReportStatus = 'open' | 'inProgress' | 'resolved' | 'dismissed';

/** 通報の画面に示す、対象の内容。見る人が見られるものだけ。 */
export type ReportTarget =
  | { kind: 'user'; id: string; nickname: string }
  | { kind: 'event'; id: string; title: string }
  | {
      kind: 'message';
      id: string;
      /** 送信者の名前。退会した人は null（画面では「退会したユーザー」） */
      senderNickname: string | null;
      body: string;
      createdAt: string;
      /** 受付の後に戻る会話 */
      conversationId: string;
    };

/**
 * 通報できない理由。
 * - notFound：対象がない・見られない・退会した人（ユーザーの通報だけ。DB-30）・自分自身・自分のもの
 * どれで断っても、画面には同じ文を示す
 */
export type ReportTargetResult =
  | { status: 'ok'; target: ReportTarget }
  | { status: 'rejected'; reason: 'notLoggedIn' | 'notFound' };

export interface ReportInput {
  kind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  /** 補足。500文字まで。空なら null */
  detail: string | null;
}

export type SubmitReportResult =
  | { status: 'done' }
  | {
      status: 'rejected';
      /**
       * duplicate：同じ対象への、対応が終わっていない通報がある。rateLimited：24時間に10件まで。
       * invalid：理由・補足が条件に合わない
       */
      reason: 'notLoggedIn' | 'notFound' | 'duplicate' | 'rateLimited' | 'invalid';
    };

/**
 * 通報の窓口（SAFE-01〜03）。将来は docs/06の6-5の submit_report を呼ぶ実装に置き換える。
 * 通報する人は、常にログイン中の人。控え（通報時の内容）はDB側で作り、画面から渡さない。
 * 通報者が後から通報を確かめる画面は設けない（docs/10の6-6）。
 */
export interface ReportRepository {
  /** 通報の画面に示す対象。通報できない対象は rejected。 */
  getReportTarget(kind: ReportTargetKind, targetId: string): Promise<ReportTargetResult>;
  submitReport(input: ReportInput): Promise<SubmitReportResult>;
}
