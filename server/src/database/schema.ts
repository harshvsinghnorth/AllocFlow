/**
 * AllocFlow relational schema.
 *
 * Implements the E-R model defined in Hostel_SRS_v1_new.docx section 3.4 (Figure 1):
 *
 *   USER  --is-a-->  STUDENT, STAFF          (supertype / subtype)
 *   STUDENT 1--M BOOKING M--1 ROOM           (a student books a bed in a room)
 *   STUDENT 1--M GATEPASS  (approved by 1 STAFF)
 *   STUDENT 1--M REQUEST   (handled  by 1 STAFF)
 *   STAFF   1--M ANNOUNCEMENT
 *   STAFF   1--M ROOM      (supervises, via assigned hostel block)
 *
 * Extension-phase entities (SRS 2.5) - mess, repair/complaint and warden raids -
 * are modelled alongside the core set. REQUEST carries both Housekeeping and
 * Repair types exactly as the E-R diagram specifies.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/* Enumerated domains                                                  */
/* ------------------------------------------------------------------ */
/*
 * Modelled as varchar + CHECK constraints rather than native PG enum types:
 * adding a value to a native enum requires a migration that cannot run inside
 * a transaction, whereas a CHECK constraint is trivially alterable. The union
 * types below keep the application layer just as type-safe.
 */

