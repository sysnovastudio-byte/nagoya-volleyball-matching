interface SegmentedControlProps<T extends string> {
  /** 何を切り替えるか。読み上げに使う */
  label: string;
  /** detail は2行目に示す（件数など）。幅360pxに収めるため */
  options: { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** 表示する内容を切り替えるボタンの列。選んでいるものは aria-pressed で伝える。 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-line p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onChange(option.value);
            }}
            className={`min-h-11 grow basis-0 rounded-lg px-1 py-1 leading-tight font-bold ${
              selected ? 'bg-surface text-main-strong shadow-sm' : 'text-sub'
            }`}
          >
            <span className="block">{option.label}</span>
            {option.detail !== undefined && <span className="block">{option.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
