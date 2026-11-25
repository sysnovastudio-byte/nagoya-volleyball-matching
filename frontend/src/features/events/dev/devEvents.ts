import type { PublicEvent } from '../types';

/**
 * 【開発専用】架空の募集。本番のデータではない。
 * 本番用のビルドに入っていないことを scripts/check-dist.mjs が確かめるための目印。
 */
export const DEV_DATA_MARKER = 'DEV-ONLY-DUMMY-DATA';

/** 保存されている募集の形。画面に返す前に、状態と残り枠を計算する。 */
export interface DevEventRecord extends Omit<PublicEvent, 'remaining' | 'state'> {
  approvedCount: number;
  status: 'open' | 'closed' | 'cancelled';
  hidden: boolean;
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

/** 住所・連絡先・実在の人や団体を含めない。 */
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
      hostNickname: 'そら',
      status: 'open',
      hidden: false,
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
      hostNickname: 'はる',
      status: 'open',
      hidden: false,
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
      hostNickname: 'みなと',
      status: 'open',
      hidden: false,
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
      hostNickname: 'つばさ',
      status: 'closed',
      hidden: false,
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
      hostNickname: 'ゆい',
      status: 'open',
      hidden: false,
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
      hostNickname: 'そら',
      status: 'open',
      hidden: false,
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
      hostNickname: 'はる',
      status: 'open',
      hidden: false,
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
      hostNickname: 'みなと',
      status: 'cancelled',
      hidden: false,
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
      hostNickname: 'つばさ',
      status: 'open',
      hidden: true,
    },
  ];
}
