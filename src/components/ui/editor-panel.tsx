import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EditorPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-4 py-3.5', className)}>
      <header className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--editor-text-subtle)]">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--editor-text-subtle)]/70">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
