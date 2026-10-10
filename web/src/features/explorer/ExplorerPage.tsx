import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronLeft, DoorOpen, Layers, Lock, RotateCcw, User } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type {
  Hostel,
  HostelStructure,
  RoomDetail,
  RoomSummary,
} from '../../lib/types';
import {
  Alert,
  AVAILABILITY_HEX,
  AvailabilityBadge,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { HostelModel } from './HostelModel';

/**
 * The flagship "Visibility of Available Rooms" flow (SRS 3.2.1):
 *
 *   choose a hostel -> select a floor -> drill into a room -> see live beds
 *
 * Exactly one hostel is loaded at a time. Fully booked floors and rooms are
 * inert in both the 3D model and the list beside it, satisfying FR2.
 */
export default function ExplorerPage() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();

  const [hostelId, setHostelId] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomSummary | null>(null);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);

  const hostelsQuery = useQuery({
    queryKey: ['hostels'],
    queryFn: () => api<Hostel[]>('/hostels'),
  });

  // Open on the student's own block, which is the one they most likely want.
  useEffect(() => {
    if (hostelId !== null || !hostelsQuery.data?.length) return;
    const preferred = hostelsQuery.data.find((h) => h.id === user?.hostelId);
    setHostelId(preferred?.id ?? hostelsQuery.data[0].id);
  }, [hostelsQuery.data, hostelId, user?.hostelId]);

  const structureQuery = useQuery({
    queryKey: ['structure', hostelId],
    queryFn: () => api<HostelStructure>(`/hostels/${hostelId}/structure`),
    enabled: hostelId !== null,
  });

  const roomsQuery = useQuery({
    queryKey: ['floor-rooms', hostelId, selectedFloor],
    queryFn: () => api<RoomSummary[]>(`/hostels/${hostelId}/floors/${selectedFloor}/rooms`),
    enabled: hostelId !== null && selectedFloor !== null,
  });

  const roomDetailQuery = useQuery({
    queryKey: ['room', selectedRoom?.id],
    queryFn: () => api<RoomDetail>(`/rooms/${selectedRoom!.id}`),
    enabled: selectedRoom !== null,
  });

  const bookMutation = useMutation({
    mutationFn: (roomId: number) =>
      api<{ id: number; bedIndex: number }>('/bookings', {
        method: 'POST',
        body: { roomId },
      }),
    onSuccess: async () => {
      // Availability changed for everyone, so drop every cached view of it.
      await queryClient.invalidateQueries({ queryKey: ['hostels'] });
      await queryClient.invalidateQueries({ queryKey: ['structure'] });
      await queryClient.invalidateQueries({ queryKey: ['floor-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['room'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['my-booking'] });
      await refresh();
    },
  });

  const selectHostel = (id: number) => {
    setHostelId(id);
    setSelectedFloor(null);
    setSelectedRoom(null);
    bookMutation.reset();
  };

  const handleSelectFloor = (floor: number) => {
    const summary = structureQuery.data?.floors.find((f) => f.floor === floor);
    if (summary?.isLocked) {
      setLockedNotice(`Floor ${floor} is fully booked and cannot be opened.`);
      window.setTimeout(() => setLockedNotice(null), 2600);
      return;
    }
    setSelectedFloor(floor);
    setSelectedRoom(null);
  };

  const handleSelectRoom = (room: RoomSummary) => {
    if (room.isLocked) {
      setLockedNotice(`Room ${room.roomNumber} is fully booked.`);
      window.setTimeout(() => setLockedNotice(null), 2600);
      return;
    }
    setSelectedRoom(room);
    bookMutation.reset();
  };

  const hostels = hostelsQuery.data ?? [];
  const structure = structureQuery.data;
  const floors = structure?.floors ?? [];
  const currentFloor = floors.find((f) => f.floor === selectedFloor);

  const alreadyAllocated = Boolean(user?.currentRoomId);
  const isStudent = user?.role === 'STUDENT';
  /*
   * Gender segregation, mirrored from the server. This only hides an
   * affordance — POST /bookings re-checks it inside the transaction, so the
   * rule holds even if this flag is wrong or the client is bypassed entirely.
   */
  const canBookHere = structure?.eligibility.allowed ?? true;

  const legend = useMemo(
    () => [
      { color: AVAILABILITY_HEX.GREEN, label: 'More than one bed free' },
      { color: AVAILABILITY_HEX.YELLOW, label: 'Exactly one bed left' },
      { color: AVAILABILITY_HEX.RED, label: 'Fully booked — locked' },
    ],
    [],
  );

  if (hostelsQuery.isLoading) return <LoadingBlock label="Loading hostel blocks…" />;
  if (hostelsQuery.isError) {
    return (
      <ErrorBlock
        message="Could not load hostel blocks."
        onRetry={() => hostelsQuery.refetch()}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Hostel Explorer"
        subtitle="Pick a block, open a floor, then drill into a room to see live bed availability."
      />

      {/* ---------------- hostel selector ---------------- */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {hostels.map((h) => {
          const active = h.id === hostelId;
          // Blocks the viewer cannot book stay browsable, but say so plainly.
          const barred = !h.eligibility.allowed;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => selectHostel(h.id)}
              aria-pressed={active}
              title={h.eligibility.reason ?? `${h.name} — ${h.genderLabel}`}
              className={clsx(
                'group shrink-0 rounded-xl border px-4 py-3 text-left transition-all',
                active
                  ? 'border-transparent bg-white/[0.07] shadow-lg'
                  : 'border-white/[0.07] bg-surface-1/60 hover:border-white/20 hover:bg-surface-2/70',
                barred && !active && 'opacity-55',
              )}
              style={active ? { boxShadow: `inset 0 0 0 1.5px ${h.accentColor}` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: h.accentColor }}
                />
                <span className="text-sm font-bold text-white">{h.code}</span>
                {h.id === user?.hostelId && (
                  <span className="badge bg-brand-500/20 text-brand-200">Yours</span>
                )}
                {barred && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
              </div>
              <p className="mt-0.5 max-w-[13rem] truncate text-xs text-slate-400">{h.name}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 font-medium',
                    h.gender === 'FEMALE'
                      ? 'bg-pink-500/15 text-pink-300'
                      : h.gender === 'MALE'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'bg-violet-500/15 text-violet-300',
                  )}
                >
                  {h.genderLabel}
                </span>
                {h.floors} floors · {h.freeBeds} free
              </p>
            </button>
          );
        })}
      </div>

      {lockedNotice && (
        <div className="mb-4 animate-shake">
          <Alert tone="error">{lockedNotice}</Alert>
        </div>
      )}

      {/*
        Viewing a block this student cannot be allocated into. Availability is
        still shown — the restriction is on booking, not on looking — so the
        banner explains up front why the action will not be offered.
      */}
      {isStudent && structure && !structure.eligibility.allowed && (
        <div className="mb-4">
          <Alert tone="info">
            {structure.eligibility.reason} You can browse it, but rooms here cannot be booked
            with your account.
          </Alert>
        </div>
      )}

      {structureQuery.isLoading && <LoadingBlock label="Generating the building model…" />}

      {structure && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          {/* ---------------- 3D model ---------------- */}
          <div className="card overflow-hidden p-0">
            {/*
              The block caption sits in its own row rather than floating over
              the canvas: at narrow widths the text wraps and would otherwise
              be laid across the model itself.
            */}
            <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight text-white">
                  {structure.hostel.code}
                </p>
                <p className="truncate text-xs text-slate-400">{structure.hostel.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {structure.hostel.floors} floors × {structure.hostel.roomsPerFloor} rooms ·{' '}
                  {structure.totals.freeBeds} of {structure.totals.totalBeds} beds free
                </p>
              </div>

              {selectedFloor !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFloor(null);
                    setSelectedRoom(null);
                  }}
                  className="btn-secondary btn-sm shrink-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Whole building</span>
                  <span className="sm:hidden">Back</span>
                </button>
              )}
            </header>

            <div className="h-[24rem] w-full sm:h-[30rem] lg:h-[36rem]">
              {/*
                Deliberately not keyed on the hostel id. Remounting <Canvas>
                per hostel creates a fresh WebGL context each time, and
                browsers drop the oldest once a handful are live — switching
                blocks a few times would blank the scene with a lost context.
                The scene is fully derived from these props, so it re-renders
                for a new hostel without being torn down.
              */}
              <HostelModel
                structure={structure}
                rooms={roomsQuery.data}
                selectedFloor={selectedFloor}
                selectedRoomId={selectedRoom?.id ?? null}
                onSelectFloor={handleSelectFloor}
                onSelectRoom={handleSelectRoom}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] px-4 py-3">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
              <span className="ml-auto hidden text-[11px] text-slate-500 sm:block">
                Drag to orbit · scroll to zoom · click a floor to open it
              </span>
            </div>
          </div>

          {/* ---------------- floor / room rail ---------------- */}
          <div className="space-y-4">
            {selectedFloor === null ? (
              <Card
                title={`Floors (${floors.length})`}
                action={
                  <span className="text-[11px] text-slate-500">
                    {structure.totals.availableRooms} rooms free
                  </span>
                }
              >
                <div className="max-h-[34rem] space-y-1.5 overflow-y-auto pr-1">
                  {[...floors].reverse().map((f) => (
                    <button
                      key={f.floor}
                      type="button"
                      disabled={f.isLocked}
                      onClick={() => handleSelectFloor(f.floor)}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        f.isLocked
                          ? 'cursor-not-allowed border-rose-500/20 bg-rose-950/20 opacity-70'
                          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]',
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-black"
                        style={{ background: AVAILABILITY_HEX[f.status] }}
                      >
                        {f.floor}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-200">
                          Floor {f.floor}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {f.availableRooms} of {f.totalRooms} rooms · {f.freeBeds} beds free
                        </span>
                      </span>
                      {f.isLocked ? (
                        <Lock className="h-4 w-4 shrink-0 text-rose-400" />
                      ) : (
                        <Layers className="h-4 w-4 shrink-0 text-slate-600" />
                      )}
                    </button>
                  ))}
                </div>
              </Card>
            ) : (
              <Card
                title={`Floor ${selectedFloor} — rooms`}
                action={
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedFloor(null);
                      setSelectedRoom(null);
                    }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Floors
                  </button>
                }
              >
                {currentFloor && (
                  <p className="mb-3 text-xs text-slate-500">
                    {currentFloor.availableRooms} of {currentFloor.totalRooms} rooms available ·{' '}
                    {currentFloor.freeBeds} beds free
                  </p>
                )}
                {roomsQuery.isLoading ? (
                  <LoadingBlock label="Loading rooms…" />
                ) : (
                  <div className="grid max-h-[30rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-3">
                    {roomsQuery.data?.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={r.isLocked}
                        onClick={() => handleSelectRoom(r)}
                        title={
                          r.isLocked
                            ? `Room ${r.roomNumber} is fully booked`
                            : `Room ${r.roomNumber} — ${r.freeBeds} of ${r.capacity} beds free`
                        }
                        className={clsx(
                          'rounded-lg border p-2 text-center transition-all',
                          r.isLocked
                            ? 'cursor-not-allowed border-rose-500/20 bg-rose-950/25 opacity-70'
                            : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07]',
                          selectedRoom?.id === r.id && 'ring-2 ring-brand-400',
                        )}
                      >
                        <span
                          className="mx-auto mb-1 block h-1.5 w-6 rounded-full"
                          style={{ background: AVAILABILITY_HEX[r.status] }}
                        />
                        <span className="block text-sm font-bold text-slate-100">
                          {r.roomNumber}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {r.isLocked ? 'Full' : `${r.freeBeds}/${r.capacity} free`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card title="Block summary">
              <dl className="space-y-2 text-sm">
                {[
                  ['Total rooms', structure.totals.totalRooms],
                  ['Rooms available', structure.totals.availableRooms],
                  ['Beds free', `${structure.totals.freeBeds} of ${structure.totals.totalBeds}`],
                  ['Occupancy', `${structure.totals.occupancyRate}%`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="font-semibold tabular-nums text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------- room detail ---------------- */}
      <Modal
        open={selectedRoom !== null}
        onClose={() => setSelectedRoom(null)}
        title={
          selectedRoom
            ? `Room ${selectedRoom.roomNumber} · Floor ${selectedRoom.floor}`
            : 'Room'
        }
        footer={
          isStudent && selectedRoom && !selectedRoom.isLocked && canBookHere ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRoom(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={bookMutation.isPending || alreadyAllocated}
                onClick={() => bookMutation.mutate(selectedRoom.id)}
              >
                {bookMutation.isPending && <Spinner />}
                {alreadyAllocated ? 'Already allocated' : 'Book a bed here'}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setSelectedRoom(null)}>
              Close
            </button>
          )
        }
      >
        {roomDetailQuery.isLoading && <LoadingBlock label="Loading beds…" />}
        {roomDetailQuery.data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <AvailabilityBadge
                status={roomDetailQuery.data.status}
                freeBeds={roomDetailQuery.data.freeBeds}
              />
              <span className="badge bg-white/[0.06] text-slate-300">
                {roomDetailQuery.data.occupancyLabel} occupancy
              </span>
              <span className="badge bg-white/[0.06] text-slate-300">
                <Building2 className="h-3 w-3" />
                {roomDetailQuery.data.hostelCode}
              </span>
            </div>

            {bookMutation.isSuccess && (
              <Alert tone="success">
                Room booked. You have been allocated bed {bookMutation.data?.bedIndex} in room{' '}
                {roomDetailQuery.data.roomNumber}.
              </Alert>
            )}
            {bookMutation.isError && (
              <Alert tone="error">
                {bookMutation.error instanceof ApiError
                  ? bookMutation.error.message
                  : 'Could not complete the booking.'}
              </Alert>
            )}
            {isStudent && !canBookHere && (
              <Alert tone="warning">{roomDetailQuery.data.eligibility.reason}</Alert>
            )}
            {isStudent && canBookHere && alreadyAllocated && !bookMutation.isSuccess && (
              <Alert tone="info">
                You already hold an allocation. Vacate it from “My Room” before booking another.
              </Alert>
            )}

            <div>
              <p className="label">Beds</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {roomDetailQuery.data.beds.map((bed) => (
                  <div
                    key={bed.bedIndex}
                    className={clsx(
                      'rounded-lg border p-3',
                      bed.isOccupied
                        ? 'border-white/[0.07] bg-white/[0.03]'
                        : 'border-emerald-500/30 bg-emerald-950/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-200">
                        Bed {bed.bedIndex}
                      </span>
                      <span
                        className={clsx(
                          'badge',
                          bed.isOccupied
                            ? 'bg-slate-500/15 text-slate-400'
                            : 'bg-emerald-500/15 text-emerald-300',
                        )}
                      >
                        {bed.isOccupied ? 'Occupied' : 'Available'}
                      </span>
                    </div>
                    {bed.occupant ? (
                      <div className="mt-2 flex items-start gap-2">
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <div className="min-w-0 text-xs">
                          <p className="truncate font-medium text-slate-300">
                            {bed.occupant.name}
                            {bed.occupant.isYou && (
                              <span className="ml-1.5 text-brand-300">(you)</span>
                            )}
                          </p>
                          <p className="truncate text-slate-500">
                            {bed.occupant.rollNumber} · {bed.occupant.course}, year{' '}
                            {bed.occupant.year}
                          </p>
                        </div>
                      </div>
                    ) : bed.isOccupied ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Occupant details are visible to residents and hostel staff.
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                        <DoorOpen className="h-3.5 w-3.5" />
                        Ready to allocate
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {roomDetailQuery.data.notes && (
              <div>
                <p className="label">Notes</p>
                <p className="text-sm text-slate-400">{roomDetailQuery.data.notes}</p>
              </div>
            )}
          </div>
        )}
        {roomDetailQuery.isError && (
          <EmptyState
            title="Could not load the room"
            description="Please close this dialog and try again."
            icon={<RotateCcw className="h-6 w-6" />}
          />
        )}
      </Modal>
    </div>
  );
}
