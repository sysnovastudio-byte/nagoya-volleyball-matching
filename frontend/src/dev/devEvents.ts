import type { ApplicationStatus } from '../features/applications/types';
import type { EventLocation, PublicEvent } from '../features/events/types';
import { DEV_MEMBER_IDS } from './devUsers';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devEvents');

/**
 * 【開発専用】保存されている募集の形。画面に返す前に、状態・残り枠・主催者の名前を決める。
 * 承認済みの人数は保存せず、申請から数える（docs/06の5-1）。
 */
export interface DevEventRecord extends Omit<PublicEvent, 'remaining' | 'state' | 'hostNickname'> {
  hostId: string;
  status: 'open' | 'closed' | 'cancelled';
  hidden: boolean;
  /** 作成した画面から送られた二重送信の防止の値。最初からある募集は null */
  clientRequestId: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

/** 今日から数えた日の、日本時間の時刻を返す。 */
function jst(now: Date, daysFromNow: number, hour: number, minute = 0) {
  const today = new Date(now.getTime() + JST_OFFSET_MS);
  const utc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + daysFromNow,
    hour,
    minute,
  );
  return new Date(utc - JST_OFFSET_MS).toISOString();
}

/** 架空の募集。実在の住所・連絡先・人や団体を含めない。 */
export function createDevEvents(now: Date): DevEventRecord[] {
  return [
    {
      id: 'dev-beginner-afternoon',
      title: 'はじめて歓迎！土曜の午後バレー',
      startsAt: jst(now, 10, 13),
      endsAt: jst(now, 10, 16),
      area: 'nakamura',
      targetLevels: ['inexperienced', 'beginner'],
      description:
        'はじめての方も、久しぶりの方も歓迎です。前半は基礎練習、後半はゆるい試合をします。途中の休憩も多めにとります。',
      belongings: '室内シューズ、飲み物、タオル',
      capacity: 12,
      fee: 500,
      hostId: 'dev-user-b',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-easy-morning',
      title: '日曜朝のゆるバレー',
      startsAt: jst(now, 11, 9),
      endsAt: jst(now, 11, 11, 30),
      area: 'midori',
      targetLevels: ['beginner', 'experienced'],
      description: '体を動かしたい人の朝の会です。',
      belongings: null,
      capacity: 10,
      fee: 300,
      hostId: 'dev-host-haru',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-weekday-night',
      title: '平日夜にしっかり動く会',
      startsAt: jst(now, 14, 18, 30),
      endsAt: jst(now, 14, 21),
      area: 'chikusa',
      targetLevels: ['experienced'],
      description: null,
      belongings: '室内シューズ、サポーター',
      capacity: 14,
      fee: 700,
      hostId: 'dev-host-minato',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-spike-practice',
      title: 'スパイク練習会',
      startsAt: jst(now, 17, 17),
      endsAt: jst(now, 17, 20),
      area: 'kita',
      targetLevels: ['experienced'],
      description: 'スパイクを中心に練習します。',
      belongings: '室内シューズ',
      capacity: 8,
      fee: 600,
      hostId: 'dev-host-tsubasa',
      status: 'closed',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-family-morning',
      title: '家族や友人と楽しむ午前バレー',
      startsAt: jst(now, 18, 10),
      endsAt: jst(now, 18, 12),
      area: 'nakamura',
      targetLevels: ['inexperienced', 'beginner', 'experienced'],
      description: '各自で1人ずつ申請してください。',
      belongings: '動きやすい服装',
      capacity: 16,
      fee: 0,
      hostId: 'dev-host-yui',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    // ここから下は、未ログインの一覧に出ないことを確かめるためのもの
    {
      id: 'dev-ongoing',
      title: '開催中の会（一覧に出ない）',
      startsAt: new Date(now.getTime() - HOUR_MS).toISOString(),
      endsAt: new Date(now.getTime() + HOUR_MS).toISOString(),
      area: 'naka',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 10,
      fee: 400,
      hostId: 'dev-user-b',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-ended',
      title: '終了した会（見られない）',
      startsAt: new Date(now.getTime() - 4 * HOUR_MS).toISOString(),
      endsAt: new Date(now.getTime() - 2 * HOUR_MS).toISOString(),
      area: 'naka',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 10,
      fee: 400,
      hostId: 'dev-host-haru',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-cancelled',
      title: '中止した会（見られない）',
      startsAt: jst(now, 12, 13),
      endsAt: jst(now, 12, 15),
      area: 'nishi',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 10,
      fee: 400,
      hostId: 'dev-host-minato',
      status: 'cancelled',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-hidden',
      title: '非表示の会（見られない）',
      startsAt: jst(now, 13, 13),
      endsAt: jst(now, 13, 15),
      area: 'higashi',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 10,
      fee: 400,
      hostId: 'dev-host-tsubasa',
      status: 'open',
      hidden: true,
      clientRequestId: null,
    },
    // ここから下は、利用者Bが主催する、申請者の管理を確かめるためのもの
    {
      id: 'dev-b-full',
      title: '木曜夜のミニゲーム会',
      startsAt: jst(now, 8, 19),
      endsAt: jst(now, 8, 21),
      area: 'showa',
      targetLevels: ['beginner', 'experienced'],
      description: '満員ですが、承認待ちの人が残っています。',
      belongings: '室内シューズ',
      capacity: 6,
      fee: 400,
      hostId: 'dev-user-b',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
    {
      id: 'dev-b-hidden',
      title: '非表示になった会（主催）',
      startsAt: jst(now, 15, 13),
      endsAt: jst(now, 15, 15),
      area: 'minami',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 8,
      fee: 300,
      hostId: 'dev-user-b',
      status: 'open',
      hidden: true,
      clientRequestId: null,
    },
    {
      id: 'dev-b-ended',
      title: '10日前の練習会（終了）',
      // 送信できる期間（終了の7日後まで）を過ぎた会話を確かめるため、10日前の募集にする
      startsAt: new Date(now.getTime() - 10 * DAY_MS).toISOString(),
      endsAt: new Date(now.getTime() - 10 * DAY_MS + 2 * HOUR_MS).toISOString(),
      area: 'atsuta',
      targetLevels: ['beginner'],
      description: null,
      belongings: null,
      capacity: 10,
      fee: 300,
      hostId: 'dev-user-b',
      status: 'open',
      hidden: false,
      clientRequestId: null,
    },
  ];
}

/**
 * 架空の住所。番地の形にせず、実在の場所と取り違えないようにする。
 * 住所のない募集は作らない（docs/06の4-4）ため、すべての募集に用意する。
 */
export function createDevLocations(): Map<string, EventLocation> {
  const ids = [
    'dev-beginner-afternoon',
    'dev-easy-morning',
    'dev-weekday-night',
    'dev-spike-practice',
    'dev-family-morning',
    'dev-ongoing',
    'dev-ended',
    'dev-cancelled',
    'dev-hidden',
    'dev-b-full',
    'dev-b-hidden',
    'dev-b-ended',
  ];
  const letters = 'ABCDEFGHIJKL';
  return new Map(
    ids.map((id, index) => {
      const letter = letters.charAt(index);
      return [
        id,
        {
          venueName: `ダミー体育館${letter}`,
          address: `ダミー住所${letter}（架空）`,
          note: index === 0 ? 'ダミーの集合場所（架空）。入口の前に集まります。' : null,
        },
      ];
    }),
  );
}

/** 【開発専用】保存されている申請の形（docs/06の4-5の event_participants）。 */
export interface DevApplicationRecord {
  id: string;
  eventId: string;
  userId: string;
  status: ApplicationStatus;
  appliedAt: Date;
  decidedAt: Date | null;
}

/** 帯で選べる利用者の申請。状態ごとの表示を確かめるためのもの。 */
const NAMED_APPLICATIONS: [eventId: string, userId: string, status: ApplicationStatus][] = [
  ['dev-family-morning', 'dev-user-a', 'approved'],
  ['dev-weekday-night', 'dev-user-a', 'pending'],
  ['dev-spike-practice', 'dev-user-a', 'rejected'],
  ['dev-ongoing', 'dev-user-a', 'approved'],
  ['dev-ended', 'dev-user-a', 'approved'],
  ['dev-hidden', 'dev-user-a', 'approved'],
  ['dev-beginner-afternoon', 'dev-user-minor', 'pending'],
];

/** 人数を埋める架空の申請。名前のある申請に加えて、この数だけ作る。 */
const FILLER_APPLICATIONS: Record<string, Partial<Record<ApplicationStatus, number>>> = {
  'dev-beginner-afternoon': { approved: 9, pending: 2, rejected: 1 },
  'dev-easy-morning': { approved: 10 },
  'dev-weekday-night': { approved: 13 },
  'dev-spike-practice': { approved: 6 },
  'dev-family-morning': { approved: 9 },
  'dev-ongoing': { approved: 3, pending: 1 },
  'dev-ended': { approved: 7 },
  'dev-cancelled': { approved: 2 },
  'dev-hidden': { approved: 1 },
  'dev-b-full': { approved: 6, pending: 2 },
  'dev-b-hidden': { approved: 1, pending: 1 },
  'dev-b-ended': { approved: 5, rejected: 1 },
};

const STATUS_ORDER: ApplicationStatus[] = ['approved', 'pending', 'rejected'];

export function createDevApplications(now: Date): DevApplicationRecord[] {
  const applications: DevApplicationRecord[] = [];
  const add = (eventId: string, userId: string, status: ApplicationStatus) => {
    const index = applications.length;
    // 申請の日時は数日前からずらす。回数の上限（直近24時間）には数えない
    const appliedAt = new Date(now.getTime() - 3 * DAY_MS - index * HOUR_MS);
    applications.push({
      id: `dev-application-${index + 1}`,
      eventId,
      userId,
      status,
      appliedAt,
      decidedAt: status === 'pending' ? null : new Date(appliedAt.getTime() + HOUR_MS),
    });
  };

  for (const [eventId, userId, status] of NAMED_APPLICATIONS) add(eventId, userId, status);
  for (const [eventId, counts] of Object.entries(FILLER_APPLICATIONS)) {
    let next = 0;
    for (const status of STATUS_ORDER) {
      for (let i = 0; i < (counts[status] ?? 0); i += 1) {
        const userId = DEV_MEMBER_IDS[next];
        if (!userId) throw new Error(`${eventId} の申請者が足りません。`);
        add(eventId, userId, status);
        next += 1;
      }
    }
  }
  return applications;
}
