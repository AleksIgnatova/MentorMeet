-- Gemini confirmation message, generated lazily by POST /api/ai/confirmation.
-- Nullable: existing bookings and bookings whose message has not been generated
-- (or whose generation failed) keep NULL. The fallback message is never stored.
-- Adding a nullable column without a default does not rewrite existing rows.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "ai_confirmation_message" VARCHAR(600);

-- A stored message is never blank (NULL means "not generated yet").
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_ai_message_not_blank"
  CHECK ("ai_confirmation_message" IS NULL OR btrim("ai_confirmation_message") <> '');
