import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Announcement } from '../../lib/types';
import {
  Alert,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { formatRelative, titleCase } from '../../lib/format';

const CATEGORIES = ['GENERAL', 'MAINTENANCE', 'MESS', 'EMERGENCY', 'EVENT'];

const CATEGORY_STYLES: Record<string, string> = {
  GENERAL: 'bg-slate-500/15 text-slate-300',
  MAINTENANCE: 'bg-amber-500/15 text-amber-300',
  MESS: 'bg-emerald-500/15 text-emerald-300',
  EMERGENCY: 'bg-rose-500/15 text-rose-300',
  EVENT: 'bg-violet-500/15 text-violet-300',
};

/** FR9 — the single broadcast channel replacing notice boards and group chats. */
export default function AnnouncementsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canPost = user ? ['WARDEN', 'SUPERVISOR', 'ADMIN', 'MESS_STAFF'].includes(user.role) : false;
  const isStudent = user?.role === 'STUDENT';

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [isPinned, setIsPinned] = useState(false);

  const query = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api<Announcement[]>('/announcements'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/announcements', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), category, isPinned },
      }),
    onSuccess: () => {
      invalidate();
      setComposing(false);
      setTitle('');
      setBody('');
      setCategory('GENERAL');
      setIsPinned(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api(`/announcements/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const items = query.data ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Announcements"
        subtitle="Hostel notices, in one place."
        actions={
          canPost && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setComposing(true);
                create.reset();
              }}
            >
              <Plus className="h-4 w-4" />
              Post a notice
            </button>
          )
        }
      />

      {query.isLoading && <LoadingBlock />}
      {query.isError && <ErrorBlock message="Could not load announcements." onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="space-y-3">
          {items.length ? (
            items.map((a) => (
              <Card
                key={a.id}
                className={clsx(
                  'transition-colors',
                  isStudent && !a.isRead && 'border-brand-500/30 bg-brand-500/[0.05]',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.isPinned && (
                        <span className="badge bg-brand-500/15 text-brand-300">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      )}
                      <span className={clsx('badge', CATEGORY_STYLES[a.category] ?? CATEGORY_STYLES.GENERAL)}>
                        {titleCase(a.category)}
                      </span>
                      <span className="badge bg-white/[0.06] text-slate-400">
                        {a.hostelCode ?? 'All blocks'}
                      </span>
                      {isStudent && !a.isRead && (
                        <span className="badge bg-emerald-500/15 text-emerald-300">New</span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-white">{a.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-400">
                      {a.body}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {a.authorName} · {a.authorDesignation} · {formatRelative(a.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {isStudent && !a.isRead && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => markRead.mutate(a.id)}
                      >
                        Mark read
                      </button>
                    )}
                    {canPost && (a.postedBy === user?.id || user?.role === 'ADMIN' || user?.role === 'SUPERVISOR') && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm text-rose-400 hover:bg-rose-500/10"
                        onClick={() => remove.mutate(a.id)}
                        aria-label={`Withdraw ${a.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card>
              <EmptyState title="No announcements yet" icon={<Megaphone className="h-6 w-6" />} />
            </Card>
          )}
        </div>
      )}

      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title="Post an announcement"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setComposing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending || title.trim().length < 4 || body.trim().length < 4}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Spinner />}
              Publish
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="an-title">Title</label>
            <input
              id="an-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Water supply maintenance on Sunday"
            />
          </div>
          <div>
            <label className="label" htmlFor="an-body">Message</label>
            <textarea
              id="an-body"
              className="input min-h-[8rem] resize-y"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What residents need to know"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="an-cat">Category</label>
              <select
                id="an-cat"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{titleCase(c)}</option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-surface-0 text-brand-600 focus:ring-brand-500"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              Pin to the top
            </label>
          </div>

          <Alert tone="info">
            {user?.role === 'WARDEN'
              ? 'This notice goes to residents of your assigned block.'
              : 'This notice goes to every hostel block.'}
          </Alert>

          {create.isError && (
            <Alert tone="error">
              {create.error instanceof ApiError ? create.error.message : 'Could not publish.'}
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}
