import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Hostel, Raid } from '../../lib/types';
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
import { formatDateTime, toLocalInputValue } from '../../lib/format';

/** FR12 — warden raid scheduling and findings log (extension phase). */
export default function RaidsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [composing, setComposing] = useState(false);
  const [hostelId, setHostelId] = useState<number | ''>(user?.hostelId ?? '');
  const [floor, setFloor] = useState('');
  const [purpose, setPurpose] = useState('');
  const [scheduledFor, setScheduledFor] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 86_400_000)),
  );
  const [logging, setLogging] = useState<Raid | null>(null);
  const [findings, setFindings] = useState('');

  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api<Hostel[]>('/hostels') });
  const raids = useQuery({ queryKey: ['raids'], queryFn: () => api<Raid[]>('/raids') });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['raids'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/raids', {
        method: 'POST',
        body: {
          hostelId: Number(hostelId),
          floor: floor ? Number(floor) : undefined,
          scheduledFor: new Date(scheduledFor).toISOString(),
          purpose: purpose.trim(),
        },
      }),
    onSuccess: () => {
      invalidate();
      setComposing(false);
      setPurpose('');
      setFloor('');
    },
  });

  const complete = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'COMPLETED' | 'CANCELLED' }) =>
      api(`/raids/${id}`, {
        method: 'PATCH',
        body: { status, findings: findings.trim() || undefined },
      }),
    onSuccess: () => {
      invalidate();
      setLogging(null);
      setFindings('');
    },
  });

  const selectedHostel = hostels.data?.find((h) => h.id === Number(hostelId));
  const items = raids.data ?? [];
  const scheduled = items.filter((r) => r.status === 'SCHEDULED');
  const past = items.filter((r) => r.status !== 'SCHEDULED');

  if (raids.isLoading) return <LoadingBlock />;
  if (raids.isError) return <ErrorBlock message="Could not load inspections." onRetry={() => raids.refetch()} />;

  const renderRaid = (r: Raid) => (
    <Card key={r.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <span className="badge bg-white/[0.06] text-slate-400">
              {r.hostelCode} · {r.floor ? `Floor ${r.floor}` : 'Whole block'}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-100">{r.purpose}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDateTime(r.scheduledFor)} · {r.conductorName}
          </p>
          {r.findings && (
            <p className="mt-2 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-400">
              {r.findings}
            </p>
          )}
        </div>
        {r.status === 'SCHEDULED' && (
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={() => {
              setLogging(r);
              setFindings('');
              complete.reset();
            }}
          >
            Log outcome
          </button>
        )}
      </div>
    </Card>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Room Inspections"
        subtitle="Schedule raids and record what they found."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setComposing(true);
              create.reset();
            }}
          >
            <Plus className="h-4 w-4" />
            Schedule inspection
          </button>
        }
      />

      <h2 className="mb-3 text-sm font-semibold text-slate-300">
        Scheduled ({scheduled.length})
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {scheduled.length ? (
          scheduled.map(renderRaid)
        ) : (
          <div className="lg:col-span-2">
            <Card>
              <EmptyState title="Nothing scheduled" icon={<Sparkles className="h-6 w-6" />} />
            </Card>
          </div>
        )}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-300">
            Completed &amp; cancelled ({past.length})
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">{past.map(renderRaid)}</div>
        </>
      )}

      {/* ---------- schedule ---------- */}
      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title="Schedule an inspection"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setComposing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending || !hostelId || purpose.trim().length < 4}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Spinner />}
              Schedule
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="raid-hostel">Hostel block</label>
            <select
              id="raid-hostel"
              className="input"
              value={hostelId}
              onChange={(e) => setHostelId(e.target.value ? Number(e.target.value) : '')}
              // A warden may only schedule within the block they are assigned.
              disabled={user?.role === 'WARDEN'}
            >
              <option value="">Select a block…</option>
              {hostels.data?.map((h) => (
                <option key={h.id} value={h.id}>{h.code} — {h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="raid-floor">
              Floor {selectedHostel && `(1–${selectedHostel.floors}, blank for the whole block)`}
            </label>
            <input
              id="raid-floor"
              type="number"
              min={1}
              max={selectedHostel?.floors ?? 40}
              className="input"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="Leave blank for all floors"
            />
          </div>
          <div>
            <label className="label" htmlFor="raid-when">Scheduled for</label>
            <input
              id="raid-when"
              type="datetime-local"
              className="input"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="raid-purpose">Purpose</label>
            <input
              id="raid-purpose"
              className="input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Routine discipline and cleanliness inspection"
            />
          </div>
          {create.isError && (
            <Alert tone="error">
              {create.error instanceof ApiError ? create.error.message : 'Could not schedule.'}
            </Alert>
          )}
        </div>
      </Modal>

      {/* ---------- outcome ---------- */}
      <Modal
        open={logging !== null}
        onClose={() => setLogging(null)}
        title="Log inspection outcome"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={complete.isPending}
              onClick={() => logging && complete.mutate({ id: logging.id, status: 'CANCELLED' })}
            >
              Cancel inspection
            </button>
            <button
              type="button"
              className="btn-success"
              disabled={complete.isPending}
              onClick={() => logging && complete.mutate({ id: logging.id, status: 'COMPLETED' })}
            >
              {complete.isPending && <Spinner />}
              Mark completed
            </button>
          </>
        }
      >
        {logging && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              {logging.purpose} — {logging.hostelCode},{' '}
              {logging.floor ? `floor ${logging.floor}` : 'whole block'}
            </p>
            <div>
              <label className="label" htmlFor="raid-findings">Findings</label>
              <textarea
                id="raid-findings"
                className="input min-h-[6rem] resize-y"
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                placeholder="What the inspection found and any action taken"
              />
            </div>
            {complete.isError && (
              <Alert tone="error">
                {complete.error instanceof ApiError ? complete.error.message : 'Could not update.'}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
