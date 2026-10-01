import { test, expect } from '@playwright/test';
import path from 'path';
import { fetchOtpMessage, deleteMessage } from './utils/gmail';
import { readCsvRows, deleteFirstRow } from './utils/csv';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const csvPath = path.resolve(__dirname, '../data/accounts.csv');

// Only Instagram's own verification senders are trusted as the OTP source.
const OTP_SENDERS = 'from:(security@mail.instagram.com OR no-reply@mail.instagram.com)';

/** Mask an email for logs: "alice@example.com" -> "a***@example.com". */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
}

function parseDob(dob: string): { day: string; month: string; year: string } {
  const cleaned = dob.trim().replace(/[.\-]/g, '/');
  const parts = cleaned.split('/').map((p) => p.trim());
  if (parts.length !== 3) throw new Error(`Invalid dob: "${dob}"`);

  const [dayRaw, monthRaw, yearRaw] = parts;
  const day = parseInt(dayRaw, 10);
  const monthNum = parseInt(monthRaw, 10);
  const year = parseInt(yearRaw, 10);

  if (isNaN(day) || day < 1 || day > 31) throw new Error(`Invalid day: "${dob}"`);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) throw new Error(`Invalid month: "${dob}"`);
  if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) throw new Error(`Invalid year: "${dob}"`);

  return { day: String(day), month: MONTHS[monthNum - 1], year: String(year) };
}

// ─────────────────────────────────────────────────────────────
// Single-row test. Each invocation processes the TOP row of the CSV.
// On success, the row is removed so the next run picks up the next one.
// ─────────────────────────────────────────────────────────────
test('Instagram signup — process top CSV row', async ({ page }) => {
  // ── 1. Read the first CSV row ──
  const rows = readCsvRows(csvPath);
  if (rows.length === 0) {
    console.log('📭 CSV is empty — nothing to process.');
    test.skip(true, 'CSV is empty');
    return;
  }

  const row = rows[0];
  const { email, full_name, username, dob, password } = row as any;
  const { day, month, year } = parseDob(dob);

  console.log(`▶️  Processing: ${maskEmail(email)} (${rows.length - 1} rows left after this)`);

  // ── 2. Signup flow ──
  await page.goto('https://www.instagram.com/accounts/emailsignup/');

  await page.getByRole('textbox', { name: 'Mobile number or email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password Password' }).fill(password);

  await page.getByRole('combobox', { name: 'Select day' }).click();
  await page.getByRole('option', { name: day, exact: true }).click();

  await page.getByRole('combobox', { name: 'Select month' })
    .locator('div').filter({ hasText: /^Month$/ }).click();
  await page.getByRole('option', { name: month }).click();

  await page.getByRole('combobox', { name: 'Select year' })
    .locator('div').filter({ hasText: /^Year$/ }).click();
  await page.getByRole('option', { name: year }).click();

  await page.getByRole('textbox', { name: 'Name Full name' }).fill(full_name);
  await page.getByRole('combobox', { name: 'Username' }).fill(username);

  // ── 3. Submit + OTP ──
  const submittedAt = Math.floor(Date.now() / 1000);
  await page.getByRole('button', { name: 'Submit' }).click();

  console.log(`⏳ Waiting for OTP email (since ${new Date(submittedAt * 1000).toLocaleTimeString()})...`);
  const result = await fetchOtpMessage(
    `in:anywhere ${OTP_SENDERS} after:${submittedAt}`,
    180_000
  );
  if (!result) throw new Error('OTP not received within 3 minutes');

  const { id: otpMessageId, otp } = result;
  console.log(`✅ Got fresh OTP (${otp.length} digits)`);

  await page.getByRole('textbox', { name: /code/i }).fill(otp);
  await page.getByRole('button', { name: /continue/i }).click();

  // Cleanup OTP email (best-effort)
  try { await deleteMessage(otpMessageId); }
  catch (err) { console.warn('⚠️  Failed to delete OTP email:', (err as Error).message); }

  // ── 4. Wait for login ──
  await page.waitForURL('https://www.instagram.com/', { timeout: 60_000 });
  await page.waitForLoadState('domcontentloaded');
  console.log('✅ Logged in');

  // ── 5. SUCCESS → remove this row from the CSV ──
  deleteFirstRow(csvPath);
  console.log(`🗑️  Removed ${maskEmail(email)} from CSV`);
  console.log('🎉 Done');
});