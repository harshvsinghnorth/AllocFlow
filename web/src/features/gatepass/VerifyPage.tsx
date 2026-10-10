import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LogIn, LogOut, ScanLine, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import type { GatepassVerification } from '../../lib/types';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const VERDICT_COPY: Record<GatepassVerification['verdict'], { label: string; detail: string }> = {
  VALID: { label: 'Valid', detail: 'Approved and inside its time window.' },
  NOT_APPROVED: { label: 'Not approved', detail: 'The warden has not approved this pass.' },
  NOT_YET_VALID: { label: 'Not yet valid', detail: 'The approved window has not started.' },
  EXPIRED: { label: 'Expired', detail: 'The approved window has passed.' },
  ALREADY_RETURNED: { label: 'Already returned', detail: 'This pass has been closed.' },
};

/**
 * The gate screen. Built for a phone held one-handed at a barrier: one field,
 * a verdict the officer can read at a glance, and the two movement actions.
 */
export default function VerifyPage() {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<GatepassVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (ref: string) =>
      api<GatepassVerification>(`/gatepasses/verify/${encodeURIComponent(ref)}`),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      setNotice(null);
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Could not verify that reference.');
    },
  });

  const movement = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'check-out' | 'check-in' }) =>
      api(`/gatepasses/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_data, vars) => {
      setNotice(vars.action === 'check-out' ? 'Departure recorded.' : 'Return recorded.');
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Re-read so the card reflects the new status immediately.
      verify.mutate(reference.trim());
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not record the movement.');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = reference.trim();
    if (ref) verify.mutate(ref);
  };

  const verdict = result ? VERDICT_COPY[result.verdict] : null;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <PageHeader title="Gate Verification" subtitle="Enter the reference shown by the student." />

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1 font-mono uppercase tracking-widest"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="GP-2026-00001"
            aria-label="Gatepass reference"
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={verify.isPending || !reference.trim()}>
            {verify.isPending ? <Spinner /> : <ScanLine className="h-4 w-4" />}
            Verify
          </button>
        </form>
      </Card>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      {result && verdict && (
        <div className="mt-4 space-y-4">
          <div
            className={clsx(
              'card flex items-center gap-4 p-5',
              result.isValid
                ? 'border-emerald-500/30 bg-emerald-950/25'
                : 'border-rose-500/30 bg-rose-950/25',
            )}
          >
            {result.isValid ? (
              <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="h-10 w-10 shrink-0 text-rose-400" />
            )}
            <div className="min-w-0">
              <p
                className={clsx(
                  'text-xl font-bold',
                  result.isValid ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {verdict.label}
              </p>
              <p className="text-sm text-slate-400">{verdict.detail}</p>
            </div>
          </div>

          <Card title="Student">
            <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                ['Name', result.studentName],
                ['Roll number', result.rollNumber],
                ['Room', `${result.roomNumber ?? '—'} ${result.hostelCode ?? ''}`],
                ['Contact', result.contact ?? '—'],
                ['Guardian', result.guardianContact ?? '—'],
                ['Reason', result.reason],
                ['Destination', result.destination ?? '—'],
                ['Leaves', formatDateTime(result.fromTime)],
                ['Returns by', formatDateTime(result.toTime)],
                ['Checked out', formatDateTime(result.checkedOutAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-white/[0.05] pb-2">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className="truncate text-right font-medium text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={movement.isPending || result.status !== 'APPROVED'}
              onClick={() => movement.mutate({ id: result.id, action: 'check-out' })}
            >
              {movement.isPending ? <Spinner /> : <LogOut className="h-4 w-4" />}
              Record departure
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              disabled={movement.isPending || result.status !== 'CHECKED_OUT'}
              onClick={() => movement.mutate({ id: result.id, action: 'check-in' })}
            >
              {movement.isPending ? <Spinner /> : <LogIn className="h-4 w-4" />}
              Record return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
