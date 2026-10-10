/**
 * Seeds a demonstrable dataset: six hostel blocks, their procedurally derived
 * rooms, one account per role, a cohort of students with live bookings, and
 * enough operational history that every dashboard has something real to show.
 *
 * Idempotent — re-running is a no-op once hostels exist, unless SEED_FORCE=true.
 */
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createDatabase, type Db } from './connection';
import { runMigrations } from './migrate';
import { loadEnv } from '../config/env';
import * as s from './schema';

/**
 * Hostel definitions. `floors` and `roomsPerFloor` are the only inputs the 3D
 * renderer needs — the building geometry is generated from them, so BSH really
 * does come out fourteen storeys tall.
 */
const HOSTELS = [
  { code: 'BSH', name: 'Bhaskaracharya Sadan', floors: 14, roomsPerFloor: 12, gender: 'MALE', accentColor: '#38bdf8' },
  { code: 'KCH', name: 'Kalpana Chawla Hostel', floors: 9, roomsPerFloor: 10, gender: 'FEMALE', accentColor: '#f472b6' },
  { code: 'APJ', name: 'APJ Abdul Kalam Hostel', floors: 11, roomsPerFloor: 14, gender: 'FEMALE', accentColor: '#34d399' },
  { code: 'RTH', name: 'Rabindranath Tagore Hostel', floors: 7, roomsPerFloor: 10, gender: 'MALE', accentColor: '#fbbf24' },
  { code: 'GARGI', name: 'Gargi Hostel', floors: 8, roomsPerFloor: 12, gender: 'FEMALE', accentColor: '#a78bfa' },
  { code: 'VSH', name: 'Vikram Sarabhai Hostel', floors: 10, roomsPerFloor: 11, gender: 'MALE', accentColor: '#fb7185' },
] as const;

const COURSES = ['B.Tech CSE', 'B.Tech ECE', 'B.Tech ME', 'B.Tech Civil', 'BBA', 'B.Des'];

/*
 * Split by gender so that a generated student's name, recorded gender and
 * allocated block are always consistent with one another — the seed is the
 * demo dataset, and an obviously mismatched row reads as a bug in the rule.
 */
const MALE_FIRST = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Kabir','Dhruv','Neel','Advait','Om','Yash'];
const FEMALE_FIRST = ['Ananya','Diya','Aadhya','Kiara','Saanvi','Myra','Anika','Navya','Riya','Ira','Meera','Tara','Zoya','Ridhi','Aarohi','Sara'];
const LAST = ['Sharma','Verma','Gupta','Singh','Patel','Reddy','Nair','Iyer','Bose','Kaur','Mehta','Joshi','Rao','Malhotra','Chatterjee'];

