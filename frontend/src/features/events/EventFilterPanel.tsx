import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { INPUT_CLASS } from '../../components/ui/FormField';
import { checkFilter, EMPTY_FILTER, type EventFilter } from './eventFilter';
import { isMunicipality, isNagoyaWard, MUNICIPALITIES, NAGOYA_WARDS } from './eventRules';
import { municipalityLabel, wardLabel } from './format';

interface EventFilterPanelProps {
  filter: EventFilter;
  onApply: (filter: EventFilter) => void;
}

/**
 * 募集の絞り込み（EVT-05）。日付の範囲と開催地（市町村、名古屋市は区も）。
 * 条件は「この条件で探す」で反映する。入力のたびに読み込み直さない。
 */
export function EventFilterPanel({ filter, onApply }: EventFilterPanelProps) {
  const [draft, setDraft] = useState<EventFilter>(filter);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = checkFilter(draft);
    setError(found);
    if (found) {
      document.getElementById('filter-date-to')?.focus();
      return;
    }
    onApply(draft);
  };

  return (
    <form
      noValidate
      aria-label="募集の絞り込み"
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4"
    >
      <fieldset
        aria-describedby={error ? 'filter-date-error' : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="mb-1 font-bold">開催日</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sub">この日から</span>
          <input
            id="filter-date-from"
            type="date"
            value={draft.dateFrom ?? ''}
            onChange={(event) => {
              setDraft({ ...draft, dateFrom: event.target.value || null });
            }}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sub">この日まで</span>
          <input
            id="filter-date-to"
            type="date"
            value={draft.dateTo ?? ''}
            min={draft.dateFrom ?? undefined}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setDraft({ ...draft, dateTo: event.target.value || null });
            }}
            className={INPUT_CLASS}
          />
        </label>
        {error && (
          <p id="filter-date-error" className="font-bold text-danger">
            {error}
          </p>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-bold">市町村</span>
        <select
          value={draft.municipality ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            // 名古屋市以外に変えたら、区の指定を外す
            setDraft({
              ...draft,
              municipality: isMunicipality(value) ? value : null,
              ward: value === 'nagoya' ? draft.ward : null,
            });
          }}
          className={INPUT_CLASS}
        >
          <option value="">愛知県のすべて</option>
          {MUNICIPALITIES.map((municipality) => (
            <option key={municipality} value={municipality}>
              {municipalityLabel(municipality)}
            </option>
          ))}
        </select>
      </label>

      {draft.municipality === 'nagoya' && (
        <label className="flex flex-col gap-1">
          <span className="font-bold">区</span>
          <select
            value={draft.ward ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setDraft({ ...draft, ward: isNagoyaWard(value) ? value : null });
            }}
            className={INPUT_CLASS}
          >
            <option value="">名古屋市のすべての区</option>
            {NAGOYA_WARDS.map((ward) => (
              <option key={ward} value={ward}>
                {wardLabel(ward)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit">この条件で探す</Button>
        <Button
          type="button"
          variant="text"
          onClick={() => {
            setDraft(EMPTY_FILTER);
            setError(null);
            onApply(EMPTY_FILTER);
          }}
        >
          条件をクリア
        </Button>
      </div>
    </form>
  );
}
