import type { EventFilter } from './eventFilter';
import type { ApplicationStatus } from '../applications/types';

/**
 * 募集の状態（docs/06の5-12）。一覧には受付中・満員・締切だけが出る。
 * 終了・中止は、主催者と申請したことがある人にだけ返す（DB-08）。非表示は状態として返さない。
 */
export type EventState = 'open' | 'full' | 'closed' | 'ongoing' | 'ended' | 'cancelled';

export type TargetLevel = 'inexperienced' | 'beginner' | 'experienced';

export type Area =
  | 'chikusa'
  | 'higashi'
  | 'kita'
  | 'nishi'
  | 'nakamura'
  | 'naka'
  | 'showa'
  | 'mizuho'
  | 'atsuta'
  | 'nakagawa'
  | 'minato'
  | 'minami'
  | 'moriyama'
  | 'midori'
  | 'meito'
  | 'tempaku';

/**
 * 未ログインにも公開する募集の情報（docs/03のFR-05、docs/11の2-1）。
 * くわしい住所・主催者のID・連絡先は、この型に加えない。住所は getLocation で別に取得する。
 */
export interface PublicEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  area: Area;
  targetLevels: TargetLevel[];
  description: string | null;
  belongings: string | null;
  capacity: number;
  remaining: number;
  fee: number;
  hostNickname: string;
  state: EventState;
}

/** 募集詳細。公開する情報に、見ている人との関係だけを加える。 */
export interface EventDetail extends PublicEvent {
  /** 見ている人が主催者か。判定は取得の窓口が行い、画面はIDを扱わない */
  isHost: boolean;
  /** 見ている人の最新の申請。未申請・主催者・未ログインは null */
  myApplication: {
    id: string;
    status: ApplicationStatus;
    /** キャンセル・取り下げの後で、申請が合計3回に達していない（docs/11の2-2） */
    canReapply: boolean;
  } | null;
}

/** 主催した募集（docs/06の6-5の get_my_events）。非表示の募集は開催日時だけ（docs/11の4-4）。 */
export type MyEvent =
  | {
      hidden: false;
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      state: EventState;
      capacity: number;
      approvedCount: number;
      pendingCount: number;
    }
  | { hidden: true; startsAt: string; endsAt: string };

/** 承認された人と主催者だけに見せる情報（docs/06の4-4）。 */
export interface EventLocation {
  venueName: string | null;
  address: string;
  note: string | null;
}

export interface EventListResult {
  items: PublicEvent[];
  /** 続きがある場合の位置。ない場合は null */
  nextCursor: string | null;
}

/** 募集の作成で送る内容（docs/11の2-1・3-3）。主催者のIDは送らない。 */
export interface CreateEventInput {
  /** 二重送信の防止（docs/06の4-3の client_request_id）。同じ値の作成は1件にまとめる */
  clientRequestId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  area: Area;
  targetLevels: TargetLevel[];
  description: string | null;
  belongings: string | null;
  capacity: number;
  fee: number;
  location: EventLocation;
}

/** 作成を断る理由。画面は理由に応じて案内する。 */
export type CreateEventRejection =
  'notLoggedIn' | 'profileRequired' | 'minor' | 'rateLimited' | 'invalid';

export type CreateEventResult =
  { status: 'created'; eventId: string } | { status: 'rejected'; reason: CreateEventRejection };

/**
 * 募集の取得・作成の窓口。画面はこの形だけに依存する。
 * 見ている人は、窓口が内部でログイン状態から決める。画面から利用者のIDを渡さない。
 * 将来は、docs/06の6-5の関数（list_events・get_event・create_event・get_my_events）を呼ぶ実装に置き換える。
 */
export interface EventRepository {
  /**
   * 開催前の募集を、開催日時の順に返す。条件（EVT-05）を渡すと、合う募集だけを返す。
   * 続きを読むときは、前と同じ条件を渡す。
   */
  listEvents(cursor?: string, filter?: EventFilter): Promise<EventListResult>;
  /** 見られる募集を返す。ない場合と、見られない場合は、どちらも null を返す。 */
  getEvent(id: string): Promise<EventDetail | null>;
  /** くわしい住所。見てよい人（主催者と承認済みの参加者、docs/06の5-4）以外には null を返す。 */
  getLocation(eventId: string): Promise<EventLocation | null>;
  /** 募集と住所を作成する。通信の失敗は例外、条件による拒否は結果で返す。 */
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  /** 自分が主催した募集。終了・中止・非表示も含め、開催日時の順に返す。未ログインは空を返す。 */
  getMyEvents(): Promise<MyEvent[]>;
}