/** Deterministic PRNG so repeated seeds produce an identical, reviewable dataset. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export async function seed(db: Db, opts: { force?: boolean } = {}): Promise<void> {
  const existing = await db.select({ id: s.hostels.id }).from(s.hostels).limit(1);
  if (existing.length > 0 && !opts.force) {
    console.log('[seed] database already seeded, skipping');
    return;
  }

  if (opts.force) {
    // Order matters: children before parents.
    await db.execute(sql`truncate table
      announcement_reads, notifications, mess_feedback, mess_menus, raids,
      electricity_bills, gatepasses, requests, announcements, bookings,
      students, staff, users, rooms, hostels
      restart identity cascade`);
  }

  const rng = makeRng(20260907);
  const passwordHash = await bcrypt.hash('Password@123', 10);
  const now = new Date();

  /* ---------------- hostels + procedurally generated rooms ---------------- */

  const hostelRows = await db.insert(s.hostels).values(HOSTELS.map((h) => ({ ...h }))).returning();
  const hostelByCode = new Map(hostelRows.map((h) => [h.code, h]));

  const roomValues: (typeof s.rooms.$inferInsert)[] = [];
  for (const hostel of hostelRows) {
    for (let floor = 1; floor <= hostel.floors; floor++) {
      for (let n = 1; n <= hostel.roomsPerFloor; n++) {
        roomValues.push({
          hostelId: hostel.id,
          floor,
          // e.g. floor 3, room 7 -> "307"; floor 12 -> "1207"
          roomNumber: `${floor}${String(n).padStart(2, '0')}`,
          // Capacity is restricted to double or triple occupancy by the brief.
          capacity: rng() < 0.55 ? 2 : 3,
          occupiedBeds: 0,
        });
      }
    }
  }
  const roomRows = await db.insert(s.rooms).values(roomValues).returning();
  console.log(`[seed] ${hostelRows.length} hostels, ${roomRows.length} rooms`);

  /* ---------------- staff accounts, one per role ---------------- */

  const bsh = hostelByCode.get('BSH')!;
  const kch = hostelByCode.get('KCH')!;

  const staffSpec = [
    { email: 'admin@allocflow.edu', name: 'System Administrator', role: 'ADMIN' as const, designation: 'System Administrator', employeeCode: 'ADM-001', hostelId: null },
    { email: 'warden.bsh@allocflow.edu', name: 'Dr. Ramesh Iyer', role: 'WARDEN' as const, designation: 'Warden - BSH', employeeCode: 'WRD-001', hostelId: bsh.id },
    { email: 'warden.kch@allocflow.edu', name: 'Dr. Sunita Rao', role: 'WARDEN' as const, designation: 'Warden - KCH', employeeCode: 'WRD-002', hostelId: kch.id },
    { email: 'supervisor@allocflow.edu', name: 'Mahesh Kulkarni', role: 'SUPERVISOR' as const, designation: 'Hostel Supervisor', employeeCode: 'SUP-001', hostelId: null },
    { email: 'security@allocflow.edu', name: 'Jaswant Yadav', role: 'SECURITY' as const, designation: 'Security Officer - Main Gate', employeeCode: 'SEC-001', hostelId: null },
    { email: 'mess@allocflow.edu', name: 'Lakshmi Devi', role: 'MESS_STAFF' as const, designation: 'Mess Supervisor', employeeCode: 'MSS-001', hostelId: bsh.id },
  ];

  const staffUsers = await db
    .insert(s.users)
    .values(
      staffSpec.map((sp, i) => ({
        email: sp.email,
        passwordHash,
        name: sp.name,
        role: sp.role,
        contact: `98${String(10000000 + i * 7919).slice(0, 8)}`,
      })),
    )
    .returning();

  await db.insert(s.staff).values(
    staffUsers.map((u, i) => ({
      userId: u.id,
      designation: staffSpec[i].designation,
      employeeCode: staffSpec[i].employeeCode,
      assignedHostelId: staffSpec[i].hostelId,
    })),
  );

  const staffIdByEmail = new Map(staffUsers.map((u) => [u.email, u.id]));
  const adminId = staffIdByEmail.get('admin@allocflow.edu')!;
  const wardenBshId = staffIdByEmail.get('warden.bsh@allocflow.edu')!;
  const wardenKchId = staffIdByEmail.get('warden.kch@allocflow.edu')!;
  const messStaffId = staffIdByEmail.get('mess@allocflow.edu')!;

  /* ---------------- students ---------------- */

  const STUDENT_COUNT = 260;
  const studentUserValues: (typeof s.users.$inferInsert)[] = [];
  const usedEmails = new Set<string>();

  /*
   * Gender is decided per student before anything else, because it determines
   * both the name drawn and the pool of blocks the student can be placed in.
   * Kept in a parallel array indexed the same as `studentUserValues`, so the
   * two stay aligned through the insert below.
   */
  const studentGenders: s.StudentGender[] = [];

  // Two fixed demo logins - one in a men's block, one in a women's block - so
  // the segregation rule can be demonstrated from both sides.
  studentUserValues.push({
    email: 'student@allocflow.edu',
    passwordHash,
    name: 'Harshvardhan Singh',
    role: 'STUDENT',
    contact: '9800000001',
  });
  usedEmails.add('student@allocflow.edu');
  studentGenders.push('MALE');

  studentUserValues.push({
    email: 'student.f@allocflow.edu',
    passwordHash,
    name: 'Priya Nair',
    role: 'STUDENT',
    contact: '9800000002',
  });
  usedEmails.add('student.f@allocflow.edu');
  studentGenders.push('FEMALE');

  for (let i = 0; i < STUDENT_COUNT - 2; i++) {
    const gender: s.StudentGender = rng() < 0.5 ? 'MALE' : 'FEMALE';
    const first = pick(rng, gender === 'MALE' ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(rng, LAST);
    let email = `${first}.${last}${i}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@allocflow.edu';
    while (usedEmails.has(email)) email = `x${email}`;
    usedEmails.add(email);
    studentUserValues.push({
      email,
      passwordHash,
      name: `${first} ${last}`,
      role: 'STUDENT',
      contact: `9${String(700000000 + i * 13337).slice(0, 9)}`,
    });
    studentGenders.push(gender);
  }

  const studentUsers = await db.insert(s.users).values(studentUserValues).returning();

  /*
   * Allocate students across hostels, respecting the gender of each block, and
   * fill rooms to a realistic spread so the 3D colour coding shows all three
   * states: green (2+ free), yellow (exactly 1 free) and red (full).
   */
  const roomsByHostel = new Map<number, typeof roomRows>();
  for (const r of roomRows) {
    if (!roomsByHostel.has(r.hostelId)) roomsByHostel.set(r.hostelId, []);
    roomsByHostel.get(r.hostelId)!.push(r);
  }

  const maleHostels = hostelRows.filter((h) => h.gender === 'MALE');
  const femaleHostels = hostelRows.filter((h) => h.gender === 'FEMALE');

  // Track free beds per room as we allocate.
  const freeBeds = new Map<number, number[]>();
  for (const r of roomRows) {
    freeBeds.set(r.id, Array.from({ length: r.capacity }, (_, i) => i + 1));
  }

  const studentValues: (typeof s.students.$inferInsert)[] = [];
  const bookingValues: (typeof s.bookings.$inferInsert)[] = [];
  const roomOccupancy = new Map<number, number>();

  studentUsers.forEach((u, idx) => {
    /*
     * Students are only ever placed in a block their gender is admitted to -
     * the same rule the booking service enforces at runtime. The two demo
     * accounts are pinned to known blocks so the README can point at them:
     * idx 0 to BSH (a fourteen-storey men's tower) and idx 1 to KCH.
     */
    const gender = studentGenders[idx];
    const pool =
      idx === 0 ? [bsh] : idx === 1 ? [kch] : gender === 'FEMALE' ? femaleHostels : maleHostels;
    const hostel = pool[idx % pool.length];

    const candidates = roomsByHostel.get(hostel.id)!;
    // Prefer partially-filled rooms so occupancy clusters realistically.
    let chosen: (typeof roomRows)[number] | undefined;
    for (let attempt = 0; attempt < 40 && !chosen; attempt++) {
      const c = candidates[Math.floor(rng() * candidates.length)];
      if ((freeBeds.get(c.id)?.length ?? 0) > 0) chosen = c;
    }
    if (!chosen) chosen = candidates.find((c) => (freeBeds.get(c.id)?.length ?? 0) > 0);

    const rollNumber = `2${String(40000 + idx)}`;
    const base: typeof s.students.$inferInsert = {
      userId: u.id,
      rollNumber,
      course: pick(rng, COURSES),
      year: 1 + Math.floor(rng() * 4),
      gender,
      hostelId: hostel.id,
      currentRoomId: null,
      guardianContact: `9${String(600000000 + idx * 7717).slice(0, 9)}`,
    };

    // Leave roughly 12% of students unallocated so the booking flow is usable.
    if (chosen && rng() > 0.12) {
      const bed = freeBeds.get(chosen.id)!.shift()!;
      base.currentRoomId = chosen.id;
      roomOccupancy.set(chosen.id, (roomOccupancy.get(chosen.id) ?? 0) + 1);
      bookingValues.push({
        studentId: u.id,
        roomId: chosen.id,
        bedIndex: bed,
        status: 'ACTIVE',
        bookingDate: new Date(now.getTime() - Math.floor(rng() * 120) * 86_400_000),
      });
    }
    studentValues.push(base);
  });

  await db.insert(s.students).values(studentValues);
  await db.insert(s.bookings).values(bookingValues);

  // Reconcile the denormalised occupancy counter with the bookings just made.
  await db.execute(sql`
    update rooms set occupied_beds = coalesce((
      select count(*) from bookings
      where bookings.room_id = rooms.id and bookings.status = 'ACTIVE'
    ), 0)`);

  console.log(`[seed] ${studentUsers.length} students, ${bookingValues.length} active bookings`);

  const demoStudent = studentUsers[0];
  const demoRoomId = studentValues[0].currentRoomId!;

  /* ---------------- requests (housekeeping + repair) ---------------- */

  const allocated = studentValues.filter((sv) => sv.currentRoomId);
  const requestValues: (typeof s.requests.$inferInsert)[] = [];
  const HK_CATEGORIES = ['Room cleaning', 'Bathroom cleaning', 'Garbage pickup', 'Linen change'];
  const REPAIR_CATEGORIES = ['Electrical', 'Plumbing', 'Furniture', 'Internet', 'Carpentry'];
  const REQ_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'RESOLVED'] as const;

  for (let i = 0; i < 70; i++) {
    const sv = allocated[Math.floor(rng() * allocated.length)];
    const room = roomRows.find((r) => r.id === sv.currentRoomId)!;
    const isRepair = rng() < 0.45;
    const status = REQ_STATUSES[Math.floor(rng() * REQ_STATUSES.length)];
    const createdAt = new Date(now.getTime() - Math.floor(rng() * 20) * 86_400_000);
    const handler = room.hostelId === kch.id ? wardenKchId : wardenBshId;
    requestValues.push({
      studentId: sv.userId,
      roomId: room.id,
      hostelId: room.hostelId,
      type: isRepair ? 'REPAIR' : 'HOUSEKEEPING',
      category: isRepair ? pick(rng, REPAIR_CATEGORIES) : pick(rng, HK_CATEGORIES),
      note: isRepair ? 'Reported via the student app.' : 'Requested via the Notify button.',
      status,
      priority: isRepair && rng() < 0.3 ? 'HIGH' : 'NORMAL',
      handledBy: status === 'PENDING' ? null : handler,
      resolutionNote: status === 'RESOLVED' ? 'Attended and closed by hostel staff.' : null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: status === 'RESOLVED' ? new Date(createdAt.getTime() + 86_400_000) : null,
    });
  }
  // Guarantee the demo student has one of each, in a known state.
  requestValues.push({
    studentId: demoStudent.id, roomId: demoRoomId, hostelId: bsh.id,
    type: 'HOUSEKEEPING', category: 'Room cleaning',
    note: 'Requested via the Notify button.', status: 'PENDING', priority: 'NORMAL',
    createdAt: new Date(now.getTime() - 3_600_000), updatedAt: new Date(now.getTime() - 3_600_000),
  });
  requestValues.push({
    studentId: demoStudent.id, roomId: demoRoomId, hostelId: bsh.id,
    type: 'REPAIR', category: 'Electrical',
    note: 'Ceiling fan making noise at high speed.', status: 'IN_PROGRESS', priority: 'HIGH',
    handledBy: wardenBshId,
    createdAt: new Date(now.getTime() - 2 * 86_400_000), updatedAt: new Date(now.getTime() - 86_400_000),
  });
  await db.insert(s.requests).values(requestValues);

  /* ---------------- gatepasses ---------------- */

  const gatepassValues: (typeof s.gatepasses.$inferInsert)[] = [];
  const REASONS = ['Home visit', 'Medical appointment', 'Family function', 'Internship interview', 'Local market'];
  let refCounter = 1;
  const makeRef = () => `GP-${String(now.getFullYear())}-${String(refCounter++).padStart(5, '0')}`;

  for (let i = 0; i < 45; i++) {
    const sv = allocated[Math.floor(rng() * allocated.length)];
    const room = roomRows.find((r) => r.id === sv.currentRoomId)!;
    const offsetDays = Math.floor(rng() * 14) - 7;
    const from = new Date(now.getTime() + offsetDays * 86_400_000);
    from.setHours(8 + Math.floor(rng() * 8), 0, 0, 0);
    const to = new Date(from.getTime() + (4 + Math.floor(rng() * 20)) * 3_600_000);
    const roll = rng();
    const status = roll < 0.25 ? 'PENDING' : roll < 0.7 ? 'APPROVED' : roll < 0.8 ? 'REJECTED' : roll < 0.9 ? 'CHECKED_OUT' : 'CHECKED_IN';
    const approver = room.hostelId === kch.id ? wardenKchId : wardenBshId;
    gatepassValues.push({
      studentId: sv.userId,
      reference: makeRef(),
      reason: pick(rng, REASONS),
      destination: pick(rng, ['Home town', 'City hospital', 'Campus outskirts', 'Railway station']),
      fromTime: from,
      toTime: to,
      status,
      approvedBy: status === 'PENDING' ? null : approver,
      decidedAt: status === 'PENDING' ? null : new Date(from.getTime() - 3_600_000),
      decisionNote: status === 'REJECTED' ? 'Clashes with internal examinations.' : null,
      checkedOutAt: status === 'CHECKED_OUT' || status === 'CHECKED_IN' ? from : null,
      checkedInAt: status === 'CHECKED_IN' ? to : null,
      createdAt: new Date(from.getTime() - 2 * 86_400_000),
    });
  }
  // A live, approved pass for the demo student so security verification is demoable.
  const gpFrom = new Date(now.getTime() - 3_600_000);
  gatepassValues.push({
    studentId: demoStudent.id,
    reference: 'GP-DEMO-00001',
    reason: 'Medical appointment at city hospital',
    destination: 'City hospital',
    fromTime: gpFrom,
    toTime: new Date(now.getTime() + 8 * 3_600_000),
    status: 'APPROVED',
    approvedBy: wardenBshId,
    decidedAt: new Date(now.getTime() - 7_200_000),
    createdAt: new Date(now.getTime() - 86_400_000),
  });
  await db.insert(s.gatepasses).values(gatepassValues);

  /* ---------------- announcements ---------------- */

  await db.insert(s.announcements).values([
    { title: 'Water supply maintenance on Sunday', body: 'Water supply will be interrupted between 10:00 and 14:00 on Sunday for overhead tank cleaning. Please store water in advance.', category: 'MAINTENANCE', postedBy: wardenBshId, hostelId: bsh.id, isPinned: true, createdAt: new Date(now.getTime() - 2 * 86_400_000) },
    { title: 'Hostel night curfew revised to 23:00', body: 'Effective immediately, the hostel entry curfew is 23:00 on weekdays and 23:30 on weekends. Gatepasses are mandatory beyond these hours.', category: 'GENERAL', postedBy: adminId, hostelId: null, isPinned: true, createdAt: new Date(now.getTime() - 5 * 86_400_000) },
    { title: 'Mess menu refreshed for this month', body: 'The mess committee has revised the weekly menu based on last month feedback. Millet-based breakfast has been added on Tuesdays and Thursdays.', category: 'MESS', postedBy: messStaffId, hostelId: null, createdAt: new Date(now.getTime() - 86_400_000) },
    { title: 'Fire safety drill on Friday 16:00', body: 'A mandatory fire safety drill will be conducted on Friday at 16:00. All residents must assemble at the main quadrangle when the alarm sounds.', category: 'EMERGENCY', postedBy: adminId, hostelId: null, createdAt: new Date(now.getTime() - 6 * 3_600_000) },
    { title: 'Inter-hostel sports meet registrations open', body: 'Registrations for the annual inter-hostel sports meet close this Friday. Register with your floor representative.', category: 'EVENT', postedBy: wardenKchId, hostelId: null, createdAt: new Date(now.getTime() - 3 * 86_400_000) },
    { title: 'Room inspection scheduled for floors 1 to 5', body: 'A routine room inspection will be conducted across floors 1 to 5 next Monday morning. Please keep your rooms accessible.', category: 'GENERAL', postedBy: wardenBshId, hostelId: bsh.id, createdAt: new Date(now.getTime() - 12 * 3_600_000) },
  ]);

  /* ---------------- electricity bills ---------------- */

  const occupiedRooms = roomRows.filter((r) => (roomOccupancy.get(r.id) ?? 0) > 0);
  const billValues: (typeof s.electricityBills.$inferInsert)[] = [];
  for (let monthsBack = 3; monthsBack >= 1; monthsBack--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const due = new Date(d.getFullYear(), d.getMonth() + 1, 10);
    for (const room of occupiedRooms) {
      const occupants = roomOccupancy.get(room.id) ?? 0;
      const units = 40 + occupants * 28 + Math.floor(rng() * 45);
      const rate = 8.5;
      billValues.push({
        roomId: room.id,
        period,
        unitsConsumed: units.toFixed(2),
        ratePerUnit: rate.toFixed(2),
        amount: (units * rate).toFixed(2),
        dueDate: due.toISOString().slice(0, 10),
        isPaid: monthsBack > 1 ? true : rng() < 0.55,
        generatedBy: adminId,
      });
    }
  }
  // Insert in chunks — a single statement with thousands of rows can exceed
  // the driver's parameter limit.
  for (let i = 0; i < billValues.length; i += 500) {
    await db.insert(s.electricityBills).values(billValues.slice(i, i + 500));
  }
  console.log(`[seed] ${billValues.length} electricity bills`);

  /* ---------------- mess menu + feedback ---------------- */

  const MENU: Record<string, string[]> = {
    BREAKFAST: ['Poha, boiled eggs, banana, tea/coffee', 'Idli, sambar, coconut chutney, filter coffee', 'Aloo paratha, curd, pickle, tea', 'Millet upma, chutney, sprouts, milk', 'Bread butter jam, omelette, cornflakes', 'Masala dosa, sambar, chutney, tea', 'Chole bhature, lassi'],
    LUNCH: ['Rajma chawal, roti, salad, curd', 'Sambar rice, poriyal, appalam, buttermilk', 'Dal fry, jeera rice, mix veg, roti', 'Kadhi pakora, rice, roti, salad', 'Chicken curry / paneer butter masala, rice, roti', 'Veg pulao, raita, dal tadka', 'Special thali with sweet'],
    SNACKS: ['Samosa, tea', 'Bread pakora, coffee', 'Vada pav, tea', 'Biscuits, milk', 'Sandwich, cold coffee', 'Bhel puri, tea', 'Pastry, juice'],
    DINNER: ['Roti, dal makhani, aloo gobi, rice', 'Roti, paneer bhurji, rice, dal', 'Fried rice, manchurian, soup', 'Roti, egg curry / soya curry, rice', 'Khichdi, papad, curd, pickle', 'Roti, chana masala, rice, halwa', 'Dosa, sambar, chutney'],
  };
  const TIMES: Record<string, string> = { BREAKFAST: '07:30 - 09:30', LUNCH: '12:30 - 14:30', SNACKS: '17:00 - 18:00', DINNER: '19:30 - 21:30' };

  const menuValues: (typeof s.messMenus.$inferInsert)[] = [];
  for (const hostel of hostelRows) {
    for (let day = 0; day < 7; day++) {
      for (const meal of s.MESS_MEALS) {
        menuValues.push({
          hostelId: hostel.id,
          dayOfWeek: day,
          meal,
          items: MENU[meal][day],
          servingTime: TIMES[meal],
          updatedBy: messStaffId,
        });
      }
    }
  }
  await db.insert(s.messMenus).values(menuValues);

  const feedbackValues: (typeof s.messFeedback.$inferInsert)[] = [];
  for (let i = 0; i < 90; i++) {
    const sv = allocated[Math.floor(rng() * allocated.length)];
    const servedOn = new Date(now.getTime() - Math.floor(rng() * 14) * 86_400_000);
    feedbackValues.push({
      studentId: sv.userId,
      hostelId: sv.hostelId!,
      meal: pick(rng, s.MESS_MEALS),
      servedOn: servedOn.toISOString().slice(0, 10),
      rating: 1 + Math.floor(rng() * 5),
      comment: rng() < 0.4 ? pick(rng, ['Tasty and well cooked.', 'Quantity was insufficient.', 'Food was served cold.', 'Good variety this week.', 'Please reduce the spice level.']) : null,
    });
  }
  await db.insert(s.messFeedback).values(feedbackValues);

  /* ---------------- warden raids ---------------- */

  await db.insert(s.raids).values([
    { hostelId: bsh.id, floor: 3, scheduledFor: new Date(now.getTime() + 2 * 86_400_000), purpose: 'Routine discipline and cleanliness inspection', status: 'SCHEDULED', conductedBy: wardenBshId },
    { hostelId: bsh.id, floor: null, scheduledFor: new Date(now.getTime() + 6 * 86_400_000), purpose: 'Fire safety equipment check across all floors', status: 'SCHEDULED', conductedBy: wardenBshId },
    { hostelId: bsh.id, floor: 7, scheduledFor: new Date(now.getTime() - 4 * 86_400_000), purpose: 'Prohibited appliance check', status: 'COMPLETED', conductedBy: wardenBshId, findings: 'Two immersion heaters confiscated on floor 7. Warnings issued; no further action required.', completedAt: new Date(now.getTime() - 4 * 86_400_000 + 5_400_000) },
    { hostelId: kch.id, floor: 2, scheduledFor: new Date(now.getTime() + 86_400_000), purpose: 'Surprise night attendance check', status: 'SCHEDULED', conductedBy: wardenKchId },
    { hostelId: kch.id, floor: 5, scheduledFor: new Date(now.getTime() - 9 * 86_400_000), purpose: 'Cleanliness audit ahead of parents visit', status: 'COMPLETED', conductedBy: wardenKchId, findings: 'Floor 5 in good order. Two rooms advised to clear balcony clutter.', completedAt: new Date(now.getTime() - 9 * 86_400_000 + 3_600_000) },
  ]);

  /* ---------------- notifications for the demo student ---------------- */

  await db.insert(s.notifications).values([
    { userId: demoStudent.id, title: 'Gatepass approved', body: 'Your gatepass GP-DEMO-00001 for a medical appointment has been approved by the warden.', link: '/gatepass', createdAt: new Date(now.getTime() - 7_200_000) },
    { userId: demoStudent.id, title: 'Repair request in progress', body: 'Your electrical repair request has been picked up by hostel staff.', link: '/requests', createdAt: new Date(now.getTime() - 86_400_000) },
    { userId: demoStudent.id, title: 'New announcement', body: 'Fire safety drill on Friday 16:00 - attendance is mandatory.', link: '/announcements', createdAt: new Date(now.getTime() - 6 * 3_600_000) },
    { userId: wardenBshId, title: 'New housekeeping request', body: 'A room cleaning request was raised in BSH and is awaiting assignment.', link: '/staff/requests', createdAt: new Date(now.getTime() - 3_600_000) },
  ]);

  console.log('[seed] complete');
  console.log('[seed] login with student@allocflow.edu (male, BSH) / student.f@allocflow.edu (female, KCH)');
  console.log('[seed] staff: warden.bsh@allocflow.edu / warden.kch@allocflow.edu / security@allocflow.edu ... password: Password@123');
}

async function main() {
  const env = loadEnv();
  const handle = await createDatabase(env.DATABASE_URL);
  await runMigrations(handle);
  await seed(handle.db, { force: process.env.SEED_FORCE === 'true' });
  await handle.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
