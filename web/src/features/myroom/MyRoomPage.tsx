import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bed, Boxes, DoorOpen, LogOut, User } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Booking, RoomDetail } from '../../lib/types';
import {
  Alert,
  AvailabilityBadge,
  Card,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { formatDate } from '../../lib/format';

interface HistoryRow {
  id: number;
  bedIndex: number;
  bookingDate: string;
  vacatedAt: string | null;
  status: string;
  roomNumber: string;
  floor: number;
  hostelCode: string;
}

/** The student's own allocation: roommates, and the option to vacate. */
export default function MyRoomPage() {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const booking = useQuery({
    queryKey: ['my-booking'],
    queryFn: () => api<Booking | null>('/bookings/me'),
  });

  const room = useQuery({
    queryKey: ['room', booking.data?.roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${booking.data!.roomId}`),
    enabled: Boolean(booking.data?.roomId),
  });

  const history = useQuery({
    queryKey: ['my-booking-history'],
    queryFn: () => api<HistoryRow[]>('/bookings/me/history'),
  });

  const vacate = useMutation({
    mutationFn: (id: number) => api(`/bookings/${id}/vacate`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-booking'] });
      await queryClient.invalidateQueries({ queryKey: ['my-booking-history'] });
      await queryClient.invalidateQueries({ queryKey: ['structure'] });
      await queryClient.invalidateQueries({ queryKey: ['floor-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['hostels'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await refresh();
      setConfirming(false);
    },
  });

  if (booking.isLoading) return <LoadingBlock />;

  if (!booking.data) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="My Room" />
        <Card>
          <EmptyState
            title="You have no room allocated"
            description="Open the hostel explorer to find a room with free beds and book one."
            icon={<Bed className="h-7 w-7" />}
            action={
              <Link to="/explorer" className="btn-primary">
                <Boxes className="h-4 w-4" />
                Open the explorer
              </Link>
            }
          />
        </Card>

        {history.data && history.data.length > 0 && (
          <div className="mt-5">
            <PastAllocations rows={history.data} />
          </div>
        )}
      </div>
    );
  }

  const b = booking.data;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Room"
        subtitle={`${b.hostelName} · floor ${b.floor}`}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setConfirming(true);
              vacate.reset();
            }}
          >
            <LogOut className="h-4 w-4" />
            Vacate room
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Card>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Room</p>
            <p className="mt-1 text-5xl font-extrabold tracking-tight text-white">{b.roomNumber}</p>
            <p className="mt-1 text-sm text-slate-400">
              {b.hostelCode} · Floor {b.floor}
            </p>
            <div className="mt-3 flex justify-center">
              <span className="badge bg-brand-500/15 text-brand-200">Bed {b.bedIndex}</span>
            </div>
          </div>
          <dl className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Occupancy</dt>
              <dd className="font-semibold text-slate-200">
                {b.capacity === 2 ? 'Double' : 'Triple'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Beds filled</dt>
              <dd className="font-semibold tabular-nums text-slate-200">
                {b.occupiedBeds} / {b.capacity}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Allocated on</dt>
              <dd className="font-semibold text-slate-200">{formatDate(b.bookingDate)}</dd>
            </div>
          </dl>
        </Card>

        <div className="space-y-5">
          <Card title="Beds in this room">
            {room.isLoading && <LoadingBlock label="Loading roommates…" />}
            {room.data && (
              <>
                <div className="mb-3">
                  <AvailabilityBadge status={room.data.status} freeBeds={room.data.freeBeds} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {room.data.beds.map((bed) => (
                    <div
                      key={bed.bedIndex}
                      className={clsx(
                        'rounded-lg border p-3',
                        bed.occupant?.isYou
                          ? 'border-brand-500/40 bg-brand-500/[0.08]'
                          : bed.isOccupied
                            ? 'border-white/[0.07] bg-white/[0.03]'
                            : 'border-emerald-500/30 bg-emerald-950/20',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-200">
                          Bed {bed.bedIndex}
                        </span>
                        {bed.occupant?.isYou && (
                          <span className="badge bg-brand-500/20 text-brand-200">You</span>
                        )}
                      </div>
                      {bed.occupant ? (
                        <div className="mt-2 flex items-start gap-2">
                          <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <div className="min-w-0 text-xs">
                            <p className="truncate font-medium text-slate-300">{bed.occupant.name}</p>
                            <p className="truncate text-slate-500">
                              {bed.occupant.rollNumber} · {bed.occupant.course}, year{' '}
                              {bed.occupant.year}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                          <DoorOpen className="h-3.5 w-3.5" />
                          Vacant
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {history.data && history.data.length > 0 && <PastAllocations rows={history.data} />}
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Vacate this room?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              Keep my room
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={vacate.isPending}
              onClick={() => vacate.mutate(b.id)}
            >
              {vacate.isPending && <Spinner />}
              Vacate room {b.roomNumber}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Bed {b.bedIndex} in room {b.roomNumber} returns to the availability pool immediately and
            may be taken by another student. You will need to book again to get a room.
          </p>
          {vacate.isError && (
            <Alert tone="error">
              {vacate.error instanceof ApiError ? vacate.error.message : 'Could not vacate the room.'}
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}

function PastAllocations({ rows }: { rows: HistoryRow[] }) {
  return (
    <Card title="Allocation history" className="p-0">
      <div className="table-wrap">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th">Room</th>
              <th className="th">Bed</th>
              <th className="th">From</th>
              <th className="th">Until</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                <td className="td font-medium text-slate-200">
                  {r.roomNumber} <span className="text-slate-500">{r.hostelCode}</span>
                </td>
                <td className="td tabular-nums">{r.bedIndex}</td>
                <td className="td">{formatDate(r.bookingDate)}</td>
                <td className="td">{r.vacatedAt ? formatDate(r.vacatedAt) : '—'}</td>
                <td className="td"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
