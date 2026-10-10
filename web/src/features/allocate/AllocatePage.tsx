import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Users } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type {
  Hostel,
  HostelStructure,
  RoomSummary,
  UnallocatedStudent,
} from '../../lib/types';
import {
  Alert,
  AVAILABILITY_HEX,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
  StatTile,
} from '../../components/ui';

/**
 * The warden's allocation desk: pick a student who has no room, pick a room
 * with a free bed, allocate. The server assigns the lowest free bed index and
 * refuses anything that would overbook, so this screen only has to present
 * the choices.
 */
export default function AllocatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [hostelId, setHostelId] = useState<number | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [student, setStudent] = useState<UnallocatedStudent | null>(null);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api<Hostel[]>('/hostels') });

  useEffect(() => {
    if (hostelId !== null || !hostels.data?.length) return;
    const preferred = hostels.data.find((h) => h.id === user?.hostelId);
    setHostelId(preferred?.id ?? hostels.data[0].id);
  }, [hostels.data, hostelId, user?.hostelId]);

  const students = useQuery({
    queryKey: ['unallocated', hostelId],
    queryFn: () => api<UnallocatedStudent[]>(`/bookings/unallocated?hostelId=${hostelId}`),
    enabled: hostelId !== null,
  });

  const structure = useQuery({
    queryKey: ['structure', hostelId],
    queryFn: () => api<HostelStructure>(`/hostels/${hostelId}/structure`),
    enabled: hostelId !== null,
  });

  const rooms = useQuery({
    queryKey: ['floor-rooms', hostelId, floor],
    queryFn: () => api<RoomSummary[]>(`/hostels/${hostelId}/floors/${floor}/rooms`),
    enabled: hostelId !== null && floor !== null,
  });

  const allocate = useMutation({
    mutationFn: () =>
      api<{ bedIndex: number }>('/bookings', {
        method: 'POST',
        body: { roomId: room!.id, studentId: student!.studentId },
      }),
    onSuccess: async (data) => {
      setNotice(
        `${student?.name} allocated to room ${room?.roomNumber}, bed ${data.bedIndex}.`,
      );
      setStudent(null);
      setRoom(null);
      await queryClient.invalidateQueries({ queryKey: ['unallocated'] });
      await queryClient.invalidateQueries({ queryKey: ['structure'] });
      await queryClient.invalidateQueries({ queryKey: ['floor-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['hostels'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const floors = structure.data?.floors ?? [];
  const selectedHostel = hostels.data?.find((h) => h.id === hostelId);
  /*
   * The desk normally only lists students already assigned to this block, so a
   * mismatch is rare — but a warden can reach one via an unassigned student, and
   * the confirm step is the last point before the server would reject it anyway.
   */
  const genderMatches =
    !student || !selectedHostel
      ? true
      : selectedHostel.gender === 'CO_ED' || selectedHostel.gender === student.gender;

  if (hostels.isLoading) return <LoadingBlock />;
  if (hostels.isError) return <ErrorBlock message="Could not load hostels." onRetry={() => hostels.refetch()} />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Allocation Desk"
        subtitle="Assign rooms to students who are waiting for one."
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {hostels.data?.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => {
              setHostelId(h.id);
              setFloor(null);
              setRoom(null);
            }}
            className={clsx(
              'shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              h.id === hostelId
                ? 'border-brand-500 bg-brand-600/20 text-brand-200'
                : 'border-white/[0.07] bg-surface-1/60 text-slate-400 hover:border-white/20 hover:text-slate-200',
            )}
          >
            {h.code}
            <span
              className={clsx(
                'ml-1.5 rounded px-1 py-0.5 text-[10px] font-medium',
                h.gender === 'FEMALE'
                  ? 'bg-pink-500/15 text-pink-300'
                  : h.gender === 'MALE'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-violet-500/15 text-violet-300',
              )}
            >
              {h.gender === 'FEMALE' ? 'W' : h.gender === 'MALE' ? 'M' : 'C'}
            </span>
          </button>
        ))}
      </div>

      {structure.data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Awaiting allocation"
            value={students.data?.length ?? 0}
            hint="Students in this block with no room"
            tone={(students.data?.length ?? 0) > 0 ? 'amber' : 'green'}
            icon={<Users className="h-4 w-4" />}
          />
          <StatTile label="Rooms available" value={structure.data.totals.availableRooms} tone="brand" />
          <StatTile label="Beds free" value={structure.data.totals.freeBeds} tone="green" />
          <StatTile
            label="Occupancy"
            value={`${structure.data.totals.occupancyRate}%`}
            icon={<Building2 className="h-4 w-4" />}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- students ---------- */}
        <Card title={`Students awaiting a room (${students.data?.length ?? 0})`} className="p-0">
          {students.isLoading && <LoadingBlock />}
          {students.data && (
            <div className="max-h-[30rem] overflow-y-auto">
              {students.data.length ? (
                <ul className="divide-y divide-white/[0.05]">
                  {students.data.map((s) => (
                    <li key={s.studentId}>
                      <button
                        type="button"
                        onClick={() => setStudent(s)}
                        className={clsx(
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]',
                          student?.studentId === s.studentId && 'bg-brand-500/[0.1]',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-200">
                            {s.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {s.rollNumber} · {s.course}, year {s.year}
                          </span>
                          <span
                            className={clsx(
                              'mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                              s.gender === 'FEMALE'
                                ? 'bg-pink-500/15 text-pink-300'
                                : 'bg-sky-500/15 text-sky-300',
                            )}
                          >
                            {s.gender === 'FEMALE' ? 'Female' : 'Male'}
                          </span>
                        </span>
                        {student?.studentId === s.studentId && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Everyone has a room"
                  description="No students in this block are waiting for an allocation."
                  icon={<Users className="h-6 w-6" />}
                />
              )}
            </div>
          )}
        </Card>

        {/* ---------- rooms ---------- */}
        <Card title={floor === null ? 'Choose a floor' : `Floor ${floor} — choose a room`}>
          {floor === null ? (
            <div className="grid max-h-[30rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {[...floors].reverse().map((f) => (
                <button
                  key={f.floor}
                  type="button"
                  disabled={f.isLocked}
                  onClick={() => setFloor(f.floor)}
                  className={clsx(
                    'rounded-lg border p-2.5 text-center transition-all',
                    f.isLocked
                      ? 'cursor-not-allowed border-rose-500/20 bg-rose-950/25 opacity-70'
                      : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/25',
                  )}
                >
                  <span
                    className="mx-auto mb-1 block h-1.5 w-6 rounded-full"
                    style={{ background: AVAILABILITY_HEX[f.status] }}
                  />
                  <span className="block text-sm font-bold text-slate-100">{f.floor}</span>
                  <span className="block text-[10px] text-slate-500">
                    {f.isLocked ? 'Full' : `${f.availableRooms} free`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost btn-sm mb-3"
                onClick={() => {
                  setFloor(null);
                  setRoom(null);
                }}
              >
                ← All floors
              </button>
              {rooms.isLoading ? (
                <LoadingBlock />
              ) : (
                <div className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                  {rooms.data?.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={r.isLocked}
                      onClick={() => setRoom(r)}
                      className={clsx(
                        'rounded-lg border p-2 text-center transition-all',
                        r.isLocked
                          ? 'cursor-not-allowed border-rose-500/20 bg-rose-950/25 opacity-70'
                          : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/25',
                        room?.id === r.id && 'ring-2 ring-brand-400',
                      )}
                    >
                      <span
                        className="mx-auto mb-1 block h-1.5 w-6 rounded-full"
                        style={{ background: AVAILABILITY_HEX[r.status] }}
                      />
                      <span className="block text-sm font-bold text-slate-100">{r.roomNumber}</span>
                      <span className="block text-[10px] text-slate-500">
                        {r.isLocked ? 'Full' : `${r.freeBeds}/${r.capacity}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---------- confirm ---------- */}
      <Modal
        open={Boolean(student && room)}
        onClose={() => setRoom(null)}
        title="Confirm allocation"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRoom(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={allocate.isPending || !genderMatches}
              onClick={() => allocate.mutate()}
            >
              {allocate.isPending && <Spinner />}
              Allocate room
            </button>
          </>
        }
      >
        {student && room && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="label mb-1">Student</p>
                <p className="text-sm font-semibold text-slate-100">{student.name}</p>
                <p className="text-xs text-slate-500">
                  {student.rollNumber} · {student.course}, year {student.year}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="label mb-1">Room</p>
                <p className="text-sm font-semibold text-slate-100">
                  {room.roomNumber} · Floor {room.floor}
                </p>
                <p className="text-xs text-slate-500">
                  {room.occupancyLabel} · {room.freeBeds} of {room.capacity} beds free
                </p>
              </div>
            </div>
            {genderMatches ? (
              <Alert tone="info">
                The lowest free bed in the room is assigned automatically.
              </Alert>
            ) : (
              <Alert tone="warning">
                {selectedHostel?.code} is a {selectedHostel?.genderLabel.toLowerCase()} and admits
                only {selectedHostel?.gender === 'FEMALE' ? 'female' : 'male'} students.{' '}
                {student.name} cannot be allocated here.
              </Alert>
            )}
            {allocate.isError && (
              <Alert tone="error">
                {allocate.error instanceof ApiError
                  ? allocate.error.message
                  : 'Could not complete the allocation.'}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
