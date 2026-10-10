-- Adds STUDENT.gender, which drives gender-segregated hostel allocation.
--
-- drizzle-kit generates this as a single `ADD COLUMN ... NOT NULL`, which fails
-- against any database that already has students. It is expanded here into the
-- usual safe four steps: add nullable, backfill, tighten, constrain.
--
-- The backfill derives each student's gender from the block they already live
-- in, which is the only trustworthy evidence available: the pre-existing data
-- placed students into men's and women's blocks, so the block records the fact
-- even though the column did not exist yet.
--
-- Students with no block assigned cannot be inferred and are deliberately left
-- NULL, so that `SET NOT NULL` below fails loudly rather than silently stamping
-- them with a guessed value — putting a female student in a men's block is a far
-- worse outcome than a migration that stops and asks. If this migration fails
-- with "column \"gender\" contains null values", fill the gaps first:
--
--   UPDATE students SET gender = 'FEMALE' WHERE user_id IN (...);
--   UPDATE students SET gender = 'MALE'   WHERE gender IS NULL;
--
ALTER TABLE "students" ADD COLUMN "gender" varchar(10);--> statement-breakpoint

UPDATE "students" SET "gender" = "hostels"."gender"
  FROM "hostels"
  WHERE "hostels"."id" = "students"."hostel_id"
    AND "hostels"."gender" IN ('MALE', 'FEMALE');--> statement-breakpoint

ALTER TABLE "students" ALTER COLUMN "gender" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "students" ADD CONSTRAINT "students_gender_valid" CHECK (gender in ('MALE', 'FEMALE'));
