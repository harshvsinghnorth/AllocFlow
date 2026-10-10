/**
 * Building geometry derived from the two database variables that describe a
 * hostel: how many floors it has, and how many rooms sit on each floor.
 *
 * Kept in its own module rather than beside the components: a file that mixes
 * component and non-component exports cannot be hot-reloaded by React Fast
 * Refresh, which makes iterating on the 3D scene needlessly slow.
 */

export const FLOOR_HEIGHT = 1.15;
export const SLAB_THICKNESS = 0.09;
export const ROOM_W = 1.05;
export const ROOM_D = 1.15;
export const ROOM_H = 0.78;
export const CORRIDOR_D = 0.62;

export interface Geometry {
  cols: number;
  width: number;
  depth: number;
  height: number;
  roomPositions: { x: number; z: number }[];
}

/**
 * Lays the rooms out as a double-loaded corridor — two ranks either side of a
 * central walkway. That is both the common real-world plan and the arrangement
 * that reads most clearly from an orbiting camera.
 */
export function deriveGeometry(floors: number, roomsPerFloor: number): Geometry {
  const cols = Math.ceil(roomsPerFloor / 2);
  const width = cols * ROOM_W;
  const depth = 2 * ROOM_D + CORRIDOR_D;
  const height = floors * FLOOR_HEIGHT;

  const roomPositions = Array.from({ length: roomsPerFloor }, (_, i) => {
    // Fill the front rank left-to-right, then the rear rank, so room numbering
    // walks the corridor the way it does in the building itself.
    const isFront = i < cols;
    const col = isFront ? i : i - cols;
    return {
      x: (col - (cols - 1) / 2) * ROOM_W,
      z: isFront ? (CORRIDOR_D + ROOM_D) / 2 : -(CORRIDOR_D + ROOM_D) / 2,
    };
  });

  return { cols, width, depth, height, roomPositions };
}

/** Distance that frames the whole envelope, or a single floor once opened. */
export function framingDistance(geom: Geometry, floorSelected: boolean): number {
  return floorSelected
    ? Math.max(geom.width * 1.5, geom.depth * 2.2, 7)
    : Math.max(geom.width * 2.4, geom.height * 1.95, 12);
}
