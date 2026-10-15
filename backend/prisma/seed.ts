/**
 * Development seed: inserts upcoming AVAILABLE time slots.
 *
 * - Non-destructive and idempotent: existing rows are never deleted or changed.
 *   Slots that would overlap an existing active slot are skipped by the database
 *   (ON CONFLICT DO NOTHING also covers the exclusion constraint).
 * - Creates no bookings, so no personal data is seeded.
 * - Refuses to run with NODE_ENV=production.
 */
import { env } from '../src/config/env';
import { createPrismaClient } from '../src/lib/prisma';
import {
  addMinutes,
  APP_TIME_ZONE,
  calendarDateInZone,
  zonedTimeToUtc,
} from '../src/utils/date-time';

const WORKING_DAYS_AHEAD = 10;

/** Wall-clock times in Europe/Skopje with varied allowed durations. */
const DAILY_TEMPLATE: { hours: number; minutes: number; durationMinutes: 15 | 30 | 45 | 60 }[] = [
  { hours: 9, minutes: 0, durationMinutes: 60 },
  { hours: 10, minutes: 30, durationMinutes: 30 },
  { hours: 11, minutes: 0, durationMinutes: 45 },
  { hours: 14, minutes: 0, durationMinutes: 30 },
  { hours: 14, minutes: 30, durationMinutes: 30 },
  { hours: 16, minutes: 0, durationMinutes: 15 },
];

function buildSlots(now: Date): { startTime: Date; endTime: Date }[] {
  const today = calendarDateInZone(now);
  const slots: { startTime: Date; endTime: Date }[] = [];

  for (let offset = 1, workingDays = 0; workingDays < WORKING_DAYS_AHEAD; offset += 1) {
    const date = { year: today.year, month: today.month, day: today.day + offset };
    const { weekday } = calendarDateInZone(zonedTimeToUtc(date, 12, 0));
    if (weekday === 0 || weekday === 6) continue;
    workingDays += 1;

    for (const { hours, minutes, durationMinutes } of DAILY_TEMPLATE) {
      const startTime = zonedTimeToUtc(date, hours, minutes, APP_TIME_ZONE);
      slots.push({ startTime, endTime: addMinutes(startTime, durationMinutes) });
    }
  }
  return slots;
}

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error('Refusing to seed with NODE_ENV=production.');
  }

  const prisma = createPrismaClient(env.databaseUrl);
  try {
    const slots = buildSlots(new Date());
    const { count } = await prisma.timeSlot.createMany({ data: slots, skipDuplicates: true });
    console.info(
      `[seed] Inserted ${count} of ${slots.length} slots (${slots.length - count} already present).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
