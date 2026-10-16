import { expect, test } from '@playwright/test';
import { API_URL, createFreeSlot, fillVisitorDetails, openBookingDay } from './helpers';

const CONFIRMATION_URL = /\/booking\/confirmation\/[A-Za-z0-9_-]{43}$/;

test('a visitor books a free slot end to end (plan §14 E2E steps 1–8)', async ({ page, request }) => {
  // 1. A future free slot exists.
  const slot = await createFreeSlot(request);

  // 2–3. Open /book, go to the slot's day and pick the time.
  await openBookingDay(page, slot.date);
  await page.getByRole('button', { name: new RegExp(slot.label) }).click();

  // 4–5. Enter name and email, and book.
  await fillVisitorDetails(page, 'E2E Visitor', 'e2e-visitor@example.com');
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  // 6. The confirmation page shows the booking, loaded from the API by token.
  await expect(page).toHaveURL(CONFIRMATION_URL);
  const confirmation = async () => {
    await expect(page.getByRole('heading', { name: 'Your session is booked' })).toBeVisible();
    await expect(page.getByText('E2E Visitor', { exact: true })).toBeVisible();
    await expect(page.getByText(`${slot.label} (Europe/Skopje)`)).toBeVisible();
    await expect(page.getByText('30 minutes')).toBeVisible();
    // No Gemini key in E2E: the prepared fallback message is shown.
    await expect(page.getByText(/Thank you, E2E Visitor! Your mentoring session is confirmed/)).toBeVisible();
  };
  await confirmation();

  // ...and survives a browser refresh.
  await page.reload();
  await confirmation();

  // 7. The slot is no longer offered, in the UI or by the API.
  await openBookingDay(page, slot.date);
  await expect(page.getByRole('button', { name: new RegExp(slot.label) })).toHaveCount(0);
  const available = await request.get(`${API_URL}/slots`, {
    params: { from: slot.date, to: slot.date, status: 'AVAILABLE' },
  });
  expect(((await available.json()) as { data: { id: string }[] }).data.map((s) => s.id)).not.toContain(slot.id);

  // 8. Booking it again is rejected with 409 Conflict.
  const again = await request.post(`${API_URL}/bookings`, {
    data: { timeSlotId: slot.id, name: 'Second Visitor', email: 'second@example.com' },
  });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('SLOT_ALREADY_BOOKED');
});

test('two visitors pick the same slot: the second one sees a clear conflict message', async ({ browser, request }) => {
  const slot = await createFreeSlot(request);
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();

  // Both see the slot as free and fill in the form.
  for (const [page, name, email] of [
    [first, 'First Visitor', 'first@example.com'],
    [second, 'Second Visitor', 'second@example.com'],
  ] as const) {
    await openBookingDay(page, slot.date);
    await page.getByRole('button', { name: new RegExp(slot.label) }).click();
    await fillVisitorDetails(page, name, email);
  }

  await first.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(first).toHaveURL(CONFIRMATION_URL);

  // The second visitor's list is stale; the API answers 409 and the page explains it.
  await second.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(
    second.getByText('Sorry, that time was just booked by someone else. Please choose another time.'),
  ).toBeVisible();
  await expect(second.getByRole('button', { name: new RegExp(slot.label) })).toHaveCount(0);
  await expect(second).toHaveURL(/\/book$/);
});

test('navigation: root redirect, dashboard ⇄ booking page, and back from the confirmation page', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // A refresh on a client-side route still loads the page.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'Public booking page' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await page.getByRole('link', { name: 'Back to Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // From a confirmed booking, both next steps work.
  const slot = await createFreeSlot(request);
  await openBookingDay(page, slot.date);
  await page.getByRole('button', { name: new RegExp(slot.label) }).click();
  await fillVisitorDetails(page, 'Navigation Visitor', 'navigation@example.com');
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page).toHaveURL(CONFIRMATION_URL);
  const confirmationUrl = page.url();

  await page.getByRole('link', { name: 'Go to Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(confirmationUrl);
  await page.getByRole('link', { name: 'Book another session' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Book a mentoring session' })).toBeVisible();
});
