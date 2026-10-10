import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import type { AvailabilityStatus } from '../lib/types';

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={clsx('card p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'brand';
  icon?: ReactNode;
}) {
  const tones = {
    default: 'text-slate-100',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-rose-400',
    brand: 'text-brand-300',
  };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <p className={clsx('mt-2 text-2xl font-bold tabular-nums', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status presentation                                                 */
/* ------------------------------------------------------------------ */

/**
 * The single mapping from occupancy status to colour used across the app.
 * The 3D scene reads the same hex values from AVAILABILITY_HEX below, so the
 * legend, the room grid and the model can never drift apart.
 */
export const AVAILABILITY_HEX: Record<AvailabilityStatus, string> = {
  GREEN: '#22c55e',
  YELLOW: '#f59e0b',
  RED: '#ef4444',
};

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  GREEN: 'Beds available',
  YELLOW: 'One bed left',
  RED: 'Fully booked',
};

export function AvailabilityBadge({
  status,
  freeBeds,
}: {
  status: AvailabilityStatus;
  freeBeds?: number;
}) {
  const styles: Record<AvailabilityStatus, string> = {
    GREEN: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    YELLOW: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
    RED: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  };
  return (
    <span className={clsx('badge', styles[status])}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: AVAILABILITY_HEX[status] }}
      />
      {freeBeds === undefined
        ? AVAILABILITY_LABEL[status]
        : status === 'RED'
          ? 'Full'
          : `${freeBeds} free`}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  IN_PROGRESS: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  CHECKED_OUT: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30',
  CHECKED_IN: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30',
  EXPIRED: 'bg-slate-600/20 text-slate-400 ring-1 ring-slate-600/30',
  SCHEDULED: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  CANCELLED: 'bg-slate-600/20 text-slate-400 ring-1 ring-slate-600/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  VACATED: 'bg-slate-600/20 text-slate-400 ring-1 ring-slate-600/30',
  URGENT: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
  NORMAL: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30',
  LOW: 'bg-slate-600/20 text-slate-400 ring-1 ring-slate-600/30',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('badge', STATUS_STYLES[status] ?? STATUS_STYLES.NORMAL)}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback states                                                     */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <Spinner className="h-5 w-5" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-rose-500/25 bg-rose-950/20 p-8 text-center">
      <AlertCircle className="h-7 w-7 text-rose-400" />
      <p className="text-sm text-rose-200">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-slate-600">{icon}</div>}
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Escape closes the dialog, and the body is locked so the page behind does
  // not scroll under the overlay on mobile.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          'card max-h-[92vh] w-full animate-fade-in overflow-y-auto rounded-b-none sm:rounded-xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.07] bg-surface-1/95 px-5 py-3.5 backdrop-blur">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            className="btn-ghost btn-sm -mr-1"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-white/[0.07] bg-surface-1/95 px-5 py-3.5 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-rose-500/30 bg-rose-950/30 text-rose-200',
    success: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200',
    info: 'border-brand-500/30 bg-brand-950/30 text-brand-200',
    // For a rule that blocks the action without anything having gone wrong.
    warning: 'border-amber-500/30 bg-amber-950/30 text-amber-200',
  };
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={clsx('flex items-start gap-2 rounded-lg border p-3 text-sm', styles[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: tone ?? '#3b82f6' }}
      />
    </div>
  );
}
