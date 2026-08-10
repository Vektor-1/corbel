import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const controlClass =
  'h-7 w-full rounded-md border border-[var(--editor-border)] bg-transparent px-2 text-xs text-[var(--editor-text)] outline-none transition-colors hover:border-[var(--editor-border-strong)] focus:border-[var(--editor-accent)] focus:ring-1 focus:ring-[var(--editor-accent)]/40';

export function FieldLabel({ label, unit, children }: { label: string; unit?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-[var(--editor-text-subtle)]">
        <span>{label}</span>
        {unit && <span className="font-mono normal-case">{unit}</span>}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        controlClass,
        type === 'number' &&
          'font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(controlClass, 'appearance-none pr-7', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--editor-text-subtle)]"
      />
    </span>
  );
}
