import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The backend started by playwright.config.ts (test database, no Gemini key). */
export const API_URL = 'http://localhost:3999/api';

const skopjeTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Skopje',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type E2ESlot = {
  id: string;
  /** Calendar date (YYYY-MM-DD) of the slot in Europe/Skopje. */
  date: string;
  /** "10:00–10:30", as the booking page shows it. */
  label: string;
};

const random = (n: number) => Math.floor(Math.random() * n);

/**
 * Plan step 1: ensures a future free slot through the real API. The day and time
 * are random so repeated runs against the same test database do not overlap;
 * on an overlap (409) another time is tried.
 */
export async function createFreeSlot(request: APIRequestContext): Promise<E2ESlot> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const day = new Date(Date.now() + (30 + random(600)) * 86_400_000).toISOString().slice(0, 10);
    // 07:00–15:45 UTC is 08:00–17:45 in Skopje: always the same calendar day.
    const start = new Date(`${day}T${String(7 + random(9)).padStart(2, '0')}:${String(15 * random(4)).padStart(2, '0')}:00Z`);
    const res = await request.post(`${API_URL}/slots`, {
      data: { startTime: start.toISOString(), durationMinutes: 30 },
    });
    if (res.status() === 409) continue;
    expect(res.status()).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; startTime: string; endTime: string } };
    return {
      id: data.id,
      date: day,
      label: `${skopjeTime.format(new Date(data.startTime))}–${skopjeTime.format(new Date(data.endTime))}`,
    };
  }
  throw new Error('Could not find a free time for the E2E slot after 10 attempts.');
}

/** Opens /book on the slot's day and waits until the free times have loaded. */
export async function openBookingDay(page: Page, date: string): Promise<void> {
  await page.goto('/book');
  await page.getByLabel('Date').fill(date);
  await expect(page.getByText('Loading available times…')).toBeHidden();
}

export async function fillVisitorDetails(page: Page, name: string, email: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email address').fill(email);
}
