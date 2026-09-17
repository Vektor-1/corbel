import { cn } from '@/lib/cn';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface-muted)] p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
            value === option.value
              ? 'bg-[var(--editor-surface)] text-[var(--editor-text)] shadow-sm'
              : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
