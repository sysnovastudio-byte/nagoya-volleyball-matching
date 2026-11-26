import type { ReactNode } from 'react';
import { textLength } from '../../lib/text';

/** 入力欄に渡す、項目名・補足・誤りとのつながり。 */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  /** 文字数の上限。指定すると、今の文字数を示す */
  counter?: { value: string; max: number };
  children: (control: FieldControlProps) => ReactNode;
}

export const INPUT_CLASS =
  'min-h-12 w-full min-w-0 rounded-xl border border-field-line bg-surface px-3 py-2 aria-invalid:border-2 aria-invalid:border-danger';

/**
 * 項目名・必須・上限・誤りを、入力欄の近くに示す（docs/11の5-1）。
 * 項目名は常に表示し、補足と誤りは読み上げでも入力欄とつながるようにする。
 */
export function FormField({ id, label, required, hint, error, counter, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const counterId = counter ? `${id}-counter` : undefined;
  const describedBy = [errorId, hintId, counterId].filter(Boolean).join(' ') || undefined;
  const length = counter ? textLength(counter.value) : 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-bold">
        {label}
        <RequiredMark required={required} />
      </label>
      {hint && (
        <p id={hintId} className="text-muted">
          {hint}
        </p>
      )}
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
        ...(required ? { 'aria-required': true } : {}),
      })}
      <div className="flex flex-wrap justify-between gap-x-3">
        {error ? (
          <p id={errorId} className="font-bold text-danger">
            {error}
          </p>
        ) : (
          <span />
        )}
        {counter && (
          <p
            id={counterId}
            className={`ml-auto ${length > counter.max ? 'font-bold text-danger' : 'text-muted'}`}
          >
            {length.toLocaleString('ja-JP')}／{counter.max.toLocaleString('ja-JP')}文字
          </p>
        )}
      </div>
    </div>
  );
}

export function RequiredMark({ required }: { required?: boolean | undefined }) {
  return required ? (
    <span className="rounded-md bg-sub px-1.5 leading-normal font-bold text-white">必須</span>
  ) : (
    <span className="rounded-md border border-line px-1.5 leading-normal text-muted">任意</span>
  );
}
