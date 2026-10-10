# AllocFlow — Hostel Room Booking & Management System

A production-grade web application implementing the requirements in
`Hostel_SRS_v1_new.docx` (IEEE 830) and `hostel_feature_plan_new.docx`.

Students see live room and bed availability through a 3D model of their hostel
block, book a bed, raise housekeeping and repair requests, request gatepasses,
track electricity bills and read notices. Wardens, supervisors, security and
mess staff each get a dashboard scoped to what their role is allowed to do.

---

## Quick start

Requires Node.js 20.11 or newer. No database server is needed to run locally.

```bash
npm install
npm run dev
```

- Web app — <http://localhost:5173>
- REST API — <http://localhost:4000/api>
- API documentation (Swagger) — <http://localhost:4000/api/docs>

The API creates, migrates and seeds its database on first boot.

### Demo accounts

Every role in the SRS has an account. The password for all of them is
`Password@123`.

| Role | Email | What it demonstrates |
| --- | --- | --- |
| Student (male) | `student@allocflow.edu` | Booking, requests, gatepass, bills, mess. Lives in BSH |
| Student (female) | `student.f@allocflow.edu` | The same, from a women's block. Lives in KCH |
| Warden | `warden.bsh@allocflow.edu` | Approvals, allocation, inspections (BSH) |
| Warden (women's) | `warden.kch@allocflow.edu` | The same, for KCH |
| Supervisor | `supervisor@allocflow.edu` | Campus-wide occupancy reporting |
| Security | `security@allocflow.edu` | Gatepass verification at the gate |
| Mess Staff | `mess@allocflow.edu` | Menu management and feedback |
| Administrator | `admin@allocflow.edu` | Full system access |

### Gender-segregated allocation

The campus runs men's and women's blocks, and a student may only hold a bed in
a block that admits them:

| | Blocks |
| --- | --- |
| Men's | BSH, RTH, VSH |
| Women's | KCH, GARGI, APJ |

This comes from `hostels.gender` compared against `students.gender` — never a
hard-coded list of codes — so re-designating a block is a data change. The rule
lives in one module, `server/src/common/eligibility.ts`, and is **enforced
inside the booking transaction**, which is the only path that creates a
booking. A student calling the API directly gets `403`, and so does a warden
allocating on that student's behalf at the desk.

The UI mirrors the same flag rather than reimplementing it: ineligible blocks
are dimmed and padlocked in the hostel selector, opening one shows a banner
explaining why, and the *Book a bed here* button is not rendered. Availability
is still fully browsable — the restriction is on booking, not on looking.

To try it: sign in as `student@allocflow.edu` (male) and open KCH. Every room
shows its true availability and none of them can be booked.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | NestJS 11 + TypeScript | Module/service/controller separation, DI, guards and pipes give the RBAC and validation rules one place to live |
| ORM | Drizzle | SQL-first and fully typed; migrations are readable SQL rather than generated opaque steps |
| Database | PostgreSQL | Relational integrity for the SRS E-R model: foreign keys, CHECK constraints, partial unique indexes, real transactions |
| Frontend | React 18 + Vite + TypeScript | Fast builds, mature ecosystem, straightforward code splitting |
| Data fetching | TanStack Query | Caching and invalidation for availability data that several screens share |
| Styling | Tailwind CSS | A consistent design system without a parallel stylesheet to maintain |
| 3D | react-three-fiber + drei (three.js) | Declarative three.js that composes with React state |

### On the database driver

AllocFlow targets **PostgreSQL**, and the driver is chosen from `DATABASE_URL`:

- `postgresql://…` — [node-postgres](https://node-postgres.com) against a real
  server (docker-compose, RDS, Neon, …). **Use this in production.**
- `file:./data/allocflow` or unset — [PGlite](https://pglite.dev), which is
  PostgreSQL compiled to WebAssembly and persisted to disk, running in-process.

The schema, the SQL migrations and every query are identical across both.
PGlite exists so the project runs with zero setup; it is not a separate code
path to maintain, and it is not intended for production.

To run against a real PostgreSQL server:

```bash
docker compose up -d
# then in server/.env
DATABASE_URL=postgresql://allocflow:allocflow@localhost:5432/allocflow
```

---

## Project layout

```
AllocFlow/
├── server/                     NestJS API
│   └── src/
│       ├── config/env.ts        Environment loading and validation
│       ├── database/
│       │   ├── schema.ts        The SRS E-R model as Drizzle tables
│       │   ├── connection.ts    Driver selection (node-postgres | PGlite)
│       │   ├── migrations/      Generated SQL migrations
│       │   └── seed.ts          Demo dataset
│       ├── common/              Guards, decorators, filters, interceptors
│       ├── auth/                JWT authentication, RBAC principal resolution
│       ├── hostels/             Availability, 3D structure, room administration
│       ├── bookings/            Bed allocation and vacating
│       ├── requests/            Housekeeping and repair tickets
│       ├── gatepasses/          Request → approval → gate verification
│       ├── announcements/       Broadcast notices
│       ├── electricity/         Billing and consumption
│       ├── mess/                Menus and feedback (extension phase)
│       ├── raids/               Inspection scheduling (extension phase)
│       ├── notifications/       In-app alert inbox
│       └── dashboard/           Per-role aggregates
└── web/                        React client
    └── src/
        ├── lib/                 API client, auth context, formatting, types
        ├── components/          Layout and the shared UI kit
        └── features/
            ├── explorer/        The 3D hostel model and drill-down
            ├── dashboard/       One view per role
            ├── myroom/  requests/  gatepass/  electricity/
            ├── announcements/  mess/  raids/  allocate/
            └── auth/
```

---

## The data model

Implements the E-R diagram in SRS §3.4 exactly:

```
                    ┌──────────┐
                    │   USER   │  UserID, Name, Role, Contact
                    └────┬─────┘
                is-a ┌───┴───┐ is-a
              ┌──────┴─┐   ┌─┴──────┐
              │STUDENT │   │ STAFF  │
              └───┬────┘   └───┬────┘
                  │            │
   ┌──────────────┼────────┐   ├── posts ──────→ ANNOUNCEMENT
   │              │        │   ├── approves ───→ GATEPASS
   ▼              ▼        ▼   ├── resolves ───→ REQUEST
BOOKING       GATEPASS  REQUEST└── supervises ─→ ROOM
   │
   └── M:1 ──→ ROOM   Block/Floor, Capacity, Occupancy
```

`USER` is the supertype; `STUDENT` and `STAFF` each key on `user_id`, which is
both their primary key and a foreign key — that is what makes the is-a
relationship exactly one-to-one.

Extension-phase entities (`mess_menus`, `mess_feedback`, `raids`) and
`notifications` sit alongside the core eight.

### Integrity enforced by the database, not just the application

| Rule | Mechanism |
| --- | --- |
| Room capacity is double or triple only | `CHECK (capacity IN (2, 3))` |
| Occupancy never exceeds capacity | `CHECK (occupied_beds BETWEEN 0 AND capacity)` |
| A bed holds at most one active booking | `UNIQUE (room_id, bed_index) WHERE status = 'ACTIVE'` |
| A student holds at most one active booking | `UNIQUE (student_id) WHERE status = 'ACTIVE'` |
| Gatepass window is ordered | `CHECK (to_time > from_time)` |
| Every enumerated column | `CHECK (col IN (…))` |

Booking is the one genuinely contended operation, so it does not rely on a
read-then-write check. `occupied_beds` is incremented by a **conditional
UPDATE** that only matches while the room is under capacity; Postgres
serialises concurrent updates on the row lock, so exactly one of two students
racing for the last bed succeeds and the other is rejected with `409`. The
partial unique index above catches any residual race. Both run inside one
transaction, so a rejected booking leaves nothing behind.

---

## The 3D hostel interface

One conceptual base model serves every hostel. Nothing is authored per block —
the geometry is generated from two database columns, `hostels.floors` and
`hostels.rooms_per_floor`, so selecting BSH produces a fourteen-storey tower
and Gargi an eight-storey one from identical code.

**Drill-down** follows SRS §3.2.1: *select a floor → view its rooms → open a
room → see live bed availability.* Rooms are laid out as a double-loaded
corridor, and room blocks are only instantiated for the floor being inspected,
so the scene stays at a few dozen meshes however tall the building is.

**Colour coding** is computed once, on the server
(`server/src/hostels/availability.ts`), and consumed identically by the API,
the 3D scene and the room lists:

| Colour | Meaning | Selectable |
| --- | --- | --- |
| 🟢 Green | More than one bed available | Yes |
| 🟡 Yellow | Exactly one bed available | Yes |
| 🔴 Red | Fully booked, or withdrawn from allocation | **No — locked** |

Locked floors and rooms are refused in three independent places: the API
rejects the booking, the list controls are `disabled`, and the 3D model
answers a click with an explanation rather than opening.

Each room block carries one pip per bed — lit when free, dark when taken —
which is where the double/triple capacity restriction becomes visible in 3D.

The canvas degrades gracefully: if the browser cannot provide WebGL, or the
GPU reclaims the context, the panel says so and the floor and room lists beside
it continue to show exactly the same live availability.

---

## Role-based access control

Enforced by two globally registered guards, so protection is the default and a
new endpoint cannot be exposed by forgetting to add one. A route is reachable
without a token only if it opts out with `@Public()`.

| | Student | Warden | Supervisor | Security | Mess | Admin |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| View availability / 3D explorer | ✅ | ✅ | ✅ | — | — | ✅ |
| Book / vacate own bed | ✅ | — | — | — | — | — |
| Allocate on a student's behalf | — | ✅ | ✅ | — | — | ✅ |
| Raise housekeeping / repair | ✅ | — | — | — | — | — |
| Resolve requests | — | ✅ | ✅ | — | — | ✅ |
| Request a gatepass | ✅ | — | — | — | — | — |
| Approve / reject gatepass | — | ✅ | — | — | — | ✅ |
| Verify at the gate | — | — | — | ✅ | — | ✅ |
| Post announcements | — | ✅ | ✅ | — | ✅ | ✅ |
| Electricity ledger | own room | block | campus | — | — | campus |
| Mess menu | view | edit | view | — | edit | edit |
| Schedule inspections | — | ✅ | ✅ | — | — | ✅ |

Wardens and mess staff are additionally scoped to their **assigned block**;
supervisors and administrators are campus-wide. Raids are invisible to
students by design — an announced surprise inspection is not one.

Occupant names in a room are shown to staff and to that room's own residents;
to any other student a taken bed reads simply as "Occupied".

---

## Performance

SRS NFR1 sets a 3-second budget for user actions. Measured against the seeded
dataset (6 hostels, 688 rooms, 260 students, 567 bills):

| Endpoint | Server time |
| --- | --- |
| `GET /hostels` | ~6 ms |
| `GET /hostels/:id/structure` (14 floors) | ~8 ms |
| `GET /hostels/:id/floors/:f/rooms` | ~12 ms |
| `GET /rooms/:id` | ~15 ms |
| `GET /dashboard` (warden) | ~40 ms |

What keeps it there:

- `rooms.occupied_beds` is maintained transactionally, so availability is an
  indexed read rather than an aggregate over `bookings`.
- Floor and hostel roll-ups are single `GROUP BY` queries with
  `FILTER (WHERE …)`, not per-floor round trips.
- Dashboards issue their independent queries concurrently, costing roughly one
  round trip of latency instead of the sum of their parts.
- Indexes cover every filter the UI actually uses.
- `X-Response-Time` is returned on every response, and anything over a second
  is logged as a warning.

---

## Commands

```bash
npm run dev          # API and web app together
npm run build        # Production build of both
npm run typecheck    # Typecheck both packages

npm run db:migrate   # Apply migrations
npm run db:seed      # Seed (no-op if already seeded)
npm run db:reset     # Drop, re-migrate and re-seed (refuses in production)
npm run db:generate  # Regenerate SQL after editing schema.ts
```

---

## Configuration

`server/.env` (see `.env.example`):

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `DATABASE_URL` | `file:./data/allocflow` | `postgresql://…` selects a real server |
| `JWT_SECRET` | dev-only fallback | **Required** and must be ≥32 chars when `NODE_ENV=production` |
| `JWT_EXPIRES_IN` | `12h` | |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `AUTO_MIGRATE` | `true` | Migrate on boot |
| `AUTO_SEED` | `true` | Seed on boot if empty |

Boot fails immediately on a missing or weak production `JWT_SECRET` rather than
starting in an insecure state.

---

## Requirements coverage

| SRS | Requirement | Where |
| --- | --- | --- |
| FR1 | Floor → room drill-down | `features/explorer` |
| FR2 | Fully booked floors/rooms not selectable | `hostels/availability.ts`, enforced in API + UI |
| FR3 | Available rooms per floor shown upfront | `GET /hostels/:id/structure` |
| FR4 | Book a room/bed | `bookings/bookings.service.ts` |
| FR5 | Housekeeping request with hostel and room | `requests` — auto-filled from the student's allocation |
| FR6 | Staff notified instantly | `notifyBlockStaff`, alert inbox |
| FR7 | Gatepass request, approve, verify | `gatepasses` + `features/gatepass` |
| FR8 | Electricity billing | `electricity` — per-room total and per-head share |
| FR9 | Announcements | `announcements` |
| FR10 | Mess menu and feedback | `mess` |
| FR11 | Repair tickets with status | `requests` (`type = REPAIR`) |
| FR12 | Warden raids | `raids` |
| FR13 | Role-based interfaces | Guards + role-aware navigation and dashboards |
| NFR1 | Under 3 seconds | See Performance |
| NFR3 | Role-based access control | Global `JwtAuthGuard` + `RolesGuard` |
| NFR4 | Simple, no training needed | One-tap Notify, guided drill-down |
| NFR5 | Scales to multiple blocks | Multi-hostel from the schema up |
| NFR7 | Browsers and mobile | Responsive down to 375 px |
| NFR8 | Data kept secure | bcrypt, JWT, Helmet, rate limiting, strict DTO validation, occupant-name scoping |

Out of scope per SRS §2.4: payment gateway integration.
