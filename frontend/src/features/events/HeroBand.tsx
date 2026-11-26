/** 募集一覧の上部の呼びかけ（docs/01の2章）。ボールの軌道は飾り。 */
export function HeroBand() {
  return (
    <div className="relative overflow-hidden bg-main text-white">
      <div className="mx-auto max-w-288 px-4 py-5 md:py-8">
        <h1 className="text-xl font-bold md:text-2xl">バレーしたい人、集まれ！</h1>
        <p>
          一人でも、初心者でも、
          <br className="md:hidden" />
          気軽にバレーを楽しもう。
        </p>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 520 150"
        fill="none"
        className="pointer-events-none absolute right-2 bottom-0 h-full md:right-16"
      >
        {/* スマートフォンでは文字と重なるため、軌道の線は出さない */}
        <path
          d="M300 148C330 70 400 30 470 52"
          className="hidden md:block"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="3"
          strokeDasharray="2 12"
          strokeLinecap="round"
        />
        <circle cx="484" cy="62" r="22" className="fill-accent" />
        <path
          d="M464 55c14 3 27 13 30 28M484 40c-5 13-3 30 7 42M506 57c-13-2-27 4-36 17"
          className="stroke-ink"
          strokeOpacity="0.55"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
