/** 募集の状態（docs/06の5-12）。終了・中止・非表示は、未ログインには返さない。 */
export type EventState = 'open' | 'full' | 'closed' | 'ongoing';

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
 * くわしい住所・主催者のID・連絡先は、この型に加えない。
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

export interface EventListResult {
  items: PublicEvent[];
  /** 続きがある場合の位置。ない場合は null */
  nextCursor: string | null;
}

/**
 * 募集の取得の窓口。画面はこの形だけに依存する。
 * 将来は、docs/06の list_events・get_event を呼ぶ実装に置き換える。
 */
export interface EventRepository {
  /** 開催前の募集を、開催日時の順に返す。 */
  list(cursor?: string): Promise<EventListResult>;
  /** 見られる募集を返す。ない場合と、見られない場合は、どちらも null を返す。 */
  get(id: string): Promise<PublicEvent | null>;
}