export const USER_ROLES = [
  'STUDENT',
  'WARDEN',
  'SUPERVISOR',
  'SECURITY',
  'MESS_STAFF',
  'ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** SRS constraint: room capacities are restricted to double or triple occupancy. */
export const ROOM_CAPACITIES = [2, 3] as const;
export type RoomCapacity = (typeof ROOM_CAPACITIES)[number];

export const BOOKING_STATUSES = ['ACTIVE', 'VACATED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const REQUEST_TYPES = ['HOUSEKEEPING', 'REPAIR'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const GATEPASS_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CHECKED_OUT',
  'CHECKED_IN',
  'EXPIRED',
] as const;
export type GatepassStatus = (typeof GATEPASS_STATUSES)[number];

export const ANNOUNCEMENT_CATEGORIES = [
  'GENERAL',
  'MAINTENANCE',
  'MESS',
  'EMERGENCY',
  'EVENT',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const RAID_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type RaidStatus = (typeof RAID_STATUSES)[number];

export const MESS_MEALS = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'] as const;
export type MessMeal = (typeof MESS_MEALS)[number];

/**
 * Whom a block accommodates. CO_ED is carried by the domain but unused by the
 * current campus; it exists so a mixed block can be added without a migration.
 */
export const HOSTEL_GENDERS = ['MALE', 'FEMALE', 'CO_ED'] as const;
export type HostelGender = (typeof HOSTEL_GENDERS)[number];

/**
 * A student's gender, which decides the blocks they may be allocated into.
 * Held on STUDENT rather than on the USER supertype: it participates only in
 * the allocation rule, and staff accounts have no reason to carry it.
 */
export const STUDENT_GENDERS = ['MALE', 'FEMALE'] as const;
export type StudentGender = (typeof STUDENT_GENDERS)[number];

/** Renders `col in ('A', 'B')` for a CHECK constraint over a string domain. */
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`);

/* ------------------------------------------------------------------ */
/* HOSTEL - drives the procedurally generated 3D model                 */
/* ------------------------------------------------------------------ */

export const hostels = pgTable(
  'hostels',
  {
    id: serial('id').primaryKey(),
    /** Short block code shown in the hostel selector, e.g. BSH, KCH, APJ. */
    code: varchar('code', { length: 12 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Number of floors - the 3D model is generated and scaled from this. */
    floors: integer('floors').notNull(),
    /** Rooms per floor - the second driver of the generated geometry. */
    roomsPerFloor: integer('rooms_per_floor').notNull(),
    gender: varchar('gender', { length: 10 }).notNull().default('MALE'),
    /** Accent colour used by the 3D scene and hostel selector chips. */
    accentColor: varchar('accent_color', { length: 9 }).notNull().default('#38bdf8'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex('hostels_code_unique').on(t.code),
    floorsValid: check('hostels_floors_valid', sql`${t.floors} between 1 and 40`),
    roomsValid: check('hostels_rooms_valid', sql`${t.roomsPerFloor} between 1 and 40`),
    genderValid: check('hostels_gender_valid', oneOf('gender', HOSTEL_GENDERS)),
  }),
);

/* ------------------------------------------------------------------ */
/* USER - supertype (SRS E-R: UserID, Name, Role, Contact)             */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 160 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    contact: varchar('contact', { length: 20 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    roleIdx: index('users_role_idx').on(t.role),
    roleValid: check('users_role_valid', oneOf('role', USER_ROLES)),
  }),
);

/* ------------------------------------------------------------------ */
/* STUDENT - is-a USER (Course/Year, Current Room)                     */
/* ------------------------------------------------------------------ */

export const students = pgTable(
  'students',
  {
    /** PK == FK to users.id: enforces the is-a relationship one-to-one. */
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    rollNumber: varchar('roll_number', { length: 24 }).notNull(),
    course: varchar('course', { length: 60 }).notNull(),
    year: integer('year').notNull(),
    /** Decides which blocks this student may be allocated into. */
    gender: varchar('gender', { length: 10 }).notNull(),
    /** Denormalised pointer to the room of the student's ACTIVE booking. */
    currentRoomId: integer('current_room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    hostelId: integer('hostel_id').references(() => hostels.id, { onDelete: 'set null' }),
    guardianContact: varchar('guardian_contact', { length: 20 }),
  },
  (t) => ({
    rollUnique: uniqueIndex('students_roll_unique').on(t.rollNumber),
    hostelIdx: index('students_hostel_idx').on(t.hostelId),
    yearValid: check('students_year_valid', sql`${t.year} between 1 and 6`),
    genderValid: check('students_gender_valid', oneOf('gender', STUDENT_GENDERS)),
  }),
);

/* ------------------------------------------------------------------ */
/* STAFF - is-a USER (Designation, Assigned Block)                     */
/* ------------------------------------------------------------------ */

export const staff = pgTable(
  'staff',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    designation: varchar('designation', { length: 60 }).notNull(),
    employeeCode: varchar('employee_code', { length: 24 }).notNull(),
    /** The hostel block this staff member supervises (E-R: "supervises" 1..M). */
    assignedHostelId: integer('assigned_hostel_id').references(() => hostels.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    empUnique: uniqueIndex('staff_employee_code_unique').on(t.employeeCode),
    hostelIdx: index('staff_hostel_idx').on(t.assignedHostelId),
  }),
);

/* ------------------------------------------------------------------ */
/* ROOM - Block/Floor, Capacity, Occupancy Status                      */
/* ------------------------------------------------------------------ */

export const rooms = pgTable(
  'rooms',
  {
    id: serial('id').primaryKey(),
    hostelId: integer('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    floor: integer('floor').notNull(),
    roomNumber: varchar('room_number', { length: 12 }).notNull(),
    /** Restricted to 2 (double) or 3 (triple) by CHECK constraint per the brief. */
    capacity: integer('capacity').notNull(),
    /**
     * Maintained transactionally alongside bookings so availability lookups are a
     * single indexed read rather than an aggregate over the bookings table.
     * This is what keeps the 3-second NFR1 budget comfortable at scale.
     */
    occupiedBeds: integer('occupied_beds').notNull().default(0),
    isBlocked: boolean('is_blocked').notNull().default(false),
    notes: text('notes'),
  },
  (t) => ({
    roomUnique: uniqueIndex('rooms_hostel_number_unique').on(t.hostelId, t.roomNumber),
    floorIdx: index('rooms_hostel_floor_idx').on(t.hostelId, t.floor),
    capacityValid: check('rooms_capacity_valid', sql`${t.capacity} in (2, 3)`),
    occupancyValid: check(
      'rooms_occupancy_valid',
      sql`${t.occupiedBeds} >= 0 and ${t.occupiedBeds} <= ${t.capacity}`,
    ),
  }),
);

/* ------------------------------------------------------------------ */
/* BOOKING - STUDENT M--1 ROOM                                         */
/* ------------------------------------------------------------------ */

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    /** 1-based bed index within the room; unique among ACTIVE bookings. */
    bedIndex: integer('bed_index').notNull(),
    bookingDate: timestamp('booking_date', { withTimezone: true }).notNull().defaultNow(),
    vacatedAt: timestamp('vacated_at', { withTimezone: true }),
    status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
  },
  (t) => ({
    roomIdx: index('bookings_room_idx').on(t.roomId),
    studentIdx: index('bookings_student_idx').on(t.studentId),
    /*
     * The two partial unique indexes below are the real concurrency guard for
     * the booking flow. Availability is re-checked inside the transaction, but
     * under simultaneous requests for the last bed only a uniqueness violation
     * raised by the database can reliably reject the loser. Both are scoped to
     * ACTIVE rows so a vacated bed becomes bookable again.
     */
    activeBedUnique: uniqueIndex('bookings_active_bed_unique')
      .on(t.roomId, t.bedIndex)
      .where(sql`status = 'ACTIVE'`),
    activeStudentUnique: uniqueIndex('bookings_active_student_unique')
      .on(t.studentId)
      .where(sql`status = 'ACTIVE'`),
    statusValid: check('bookings_status_valid', oneOf('status', BOOKING_STATUSES)),
    bedValid: check('bookings_bed_valid', sql`${t.bedIndex} >= 1`),
  }),
);

/* ------------------------------------------------------------------ */
/* REQUEST - Housekeeping / Repair, raised by STUDENT, handled by STAFF*/
/* ------------------------------------------------------------------ */

export const requests = pgTable(
  'requests',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    hostelId: integer('hostel_id').references(() => hostels.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 16 }).notNull(),
    category: varchar('category', { length: 40 }),
    note: text('note'),
    status: varchar('status', { length: 16 }).notNull().default('PENDING'),
    priority: varchar('priority', { length: 10 }).notNull().default('NORMAL'),
    handledBy: integer('handled_by').references(() => staff.userId, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('requests_status_idx').on(t.status),
    hostelIdx: index('requests_hostel_idx').on(t.hostelId, t.status),
    studentIdx: index('requests_student_idx').on(t.studentId),
    typeValid: check('requests_type_valid', oneOf('type', REQUEST_TYPES)),
    statusValid: check('requests_status_valid', oneOf('status', REQUEST_STATUSES)),
    priorityValid: check('requests_priority_valid', oneOf('priority', REQUEST_PRIORITIES)),
  }),
);

/* ------------------------------------------------------------------ */
/* GATEPASS - requested by STUDENT, approved by STAFF, verified at gate*/
/* ------------------------------------------------------------------ */

export const gatepasses = pgTable(
  'gatepasses',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    /** Human-verifiable reference encoded into the QR shown to security. */
    reference: varchar('reference', { length: 24 }).notNull(),
    reason: text('reason').notNull(),
    destination: varchar('destination', { length: 160 }),
    fromTime: timestamp('from_time', { withTimezone: true }).notNull(),
    toTime: timestamp('to_time', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('PENDING'),
    approvedBy: integer('approved_by').references(() => staff.userId, { onDelete: 'set null' }),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    verifiedBy: integer('verified_by').references(() => staff.userId, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUnique: uniqueIndex('gatepasses_reference_unique').on(t.reference),
    statusIdx: index('gatepasses_status_idx').on(t.status),
    studentIdx: index('gatepasses_student_idx').on(t.studentId),
    statusValid: check('gatepasses_status_valid', oneOf('status', GATEPASS_STATUSES)),
    windowValid: check('gatepasses_window_valid', sql`${t.toTime} > ${t.fromTime}`),
  }),
);

/* ------------------------------------------------------------------ */
/* ANNOUNCEMENT - posted by STAFF, visible to all students             */
/* ------------------------------------------------------------------ */

export const announcements = pgTable(
  'announcements',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    category: varchar('category', { length: 16 }).notNull().default('GENERAL'),
    postedBy: integer('posted_by')
      .notNull()
      .references(() => staff.userId, { onDelete: 'cascade' }),
    /** NULL = broadcast to every hostel; otherwise scoped to one block. */
    hostelId: integer('hostel_id').references(() => hostels.id, { onDelete: 'cascade' }),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('announcements_created_idx').on(t.createdAt),
    categoryValid: check('announcements_category_valid', oneOf('category', ANNOUNCEMENT_CATEGORIES)),
  }),
);

/** Per-student read receipts - the "read/unread status" noted as optional in SRS 3.2.4. */
export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcementId: integer('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.announcementId, t.studentId] }) }),
);

/* ------------------------------------------------------------------ */
/* ELECTRICITY BILL - per room, per billing period                     */
/* ------------------------------------------------------------------ */

export const electricityBills = pgTable(
  'electricity_bills',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** Billing period as YYYY-MM. */
    period: varchar('period', { length: 7 }).notNull(),
    unitsConsumed: numeric('units_consumed', { precision: 10, scale: 2 }).notNull(),
    ratePerUnit: numeric('rate_per_unit', { precision: 10, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    dueDate: date('due_date').notNull(),
    isPaid: boolean('is_paid').notNull().default(false),
    generatedBy: integer('generated_by').references(() => staff.userId, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    periodUnique: uniqueIndex('electricity_room_period_unique').on(t.roomId, t.period),
    roomIdx: index('electricity_room_idx').on(t.roomId),
  }),
);

/* ------------------------------------------------------------------ */
/* MESS (extension phase) - menu + student feedback                    */
/* ------------------------------------------------------------------ */

export const messMenus = pgTable(
  'mess_menus',
  {
    id: serial('id').primaryKey(),
    hostelId: integer('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    /** 0 = Sunday ... 6 = Saturday. */
    dayOfWeek: integer('day_of_week').notNull(),
    meal: varchar('meal', { length: 12 }).notNull(),
    items: text('items').notNull(),
    servingTime: varchar('serving_time', { length: 40 }),
    updatedBy: integer('updated_by').references(() => staff.userId, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slotUnique: uniqueIndex('mess_menu_slot_unique').on(t.hostelId, t.dayOfWeek, t.meal),
    dayValid: check('mess_menu_day_valid', sql`${t.dayOfWeek} between 0 and 6`),
    mealValid: check('mess_menu_meal_valid', oneOf('meal', MESS_MEALS)),
  }),
);

export const messFeedback = pgTable(
  'mess_feedback',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    hostelId: integer('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    meal: varchar('meal', { length: 12 }).notNull(),
    servedOn: date('served_on').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hostelIdx: index('mess_feedback_hostel_idx').on(t.hostelId, t.servedOn),
    ratingValid: check('mess_feedback_rating_valid', sql`${t.rating} between 1 and 5`),
    mealValid: check('mess_feedback_meal_valid', oneOf('meal', MESS_MEALS)),
  }),
);

/* ------------------------------------------------------------------ */
/* WARDEN RAIDS (extension phase) - scheduled room inspections         */
/* ------------------------------------------------------------------ */

export const raids = pgTable(
  'raids',
  {
    id: serial('id').primaryKey(),
    hostelId: integer('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    /** NULL floor = whole-block inspection. */
    floor: integer('floor'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    purpose: varchar('purpose', { length: 160 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('SCHEDULED'),
    conductedBy: integer('conducted_by')
      .notNull()
      .references(() => staff.userId, { onDelete: 'cascade' }),
    findings: text('findings'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hostelIdx: index('raids_hostel_idx').on(t.hostelId, t.scheduledFor),
    statusValid: check('raids_status_valid', oneOf('status', RAID_STATUSES)),
  }),
);

/* ------------------------------------------------------------------ */
/* NOTIFICATION - in-app alerts (SRS 3.1)                              */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    /** Deep-link path the client navigates to when the alert is opened. */
    link: varchar('link', { length: 200 }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId, t.isRead),
  }),
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ one, many }) => ({
  student: one(students, { fields: [users.id], references: [students.userId] }),
  staff: one(staff, { fields: [users.id], references: [staff.userId] }),
  notifications: many(notifications),
}));

export const hostelsRelations = relations(hostels, ({ many }) => ({
  rooms: many(rooms),
  staff: many(staff),
  students: many(students),
  announcements: many(announcements),
  messMenus: many(messMenus),
  raids: many(raids),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] }),
  hostel: one(hostels, { fields: [students.hostelId], references: [hostels.id] }),
  currentRoom: one(rooms, { fields: [students.currentRoomId], references: [rooms.id] }),
  bookings: many(bookings),
  requests: many(requests),
  gatepasses: many(gatepasses),
  messFeedback: many(messFeedback),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  user: one(users, { fields: [staff.userId], references: [users.id] }),
  assignedHostel: one(hostels, { fields: [staff.assignedHostelId], references: [hostels.id] }),
  announcements: many(announcements),
  raids: many(raids),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  hostel: one(hostels, { fields: [rooms.hostelId], references: [hostels.id] }),
  bookings: many(bookings),
  bills: many(electricityBills),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  student: one(students, { fields: [bookings.studentId], references: [students.userId] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  student: one(students, { fields: [requests.studentId], references: [students.userId] }),
  room: one(rooms, { fields: [requests.roomId], references: [rooms.id] }),
  hostel: one(hostels, { fields: [requests.hostelId], references: [hostels.id] }),
  handler: one(staff, { fields: [requests.handledBy], references: [staff.userId] }),
}));

export const gatepassesRelations = relations(gatepasses, ({ one }) => ({
  student: one(students, { fields: [gatepasses.studentId], references: [students.userId] }),
  approver: one(staff, { fields: [gatepasses.approvedBy], references: [staff.userId] }),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  author: one(staff, { fields: [announcements.postedBy], references: [staff.userId] }),
  hostel: one(hostels, { fields: [announcements.hostelId], references: [hostels.id] }),
  reads: many(announcementReads),
}));

export const electricityBillsRelations = relations(electricityBills, ({ one }) => ({
  room: one(rooms, { fields: [electricityBills.roomId], references: [rooms.id] }),
}));

export const raidsRelations = relations(raids, ({ one }) => ({
  hostel: one(hostels, { fields: [raids.hostelId], references: [hostels.id] }),
  conductor: one(staff, { fields: [raids.conductedBy], references: [staff.userId] }),
}));

export const messFeedbackRelations = relations(messFeedback, ({ one }) => ({
  student: one(students, { fields: [messFeedback.studentId], references: [students.userId] }),
  hostel: one(hostels, { fields: [messFeedback.hostelId], references: [hostels.id] }),
}));

export const messMenusRelations = relations(messMenus, ({ one }) => ({
  hostel: one(hostels, { fields: [messMenus.hostelId], references: [hostels.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
