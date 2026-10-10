import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, UtensilsCrossed } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Hostel, MessMenuDay } from '../../lib/types';
import {
  Alert,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
  StatTile,
} from '../../components/ui';
import { formatRelative, titleCase } from '../../lib/format';

const MEALS = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

interface FeedbackSummary {
  overall: { averageRating: string; responses: number };
  byMeal: { meal: string; averageRating: string; responses: number }[];
  recentComments: {
    id: number; meal: string; rating: number; comment: string | null;
    servedOn: string; createdAt: string; studentName: string; hostelCode: string;
  }[];
}

/** Mess menu and feedback (FR10, extension phase). */
export default function MessPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'STUDENT';
  const canEdit = user ? ['MESS_STAFF', 'WARDEN', 'ADMIN'].includes(user.role) : false;
  const canSeeFeedback = user
    ? ['MESS_STAFF', 'WARDEN', 'SUPERVISOR', 'ADMIN'].includes(user.role)
    : false;

  const [hostelId, setHostelId] = useState<number | null>(null);
  const [rating, setRating] = useState(4);
  const [meal, setMeal] = useState('LUNCH');
  const [comment, setComment] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [editing, setEditing] = useState<{ dayOfWeek: number; meal: string; items: string; servingTime: string } | null>(null);

  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api<Hostel[]>('/hostels') });

  useEffect(() => {
    if (hostelId !== null || !hostels.data?.length) return;
    const preferred = hostels.data.find((h) => h.id === user?.hostelId);
    setHostelId(preferred?.id ?? hostels.data[0].id);
  }, [hostels.data, hostelId, user?.hostelId]);

  const menu = useQuery({
    queryKey: ['mess-menu', hostelId],
    queryFn: () => api<MessMenuDay[]>(`/mess/menu/${hostelId}`),
    enabled: hostelId !== null,
  });

  const feedback = useQuery({
    queryKey: ['mess-feedback'],
    queryFn: () => api<FeedbackSummary>('/mess/feedback/summary'),
    enabled: canSeeFeedback,
  });

  const submitFeedback = useMutation({
    mutationFn: () =>
      api('/mess/feedback', {
        method: 'POST',
        body: {
          meal,
          servedOn: new Date().toISOString().slice(0, 10),
          rating,
          comment: comment.trim() || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mess-feedback'] });
      setFeedbackOpen(false);
      setComment('');
      setRating(4);
    },
  });

  const saveMenu = useMutation({
    mutationFn: () =>
      api('/mess/menu', {
        method: 'PUT',
        body: {
          hostelId,
          dayOfWeek: editing!.dayOfWeek,
          meal: editing!.meal,
          items: editing!.items,
          servingTime: editing!.servingTime || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mess-menu'] });
      setEditing(null);
    },
  });

  if (hostels.isLoading) return <LoadingBlock />;
  if (hostels.isError) return <ErrorBlock message="Could not load hostels." onRetry={() => hostels.refetch()} />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mess"
        subtitle="This week's menu and how it is being received."
        actions={
          isStudent && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFeedbackOpen(true);
                submitFeedback.reset();
              }}
            >
              <Star className="h-4 w-4" />
              Rate a meal
            </button>
          )
        }
      />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {hostels.data?.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHostelId(h.id)}
            className={clsx(
              'shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              h.id === hostelId
                ? 'border-brand-500 bg-brand-600/20 text-brand-200'
                : 'border-white/[0.07] bg-surface-1/60 text-slate-400 hover:border-white/20 hover:text-slate-200',
            )}
          >
            {h.code}
          </button>
        ))}
      </div>

      {canSeeFeedback && feedback.data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Overall"
            value={`${Number(feedback.data.overall.averageRating).toFixed(1)} / 5`}
            hint={`${feedback.data.overall.responses} responses`}
            tone={Number(feedback.data.overall.averageRating) >= 3.5 ? 'green' : 'amber'}
            icon={<Star className="h-4 w-4" />}
          />
          {feedback.data.byMeal.map((m) => (
            <StatTile
              key={m.meal}
              label={titleCase(m.meal)}
              value={`${Number(m.averageRating).toFixed(1)} / 5`}
              hint={`${m.responses} responses`}
              tone={Number(m.averageRating) >= 3.5 ? 'green' : 'amber'}
            />
          ))}
        </div>
      )}

      {menu.isLoading && <LoadingBlock label="Loading menu…" />}

      {menu.data && (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {menu.data.map((day) => (
            <Card
              key={day.dayOfWeek}
              className={clsx(day.isToday && 'border-brand-500/40 bg-brand-500/[0.05]')}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{day.dayName}</h3>
                {day.isToday && <span className="badge bg-brand-500/20 text-brand-200">Today</span>}
              </div>
              <ul className="space-y-2">
                {day.meals.map((m) => (
                  <li key={m.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {titleCase(m.meal)}
                      </span>
                      <div className="flex items-center gap-2">
                        {m.servingTime && (
                          <span className="text-[11px] text-slate-600">{m.servingTime}</span>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            className="text-[11px] font-medium text-brand-300 hover:text-brand-200"
                            onClick={() => {
                              setEditing({
                                dayOfWeek: day.dayOfWeek,
                                meal: m.meal,
                                items: m.items,
                                servingTime: m.servingTime ?? '',
                              });
                              saveMenu.reset();
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{m.items}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {canSeeFeedback && feedback.data && (
        <div className="mt-5">
          <Card title="Recent feedback">
            {feedback.data.recentComments.length ? (
              <ul className="space-y-2">
                {feedback.data.recentComments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-300">{c.comment}</p>
                      <span className="badge shrink-0 bg-amber-500/15 text-amber-300">{c.rating} ★</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {c.studentName} · {titleCase(c.meal)} · {c.hostelCode} · {formatRelative(c.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No comments yet" icon={<UtensilsCrossed className="h-6 w-6" />} />
            )}
          </Card>
        </div>
      )}

      {/* ---------- student feedback ---------- */}
      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title="Rate today's meal"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={submitFeedback.isPending}
              onClick={() => submitFeedback.mutate()}
            >
              {submitFeedback.isPending && <Spinner />}
              Submit
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="fb-meal">Meal</label>
            <select
              id="fb-meal"
              className="input"
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>{titleCase(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Rating</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
                    n <= rating
                      ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                      : 'border-white/10 bg-white/[0.03] text-slate-600 hover:border-white/25',
                  )}
                >
                  <Star className={clsx('h-4 w-4', n <= rating && 'fill-current')} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="fb-comment">Comment (optional)</label>
            <textarea
              id="fb-comment"
              className="input min-h-[5rem] resize-y"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked, what did not"
            />
          </div>
          {submitFeedback.isError && (
            <Alert tone="error">
              {submitFeedback.error instanceof ApiError
                ? submitFeedback.error.message
                : 'Could not submit feedback.'}
            </Alert>
          )}
        </div>
      </Modal>

      {/* ---------- menu editor ---------- */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit menu slot"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saveMenu.isPending || !editing?.items.trim()}
              onClick={() => saveMenu.mutate()}
            >
              {saveMenu.isPending && <Spinner />}
              Save
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][editing.dayOfWeek]}{' '}
              · {titleCase(editing.meal)}
            </p>
            <div>
              <label className="label" htmlFor="menu-items">Items</label>
              <textarea
                id="menu-items"
                className="input min-h-[5rem] resize-y"
                value={editing.items}
                onChange={(e) => setEditing({ ...editing, items: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="menu-time">Serving time</label>
              <input
                id="menu-time"
                className="input"
                value={editing.servingTime}
                onChange={(e) => setEditing({ ...editing, servingTime: e.target.value })}
                placeholder="e.g. 12:30 - 14:30"
              />
            </div>
            {saveMenu.isError && (
              <Alert tone="error">
                {saveMenu.error instanceof ApiError ? saveMenu.error.message : 'Could not save.'}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
