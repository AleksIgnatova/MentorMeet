-- CreateEnum
CREATE TYPE "time_slot_status" AS ENUM ('AVAILABLE', 'BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "time_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "status" "time_slot_status" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "time_slot_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'CONFIRMED',
    "confirmation_token" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_slots_status_start_time_idx" ON "time_slots"("status", "start_time");

-- CreateIndex
CREATE INDEX "time_slots_start_time_idx" ON "time_slots"("start_time");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_time_slot_id_key" ON "bookings"("time_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_confirmation_token_key" ON "bookings"("confirmation_token");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (not expressible in schema.prisma).
-- These enforce integrity in the database itself, so they also hold under
-- concurrent requests and for any client that bypasses the API.
-- ---------------------------------------------------------------------------

-- A slot must start before it ends.
ALTER TABLE "time_slots"
  ADD CONSTRAINT "time_slots_start_before_end" CHECK ("start_time" < "end_time");

-- Active (non-cancelled) slots must not overlap. Half-open intervals '[)' mean
-- 14:00-14:30 and 14:30-15:00 are allowed, while 14:00-14:30 and 14:15-14:45 are not.
-- Only a range column is compared (no equality columns), so the btree_gist
-- extension is not needed: core GiST supports range types.
ALTER TABLE "time_slots"
  ADD CONSTRAINT "time_slots_no_overlap"
  EXCLUDE USING gist (tstzrange("start_time", "end_time", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED');

-- Defence in depth for booking data. Full validation happens in the API (Zod).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_name_not_blank" CHECK (btrim("name") <> '');

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_email_not_blank" CHECK (btrim("email") <> '');

-- Confirmation tokens must be long enough to be unguessable
-- (32 random bytes encode to 43 base64url characters).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_token_min_length" CHECK (char_length("confirmation_token") >= 32);
