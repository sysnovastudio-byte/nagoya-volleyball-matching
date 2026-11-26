import type { EventLocation, PublicEvent } from '../features/events/types';
import { markDevModule } from './marker';

markDevModule('DEV-ONLY-DUMMY-DATA:devEvents');

/** 【開発専用】保存されている募集の形。画面に返す前に、状態・残り枠・主催者の名前を決める。 */
export interface DevEventRecord extends Omit<PublicEvent, 'remaining' | 'state' | 'hostNickname'> {
  hostId: string;
  approvedCount: number;
  status: 'open' | 'closed' | 'cancelled';
  hidden: boolean;
  /** 作成した画面から送られた二重送信の防止の値。最初からある募集は null */
  clientRequestId: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
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
      approvedCount: 9,
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
      approvedCount: 10,
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
      approvedCount: 13,
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
      approvedCount: 6,
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
      approvedCount: 10,
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
      approvedCount: 4,
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
      approvedCount: 8,
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
      approvedCount: 2,
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
      approvedCount: 2,
      fee: 400,
      hostId: 'dev-host-tsubasa',
      status: 'open',
      hidden: true,
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
  ];
  const letters = 'ABCDEFGHI';
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
