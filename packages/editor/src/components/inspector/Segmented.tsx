import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useCallback } from 'react';

interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

interface SegmentedProps<V extends string> {
  readonly value: V;
  readonly options: readonly SegmentedOption<V>[];
  readonly onChange: (next: V) => void;
  readonly ariaLabel: string;
}

/**
 * Single-select segmented control built on Radix ToggleGroup. The
 * "single" type makes it behave like a radio group with arrow-key
 * navigation. Visually styled as joined buttons.
 *
 * `V` is constrained to `string` so the value can flow through Radix's
 * string-only event handlers without coercion.
 */
export function Segmented<V extends string>(props: SegmentedProps<V>) {
  const onValueChange = useCallback(
    (next: string) => {
      // Radix fires '' when the user un-selects; segmented control should
      // always have a selection, so ignore empty.
      if (next === '') return;
      props.onChange(next as V);
    },
    [props],
  );

  return (
    <ToggleGroup.Root
      type="single"
      value={props.value}
      onValueChange={onValueChange}
      aria-label={props.ariaLabel}
      className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-[var(--font-mono)] text-xs"
    >
      {props.options.map((opt) => (
        <ToggleGroup.Item
          key={opt.value}
          value={opt.value}
          aria-label={opt.label}
          className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          {opt.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
