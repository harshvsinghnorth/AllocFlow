import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Sparkles, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { RequestStatus, RequestType, ServiceRequest } from '../../lib/types';
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
import { formatRelative, titleCase } from '../../lib/format';

const HOUSEKEEPING_CATEGORIES = ['Room cleaning', 'Bathroom cleaning', 'Garbage pickup', 'Linen change'];
const REPAIR_CATEGORIES = ['Electrical', 'Plumbing', 'Furniture', 'Internet', 'Carpentry'];
const STATUS_FILTERS: (RequestStatus | 'ALL')[] = ['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];

/**
 * Housekeeping and repair tickets. Students get the one-tap "Notify" action
 * (FR5) — hostel and room are filled in by the server from their allocation,
 * so there is nothing to type. Staff get the queue and the status workflow.
 */
export default function RequestsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'STUDENT';

  const [status, setStatus] = useState<RequestStatus | 'ALL'>('ALL');
  const [composer, setComposer] = useState<RequestType | null>(null);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [resolving, setResolving] = useState<ServiceRequest | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const query = useQuery({
    queryKey: ['requests', status],
    queryFn: () =>
      api<{ items: ServiceRequest[]; total: number }>(
        `/requests${status === 'ALL' ? '' : `?status=${status}`}`,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/requests', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setComposer(null);
      setCategory('');
      setNote('');
      setPriority('NORMAL');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api(`/requests/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setResolving(null);
      setResolutionNote('');
    },
  });

  const openComposer = (type: RequestType) => {
    setComposer(type);
    setCategory(type === 'HOUSEKEEPING' ? HOUSEKEEPING_CATEGORIES[0] : REPAIR_CATEGORIES[0]);
    setNote('');
    setPriority('NORMAL');
    create.reset();
  };

  const items = query.data?.items ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Housekeeping & Repairs"
        subtitle={
          isStudent
            ? 'Raise a request in one tap — your hostel and room are filled in automatically.'
            : 'Requests raised by residents of your block.'
        }
        actions={
          isStudent && (
            <>
              <button type="button" className="btn-primary" onClick={() => openComposer('HOUSEKEEPING')}>
                <Sparkles className="h-4 w-4" />
                Notify housekeeping
              </button>
              <button type="button" className="btn-secondary" onClick={() => openComposer('REPAIR')}>
                <Wrench className="h-4 w-4" />
                Report a repair
              </button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              status === s
                ? 'bg-brand-600 text-white'
                : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.1] hover:text-slate-200',
            )}
          >
            {s === 'ALL' ? 'All' : titleCase(s)}
          </button>
        ))}
      </div>

      {query.isLoading && <LoadingBlock />}
      {query.isError && <ErrorBlock message="Could not load requests." onRetry={() => query.refetch()} />}

      {query.data && (
        <Card className="p-0">
          {items.length ? (
            <ul className="divide-y divide-white/[0.05]">
              {items.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-white/[0.06] text-slate-300">
                          {r.type === 'HOUSEKEEPING' ? (
                            <Sparkles className="h-3 w-3" />
                          ) : (
                            <Wrench className="h-3 w-3" />
                          )}
                          {titleCase(r.type)}
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          {r.category ?? '—'}
                        </span>
                        <StatusBadge status={r.status} />
                        {(r.priority === 'HIGH' || r.priority === 'URGENT') && (
                          <StatusBadge status={r.priority} />
                        )}
                      </div>
                      {r.note && <p className="mt-1.5 text-sm text-slate-400">{r.note}</p>}
                      <p className="mt-1.5 text-xs text-slate-500">
                        {!isStudent && `${r.studentName} (${r.rollNumber}) · `}
                        Room {r.roomNumber ?? '—'}
                        {r.hostelCode ? `, ${r.hostelCode}` : ''} · raised {formatRelative(r.createdAt)}
                      </p>
                      {r.resolutionNote && (
                        <p className="mt-1.5 rounded-md bg-emerald-950/25 px-2.5 py-1.5 text-xs text-emerald-300">
                          {r.resolutionNote}
                        </p>
                      )}
                    </div>

                    {!isStudent && r.status !== 'RESOLVED' && r.status !== 'REJECTED' && (
                      <div className="flex shrink-0 gap-2">
                        {r.status === 'PENDING' && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: r.id, body: { status: 'IN_PROGRESS' } })}
                          >
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-success btn-sm"
                          onClick={() => {
                            setResolving(r);
                            setResolutionNote('');
                            update.reset();
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No requests here"
              description={
                isStudent
                  ? 'Raise one with the buttons above when you need housekeeping or a repair.'
                  : 'Nothing matches this filter.'
              }
              icon={<ClipboardList className="h-6 w-6" />}
            />
          )}
        </Card>
      )}

      {/* ---------- composer ---------- */}
      <Modal
        open={composer !== null}
        onClose={() => setComposer(null)}
        title={composer === 'HOUSEKEEPING' ? 'Notify housekeeping' : 'Report a repair'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setComposer(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  type: composer,
                  category,
                  note: note.trim() || undefined,
                  priority,
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
          <Alert tone="info">
            Your hostel block and room number are attached automatically and the request is
            timestamped for hostel staff.
          </Alert>

          <div>
            <label className="label" htmlFor="req-category">Category</label>
            <select
              id="req-category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {(composer === 'HOUSEKEEPING' ? HOUSEKEEPING_CATEGORIES : REPAIR_CATEGORIES).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {composer === 'REPAIR' && (
            <div>
              <label className="label" htmlFor="req-priority">Priority</label>
              <select
                id="req-priority"
                className="input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="req-note">Note (optional)</label>
            <textarea
              id="req-note"
              className="input min-h-[5rem] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the staff should know before they arrive"
            />
          </div>

          {create.isError && (
            <Alert tone="error">
              {create.error instanceof ApiError ? create.error.message : 'Could not submit.'}
            </Alert>
          )}
        </div>
      </Modal>

      {/* ---------- resolve ---------- */}
      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title="Resolve request"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={update.isPending}
              onClick={() =>
                resolving &&
                update.mutate({
                  id: resolving.id,
                  body: { status: 'REJECTED', resolutionNote: resolutionNote.trim() || undefined },
                })
              }
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-success"
              disabled={update.isPending}
              onClick={() =>
                resolving &&
                update.mutate({
                  id: resolving.id,
                  body: { status: 'RESOLVED', resolutionNote: resolutionNote.trim() || undefined },
                })
              }
            >
              {update.isPending && <Spinner />}
              Mark resolved
            </button>
          </>
        }
      >
        {resolving && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-sm font-medium text-slate-200">
                {resolving.category ?? titleCase(resolving.type)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {resolving.studentName} · room {resolving.roomNumber ?? '—'}
              </p>
              {resolving.note && <p className="mt-2 text-sm text-slate-400">{resolving.note}</p>}
            </div>
            <div>
              <label className="label" htmlFor="resolution">Resolution note</label>
              <textarea
                id="resolution"
                className="input min-h-[5rem] resize-y"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="What was done — shown to the student"
              />
            </div>
            {update.isError && (
              <Alert tone="error">
                {update.error instanceof ApiError ? update.error.message : 'Could not update.'}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
