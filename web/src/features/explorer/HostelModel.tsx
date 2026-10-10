import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import clsx from 'clsx';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Boxes, Lock, RotateCcw } from 'lucide-react';
import { AVAILABILITY_HEX } from '../../components/ui';
import type { FloorSummary, HostelStructure, RoomSummary } from '../../lib/types';
import {
  deriveGeometry,
  FLOOR_HEIGHT,
  framingDistance,
  ROOM_D,
  ROOM_H,
  ROOM_W,
  SLAB_THICKNESS,
  type Geometry,
} from './geometry';

/**
 * A single conceptual base model, generated from database variables.
 *
 * Nothing here is authored per hostel: the geometry is derived entirely from
 * `floors` and `roomsPerFloor`, so selecting BSH produces a fourteen-storey
 * tower and Gargi an eight-storey one from exactly the same code. Rooms are
 * laid out as a double-loaded corridor — two ranks either side of a central
 * walkway — which is both the common real-world plan and the arrangement that
 * reads most clearly from an orbiting camera.
 */

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/**
 * Eases the orbit target to the floor under inspection. Driving the target
 * rather than the camera keeps the user's own orbit angle and zoom intact, so
 * drilling into a floor feels like the camera settling rather than a cut.
 */
function CameraRig({
  targetY,
  radius,
  focusDistance,
}: {
  targetY: number;
  radius: number;
  focusDistance: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const desired = useRef(new THREE.Vector3(0, targetY, 0));
  const offset = useRef(new THREE.Vector3());

  /*
   * The dolly is animated only while `focusDistance` is settling. Running it
   * every frame would fight the user's own scroll-wheel zoom, so once the
   * camera is close enough the rig stops touching the distance and hands
   * control back.
   */
  const dollying = useRef(false);
  useEffect(() => {
    dollying.current = true;
  }, [focusDistance]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;

    // Frame-rate independent easing.
    const t = 1 - Math.pow(0.0015, delta);
    desired.current.set(0, targetY, 0);
    c.target.lerp(desired.current, t);

    if (dollying.current) {
      const cam = state.camera;
      offset.current.copy(cam.position).sub(c.target);
      const current = offset.current.length();
      if (Math.abs(current - focusDistance) < 0.08) {
        dollying.current = false;
      } else {
        offset.current.setLength(THREE.MathUtils.lerp(current, focusDistance, t * 0.5));
        cam.position.copy(c.target).add(offset.current);
      }
    }

    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={radius * 0.22}
      maxDistance={radius * 2.2}
      // Stop short of the poles so the model is never viewed from directly
      // underneath, where the floor slabs occlude everything.
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2.05}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Floor slab                                                          */
/* ------------------------------------------------------------------ */

function FloorSlab({
  summary,
  geom,
  isSelected,
  isDimmed,
  onSelect,
  onHoverChange,
}: {
  summary: FloorSummary;
  geom: Geometry;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (floor: number) => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const y = (summary.floor - 1) * FLOOR_HEIGHT;
  const color = AVAILABILITY_HEX[summary.status];

  const interactive = !summary.isLocked;

  return (
    <group position={[0, y, 0]}>
      {/* Structural slab */}
      <mesh position={[0, SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[geom.width + 0.18, SLAB_THICKNESS, geom.depth + 0.18]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.85} metalness={0.05} />
      </mesh>

      {/*
        The tinted volume stands in for the floor as a whole. It is withdrawn
        once the floor is selected, because the individual room blocks are
        drawn in exactly that space — leaving it in would bury them inside a
        translucent box.
      */}
      {!isSelected && (
      <mesh
        position={[0, SLAB_THICKNESS + (FLOOR_HEIGHT - SLAB_THICKNESS) / 2 - 0.06, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          // Locked floors are reported upwards too: the page answers with an
          // explicit "fully booked" notice, which is more useful than a click
          // that silently does nothing.
          onSelect(summary.floor);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(interactive);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHoverChange(false);
        }}
        castShadow
      >
        <boxGeometry
          args={[geom.width, FLOOR_HEIGHT - SLAB_THICKNESS - 0.12, geom.depth]}
        />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.95 : isDimmed ? 0.16 : hovered ? 0.8 : 0.55}
          emissive={color}
          emissiveIntensity={isSelected ? 0.5 : hovered && interactive ? 0.35 : 0.1}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      )}

      {(hovered || isSelected) && (
        <Html
          position={[geom.width / 2 + 0.35, FLOOR_HEIGHT / 2, 0]}
          center
          distanceFactor={12}
          zIndexRange={[20, 0]}
        >
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/15 bg-surface-0/95 px-2 py-1 text-[11px] font-semibold text-slate-100 shadow-xl">
            Floor {summary.floor}
            <span className="ml-1.5 font-normal text-slate-400">
              {summary.isLocked ? 'full' : `${summary.availableRooms} rooms free`}
            </span>
          </div>
        </Html>
      )}

      {summary.isLocked && (
        <Html position={[0, FLOOR_HEIGHT / 2, geom.depth / 2 + 0.05]} center distanceFactor={14}>
          <div className="pointer-events-none rounded-full bg-rose-950/90 p-1 ring-1 ring-rose-500/50">
            <Lock className="h-2.5 w-2.5 text-rose-300" />
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Room block (rendered only for the floor being inspected)            */
/* ------------------------------------------------------------------ */

function RoomBlock({
  room,
  x,
  z,
  y,
  isSelected,
  onSelect,
  onHoverChange,
}: {
  room: RoomSummary;
  x: number;
  z: number;
  y: number;
  isSelected: boolean;
  onSelect: (room: RoomSummary) => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = AVAILABILITY_HEX[room.status];
  const interactive = !room.isLocked;

  // Bed pips on the roof: one per bed, lit when free and dark when taken.
  // This is where the double/triple capacity restriction becomes visible.
  const pips = useMemo(
    () =>
      Array.from({ length: room.capacity }, (_, i) => ({
        occupied: i < room.occupiedBeds,
        x: (i - (room.capacity - 1) / 2) * 0.2,
      })),
    [room.capacity, room.occupiedBeds],
  );

  const lift = isSelected ? 0.14 : hovered && interactive ? 0.06 : 0;

  return (
    <group position={[x, y + lift, z]}>
      <mesh
        position={[0, ROOM_H / 2, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          // As with floors, a locked room still reports the click so the page
          // can explain why it cannot be opened.
          onSelect(room);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(interactive);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHoverChange(false);
        }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[ROOM_W * 0.9, ROOM_H, ROOM_D * 0.88]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={room.isLocked ? 0.72 : 0.92}
          emissive={color}
          emissiveIntensity={isSelected ? 0.7 : hovered && interactive ? 0.45 : 0.12}
          roughness={0.4}
          metalness={0.15}
        />
      </mesh>

      {pips.map((p, i) => (
        <mesh key={i} position={[p.x, ROOM_H + 0.05, 0]}>
          <boxGeometry args={[0.11, 0.06, 0.22]} />
          <meshStandardMaterial
            color={p.occupied ? '#334155' : '#f8fafc'}
            emissive={p.occupied ? '#000000' : '#ffffff'}
            emissiveIntensity={p.occupied ? 0 : 0.45}
            roughness={0.6}
          />
        </mesh>
      ))}

      {(hovered || isSelected) && (
        <Html position={[0, ROOM_H + 0.34, 0]} center distanceFactor={9} zIndexRange={[30, 10]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/15 bg-surface-0/95 px-2 py-1 text-[11px] font-semibold text-slate-100 shadow-xl">
            {room.roomNumber}
            <span className="ml-1.5 font-normal text-slate-400">
              {room.isLocked ? 'full' : `${room.freeBeds}/${room.capacity} free`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function Scene({
  structure,
  rooms,
  selectedFloor,
  selectedRoomId,
  onSelectFloor,
  onSelectRoom,
  onHoverChange,
}: {
  structure: HostelStructure;
  rooms: RoomSummary[] | undefined;
  selectedFloor: number | null;
  selectedRoomId: number | null;
  onSelectFloor: (floor: number) => void;
  onSelectRoom: (room: RoomSummary) => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const { hostel, floors } = structure;
  const geom = useMemo(
    () => deriveGeometry(hostel.floors, hostel.roomsPerFloor),
    [hostel.floors, hostel.roomsPerFloor],
  );

  const focusY = selectedFloor ? (selectedFloor - 1) * FLOOR_HEIGHT + 0.4 : geom.height / 2;
  // Close in on a single floor once one is opened; pull back out to frame the
  // whole envelope when the user returns to the building view.
  const focusDistance = framingDistance(geom, selectedFloor !== null);
  const radius = framingDistance(geom, false);
  const roomY = selectedFloor ? (selectedFloor - 1) * FLOOR_HEIGHT + SLAB_THICKNESS : 0;

  return (
    <>
      <CameraRig targetY={focusY} radius={radius} focusDistance={focusDistance} />

      {/*
        Lit entirely with scene lights rather than an HDR environment preset.
        drei's <Environment preset> fetches its map from a CDN at runtime,
        which would leave the canvas blank on a campus network that blocks it —
        and an availability screen has to render offline.
      */}
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#dbeafe', '#0f172a', 0.8]} />
      <directionalLight
        position={[6, geom.height + 6, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, geom.height * 0.6, -6]} intensity={0.55} color="#93c5fd" />
      <pointLight position={[0, geom.height * 0.5, geom.depth * 2]} intensity={0.4} />

      {/* Ground plane and podium */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <circleGeometry args={[radius * 2.2, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[geom.width + 1.1, 0.3, geom.depth + 1.1]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>

      {floors.map((f) => (
        <FloorSlab
          key={f.floor}
          summary={f}
          geom={geom}
          isSelected={selectedFloor === f.floor}
          isDimmed={selectedFloor !== null && selectedFloor !== f.floor}
          onSelect={onSelectFloor}
          onHoverChange={onHoverChange}
        />
      ))}

      {/* Rooms only materialise for the floor under inspection, which keeps the
          scene to a few dozen meshes however tall the tower is. */}
      {selectedFloor !== null &&
        rooms?.map((room, i) => {
          const pos = geom.roomPositions[i] ?? { x: 0, z: 0 };
          return (
            <RoomBlock
              key={room.id}
              room={room}
              x={pos.x}
              z={pos.z}
              y={roomY}
              isSelected={selectedRoomId === room.id}
              onSelect={onSelectRoom}
              onHoverChange={onHoverChange}
            />
          );
        })}
    </>
  );
}

/**
 * Reports whether the browser can give us a WebGL context at all. Some managed
 * devices and locked-down browsers cannot, and the explorer has to stay usable
 * for those students rather than showing them a black rectangle.
 */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

export function HostelModel({
  structure,
  rooms,
  selectedFloor,
  selectedRoomId,
  onSelectFloor,
  onSelectRoom,
}: {
  structure: HostelStructure;
  rooms: RoomSummary[] | undefined;
  selectedFloor: number | null;
  selectedRoomId: number | null;
  onSelectFloor: (floor: number) => void;
  onSelectRoom: (room: RoomSummary) => void;
}) {
  const [pointer, setPointer] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  /* Bumping this remounts the canvas, which is how a lost context is rebuilt. */
  const [canvasKey, setCanvasKey] = useState(0);
  const webglAvailable = useMemo(detectWebGL, []);

  const geom = deriveGeometry(structure.hostel.floors, structure.hostel.roomsPerFloor);

  /*
   * Frame the whole envelope with margin, driven by whichever dimension is
   * binding. A fourteen-storey tower is height-bound and a squat block is
   * width-bound, so both terms are needed for every hostel to open fully in
   * view rather than cropped.
   */
  const dist = framingDistance(geom, false);

  if (!webglAvailable) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">3D view unavailable</p>
          <p className="mt-1 text-xs text-slate-500">
            This browser cannot render 3D graphics. Use the floor and room lists beside
            this panel — they show exactly the same live availability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'relative h-full w-full',
        pointer ? 'canvas-pointer' : 'canvas-default',
      )}
    >
      <Canvas
        key={canvasKey}
        shadows
        // Capping the device pixel ratio keeps high-DPI phones from rendering
        // four times the pixels they need.
        dpr={[1, 1.8]}
        camera={{ position: [dist * 0.55, geom.height * 0.85 + 2, dist * 0.8], fov: 42 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          /*
           * A browser may take the GPU back at any time — on a driver reset, on
           * memory pressure, or when too many contexts are live. three.js does
           * not recover on its own, so without this the panel would silently
           * stay black. preventDefault() keeps the context restorable.
           */
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            setContextLost(true);
          });
          canvas.addEventListener('webglcontextrestored', () => setContextLost(false));
        }}
      >
        <color attach="background" args={['#0b1120']} />
        <fog attach="fog" args={['#0b1120', dist * 1.6, dist * 4]} />
        <Suspense fallback={null}>
          <Scene
            structure={structure}
            rooms={rooms}
            selectedFloor={selectedFloor}
            selectedRoomId={selectedRoomId}
            onSelectFloor={onSelectFloor}
            onSelectRoom={onSelectRoom}
            onHoverChange={setPointer}
          />
        </Suspense>
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-0/90 backdrop-blur-sm">
          <div className="max-w-xs px-6 text-center">
            <RotateCcw className="mx-auto mb-3 h-7 w-7 text-slate-500" />
            <p className="text-sm font-semibold text-slate-300">3D view interrupted</p>
            <p className="mt-1 text-xs text-slate-500">
              The browser reclaimed the graphics context. Availability data is unaffected.
            </p>
            <button
              type="button"
              className="btn-secondary btn-sm mt-3"
              onClick={() => {
                setContextLost(false);
                setCanvasKey((k) => k + 1);
              }}
            >
              Rebuild the 3D view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
