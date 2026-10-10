/**
 * Occupancy colour coding — the single source of truth shared by the REST API,
 * the 3D scene and the business rules that lock fully-booked rooms.
 *
 *   GREEN  : more than one bed available
 *   YELLOW : exactly one bed available
 *   RED    : fully booked (or administratively blocked) — selection is locked
 */
export type AvailabilityStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface RoomAvailability {
  freeBeds: number;
  status: AvailabilityStatus;
  /** True when the room cannot be selected for booking. */
  isLocked: boolean;
}

export function computeRoomAvailability(
  capacity: number,
  occupiedBeds: number,
  isBlocked = false,
): RoomAvailability {
  const freeBeds = Math.max(0, capacity - occupiedBeds);

  /*
   * A blocked room is reported as RED regardless of how many beds are
   * physically free: to every consumer it behaves exactly like a full room,
   * which keeps the locking rule in one place instead of two.
   */
  if (isBlocked || freeBeds === 0) {
    return { freeBeds: isBlocked ? 0 : freeBeds, status: 'RED', isLocked: true };
  }
  return { freeBeds, status: freeBeds === 1 ? 'YELLOW' : 'GREEN', isLocked: false };
}

/** A floor is locked when it contains no selectable room. */
export function computeFloorStatus(
  availableRooms: number,
  freeBeds: number,
): { status: AvailabilityStatus; isLocked: boolean } {
  if (availableRooms === 0) return { status: 'RED', isLocked: true };
  return { status: freeBeds === 1 ? 'YELLOW' : 'GREEN', isLocked: false };
}
