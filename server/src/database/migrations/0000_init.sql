CREATE TABLE "announcement_reads" (
	"announcement_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_reads_announcement_id_student_id_pk" PRIMARY KEY("announcement_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"category" varchar(16) DEFAULT 'GENERAL' NOT NULL,
	"posted_by" integer NOT NULL,
	"hostel_id" integer,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_category_valid" CHECK (category in ('GENERAL', 'MAINTENANCE', 'MESS', 'EMERGENCY', 'EVENT'))
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"bed_index" integer NOT NULL,
	"booking_date" timestamp with time zone DEFAULT now() NOT NULL,
	"vacated_at" timestamp with time zone,
	"status" varchar(12) DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "bookings_status_valid" CHECK (status in ('ACTIVE', 'VACATED', 'CANCELLED')),
	CONSTRAINT "bookings_bed_valid" CHECK ("bookings"."bed_index" >= 1)
);
--> statement-breakpoint
CREATE TABLE "electricity_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"units_consumed" numeric(10, 2) NOT NULL,
	"rate_per_unit" numeric(10, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_date" date NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"generated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gatepasses" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"reference" varchar(24) NOT NULL,
	"reason" text NOT NULL,
	"destination" varchar(160),
	"from_time" timestamp with time zone NOT NULL,
	"to_time" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"approved_by" integer,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"verified_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gatepasses_status_valid" CHECK (status in ('PENDING', 'APPROVED', 'REJECTED', 'CHECKED_OUT', 'CHECKED_IN', 'EXPIRED')),
	CONSTRAINT "gatepasses_window_valid" CHECK ("gatepasses"."to_time" > "gatepasses"."from_time")
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(120) NOT NULL,
	"floors" integer NOT NULL,
	"rooms_per_floor" integer NOT NULL,
	"gender" varchar(10) DEFAULT 'MALE' NOT NULL,
	"accent_color" varchar(9) DEFAULT '#38bdf8' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostels_floors_valid" CHECK ("hostels"."floors" between 1 and 40),
	CONSTRAINT "hostels_rooms_valid" CHECK ("hostels"."rooms_per_floor" between 1 and 40),
	CONSTRAINT "hostels_gender_valid" CHECK (gender in ('MALE', 'FEMALE', 'CO_ED'))
);
--> statement-breakpoint
CREATE TABLE "mess_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"hostel_id" integer NOT NULL,
	"meal" varchar(12) NOT NULL,
	"served_on" date NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mess_feedback_rating_valid" CHECK ("mess_feedback"."rating" between 1 and 5),
	CONSTRAINT "mess_feedback_meal_valid" CHECK (meal in ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'))
);
--> statement-breakpoint
CREATE TABLE "mess_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"hostel_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"meal" varchar(12) NOT NULL,
	"items" text NOT NULL,
	"serving_time" varchar(40),
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mess_menu_day_valid" CHECK ("mess_menus"."day_of_week" between 0 and 6),
	CONSTRAINT "mess_menu_meal_valid" CHECK (meal in ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"link" varchar(200),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" serial PRIMARY KEY NOT NULL,
	"hostel_id" integer NOT NULL,
	"floor" integer,
	"scheduled_for" timestamp with time zone NOT NULL,
	"purpose" varchar(160) NOT NULL,
	"status" varchar(12) DEFAULT 'SCHEDULED' NOT NULL,
	"conducted_by" integer NOT NULL,
	"findings" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raids_status_valid" CHECK (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"room_id" integer,
	"hostel_id" integer,
	"type" varchar(16) NOT NULL,
	"category" varchar(40),
	"note" text,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"priority" varchar(10) DEFAULT 'NORMAL' NOT NULL,
	"handled_by" integer,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "requests_type_valid" CHECK (type in ('HOUSEKEEPING', 'REPAIR')),
	CONSTRAINT "requests_status_valid" CHECK (status in ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED')),
	CONSTRAINT "requests_priority_valid" CHECK (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"hostel_id" integer NOT NULL,
	"floor" integer NOT NULL,
	"room_number" varchar(12) NOT NULL,
	"capacity" integer NOT NULL,
	"occupied_beds" integer DEFAULT 0 NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "rooms_capacity_valid" CHECK ("rooms"."capacity" in (2, 3)),
	CONSTRAINT "rooms_occupancy_valid" CHECK ("rooms"."occupied_beds" >= 0 and "rooms"."occupied_beds" <= "rooms"."capacity")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"designation" varchar(60) NOT NULL,
	"employee_code" varchar(24) NOT NULL,
	"assigned_hostel_id" integer
);
--> statement-breakpoint
CREATE TABLE "students" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"roll_number" varchar(24) NOT NULL,
	"course" varchar(60) NOT NULL,
	"year" integer NOT NULL,
	"current_room_id" integer,
	"hostel_id" integer,
	"guardian_contact" varchar(20),
	CONSTRAINT "students_year_valid" CHECK ("students"."year" between 1 and 6)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(160) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"role" varchar(20) NOT NULL,
	"contact" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_valid" CHECK (role in ('STUDENT', 'WARDEN', 'SUPERVISOR', 'SECURITY', 'MESS_STAFF', 'ADMIN'))
);
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_posted_by_staff_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_generated_by_staff_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_approved_by_staff_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_verified_by_staff_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_feedback" ADD CONSTRAINT "mess_feedback_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_feedback" ADD CONSTRAINT "mess_feedback_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_menus" ADD CONSTRAINT "mess_menus_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_menus" ADD CONSTRAINT "mess_menus_updated_by_staff_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_conducted_by_staff_user_id_fk" FOREIGN KEY ("conducted_by") REFERENCES "public"."staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_handled_by_staff_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_assigned_hostel_id_hostels_id_fk" FOREIGN KEY ("assigned_hostel_id") REFERENCES "public"."hostels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_current_room_id_rooms_id_fk" FOREIGN KEY ("current_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_created_idx" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bookings_room_idx" ON "bookings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bookings_student_idx" ON "bookings" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_bed_unique" ON "bookings" USING btree ("room_id","bed_index") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_student_unique" ON "bookings" USING btree ("student_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "electricity_room_period_unique" ON "electricity_bills" USING btree ("room_id","period");--> statement-breakpoint
CREATE INDEX "electricity_room_idx" ON "electricity_bills" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepasses_reference_unique" ON "gatepasses" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "gatepasses_status_idx" ON "gatepasses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gatepasses_student_idx" ON "gatepasses" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostels_code_unique" ON "hostels" USING btree ("code");--> statement-breakpoint
CREATE INDEX "mess_feedback_hostel_idx" ON "mess_feedback" USING btree ("hostel_id","served_on");--> statement-breakpoint
CREATE UNIQUE INDEX "mess_menu_slot_unique" ON "mess_menus" USING btree ("hostel_id","day_of_week","meal");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "raids_hostel_idx" ON "raids" USING btree ("hostel_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_hostel_idx" ON "requests" USING btree ("hostel_id","status");--> statement-breakpoint
CREATE INDEX "requests_student_idx" ON "requests" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hostel_number_unique" ON "rooms" USING btree ("hostel_id","room_number");--> statement-breakpoint
CREATE INDEX "rooms_hostel_floor_idx" ON "rooms" USING btree ("hostel_id","floor");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_employee_code_unique" ON "staff" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "staff_hostel_idx" ON "staff" USING btree ("assigned_hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_roll_unique" ON "students" USING btree ("roll_number");--> statement-breakpoint
CREATE INDEX "students_hostel_idx" ON "students" USING btree ("hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");