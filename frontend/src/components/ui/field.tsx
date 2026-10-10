import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const controlClass =
  'h-7 w-full rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface-raised)] px-2 text-xs text-[var(--editor-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] outline-none transition-colors placeholder:text-[var(--editor-text-subtle)] hover:border-[var(--editor-border-strong)] focus:border-[var(--editor-accent)] focus:ring-2 focus:ring-[var(--editor-accent)]/20 aria-invalid:border-[var(--editor-danger)] aria-invalid:ring-2 aria-invalid:ring-[var(--editor-danger)]/20';

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
