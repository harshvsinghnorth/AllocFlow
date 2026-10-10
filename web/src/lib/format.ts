import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

const toDate = (value: string | Date): Date | null => {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
};

/** "12 Sep 2026" — never throws on a malformed value from the API. */
export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy') : '—';
};

/** "12 Sep 2026, 6:30 pm" */
export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy, h:mm aaa") : '—';
};

export const formatTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const d = toDate(value);
  return d ? format(d, 'h:mm aaa') : '—';
};

/** "3 hours ago" */
export const formatRelative = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const d = toDate(value);
  return d ? `${formatDistanceToNow(d)} ago` : '—';
};

/** Indian rupee formatting, from the NUMERIC strings the API returns. */
export const formatCurrency = (value: string | number | null | undefined): string => {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(n);
};

export const formatNumber = (value: string | number | null | undefined): string => {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-IN').format(n) : '0';
};

/** Value for a datetime-local input, which expects local time without a zone. */
export const toLocalInputValue = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const titleCase = (value: string): string =>
  value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
