import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ShieldCheck, X } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Gatepass, GatepassStatus } from '../../lib/types';
import {
  Alert,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { formatDateTime, formatRelative, toLocalInputValue } from '../../lib/format';

const FILTERS: (GatepassStatus | 'ALL')[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CHECKED_OUT', 'CHECKED_IN'];

/**
 * The student and warden halves of the gatepass pipeline (SRS 3.2.3).
 * Security verification lives on its own screen, since it is used at the gate
 * on a phone and needs nothing but a reference field.
 */
export default function GatepassPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'STUDENT';

  const [filter, setFilter] = useState<GatepassStatus | 'ALL'>('ALL');
  const [composing, setComposing] = useState(false);
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [fromTime, setFromTime] = useState(() => toLocalInputValue(new Date(Date.now() + 3_600_000)));
  const [toTime, setToTime] = useState(() => toLocalInputValue(new Date(Date.now() + 9 * 3_600_000)));
  const [deciding, setDeciding] = useState<Gatepass | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  const query = useQuery({
    queryKey: ['gatepasses', filter],
    queryFn: () =>
      api<{ items: Gatepass[]; total: number }>(
        `/gatepasses${filter === 'ALL' ? '' : `?status=${filter}`}`,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gatepasses'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/gatepasses', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setComposing(false);
      setReason('');
      setDestination('');
    },
  });

  const decide = useMutation({
    mutationFn: ({ id, approve, note }: { id: number; approve: boolean; note?: string }) =>
      api(`/gatepasses/${id}/decision`, { method: 'POST', body: { approve, note } }),
    onSuccess: () => {
      invalidate();
      setDeciding(null);
      setDecisionNote('');
    },
  });

  const items = query.data?.items ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Gatepass"
        subtitle={
          isStudent
            ? 'Request permission to leave the hostel; your warden approves it digitally.'
            : 'Review and decide gatepass requests from your block.'
        }
        actions={
          isStudent && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setComposing(true);
                create.reset();
              }}
            >
              <CalendarClock className="h-4 w-4" />
              Request a gatepass
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.1] hover:text-slate-200',
            )}
          >
            {f === 'ALL' ? 'All' : f.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>

      {query.isLoading && <LoadingBlock />}
      {query.isError && <ErrorBlock message="Could not load gatepasses." onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.length ? (
            items.map((g) => (
              <Card key={g.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">{g.reference}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-100">
                      {g.reason}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>

                {!isStudent && (
                  <p className="text-xs text-slate-400">
                    {g.studentName} · {g.rollNumber} · room {g.roomNumber ?? '—'}
                  </p>
                )}

                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Out</dt>
                    <dd className="text-right text-slate-300">{formatDateTime(g.fromTime)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Back</dt>
                    <dd className="text-right text-slate-300">{formatDateTime(g.toTime)}</dd>
                  </div>
                  {g.destination && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Destination</dt>
                      <dd className="truncate text-right text-slate-300">{g.destination}</dd>
                    </div>
                  )}
                </dl>

                {g.decisionNote && (
                  <p className="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-400">
                    {g.decisionNote}
                  </p>
                )}

                {/* An approved pass is what the student shows at the gate. */}
                {isStudent && g.status === 'APPROVED' && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-400">
                      Show this at the gate
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold tracking-widest text-emerald-200">
                      {g.reference}
                    </p>
                  </div>
                )}

                {!isStudent && g.status === 'PENDING' && (
                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      className="btn-success btn-sm flex-1"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: g.id, approve: true })}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-sm flex-1"
                      onClick={() => {
                        setDeciding(g);
                        setDecisionNote('');
                        decide.reset();
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}

                <p className="mt-auto text-[11px] text-slate-600">
                  Requested {formatRelative(g.createdAt)}
                </p>
              </Card>
            ))
          ) : (
            <div className="sm:col-span-2 xl:col-span-3">
              <Card>
                <EmptyState
                  title="No gatepasses"
                  description={
                    isStudent
                      ? 'Request one when you need to leave the hostel.'
                      : 'Nothing matches this filter.'
                  }
                  icon={<ShieldCheck className="h-6 w-6" />}
                />
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ---------- request composer ---------- */}
      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title="Request a gatepass"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setComposing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending || reason.trim().length < 4}
              onClick={() =>
                create.mutate({
                  reason: reason.trim(),
                  destination: destination.trim() || undefined,
                  // datetime-local yields local wall time; the Date round-trip
                  // converts it to the UTC instant the API expects.
                  fromTime: new Date(fromTime).toISOString(),
                  toTime: new Date(toTime).toISOString(),
                })
              }
            >
              {create.isPending && <Spinner />}
              Submit request
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="gp-reason">Reason</label>
            <input
              id="gp-reason"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Medical appointment at city hospital"
            />
          </div>
          <div>
            <label className="label" htmlFor="gp-dest">Destination (optional)</label>
            <input
              id="gp-dest"
              className="input"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. City hospital"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="gp-from">Leaving at</label>
              <input
                id="gp-from"
                type="datetime-local"
                className="input"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="gp-to">Returning by</label>
              <input
                id="gp-to"
                type="datetime-local"
                className="input"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
              />
            </div>
          </div>
          {create.isError && (
            <Alert tone="error">
              {create.error instanceof ApiError ? create.error.message : 'Could not submit.'}
            </Alert>
          )}
        </div>
      </Modal>

      {/* ---------- rejection ---------- */}
      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title="Reject gatepass"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeciding(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={decide.isPending}
              onClick={() =>
                deciding &&
                decide.mutate({
                  id: deciding.id,
                  approve: false,
                  note: decisionNote.trim() || undefined,
                })
              }
            >
              {decide.isPending && <Spinner />}
              Reject request
            </button>
          </>
        }
      >
        {deciding && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Rejecting {deciding.studentName}&apos;s request ({deciding.reference}).
            </p>
            <div>
              <label className="label" htmlFor="gp-note">Reason (shown to the student)</label>
              <textarea
                id="gp-note"
                className="input min-h-[5rem] resize-y"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="e.g. Clashes with internal examinations"
              />
            </div>
            {decide.isError && (
              <Alert tone="error">
                {decide.error instanceof ApiError ? decide.error.message : 'Could not update.'}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
