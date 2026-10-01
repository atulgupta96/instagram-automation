import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// gmail.modify = read + trash + mark read. Needed because the OTP email is
// trashed after use; switch to gmail.readonly if you drop deleteMessage().
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/** Authorize + return an authenticated OAuth2 client (uses token.json if present). */
export async function authorizeGmail() {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  const credentials = JSON.parse(content);

  // Support both "installed" (Desktop app) and "web" credential types
  const key = credentials.installed || credentials.web;
  const { client_secret, client_id, redirect_uris } = key;

  // Google retired the out-of-band (OOB) flow; a loopback redirect URI is required.
  const redirectUri = redirect_uris?.[0];
  if (!redirectUri) {
    throw new Error('credentials.json has no redirect_uris — create a "Desktop app" OAuth client.');
  }

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  return getNewToken(oAuth2Client);
}

/**
 * First-run only: prompt user for an OAuth code, then save token.json.
 * After approving, the browser lands on the loopback redirect URI; copy the
 * `code` query parameter from that URL and paste it here.
 */
function getNewToken(oAuth2Client: any): Promise<any> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('\n👉 Authorize this app by visiting this URL:\n', authUrl, '\n');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve, reject) => {
    rl.question('Paste the `code` parameter from the redirect URL: ', (code: string) => {
      rl.close();
      oAuth2Client.getToken(code.trim(), (err: any, token: any) => {
        if (err) return reject(err);
        oAuth2Client.setCredentials(token);
        // Owner-only: the token grants access to the mailbox.
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), { mode: 0o600 });
        console.log('✅ Token saved to token.json\n');
        resolve(oAuth2Client);
      });
    });
  });
}

/**
 * Fetch the latest email matching a Gmail search query and extract its OTP.
 * Returns both the OTP and the Gmail message ID (so it can be trashed later).
 * Polls every 3 seconds up to `timeoutMs`.
 */
export async function fetchOtpMessage(
  query: string,
  timeoutMs = 60000
): Promise<{ id: string; otp: string } | null> {
  const auth = await authorizeGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  [${elapsed}s] polling Gmail...`);

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 1,
    });

    const messages = res.data.messages;
    if (messages && messages.length > 0) {
      const messageId = messages[0].id!;
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const body = extractBody(message.data.payload);
      const otp = body ? extractOtpFromString(body) : null;

      if (otp) {
        console.log(`📩 OTP found (${otp.length} digits)`);
        return { id: messageId, otp };
      }
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('⏰ Timed out waiting for OTP');
  return null;
}

/**
 * Convenience wrapper: returns just the OTP string (kept for backward compat).
 */
export async function fetchOtpFromGmail(
  query: string,
  timeoutMs = 60000
): Promise<string | null> {
  const result = await fetchOtpMessage(query, timeoutMs);
  return result?.otp ?? null;
}

/**
 * Move a Gmail message to Trash.
 * Recoverable for 30 days — safer than a permanent delete.
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const auth = await authorizeGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.trash({ userId: 'me', id: messageId });
  console.log('🗑️  OTP email moved to Trash');
}

/**
 * Mark a Gmail message as read (removes the UNREAD label).
 * Use this instead of deleteMessage if you'd rather keep the email.
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const auth = await authorizeGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
  console.log('👁️  OTP email marked as read');
}

/**
 * Recursively walk MIME parts, decode base64, and return the first
 * text body we find. Prefers text/plain over text/html.
 */
function extractBody(payload: any): string | null {
  if (!payload) return null;

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  if (Array.isArray(payload.parts)) {
    const preferred = payload.parts
      .filter((p: any) => p.mimeType === 'text/plain')
      .concat(payload.parts.filter((p: any) => p.mimeType !== 'text/plain'));

    for (const part of preferred) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return null;
}

/**
 * Pull a plausible OTP out of an email body.
 * Tries increasingly permissive patterns and rejects obvious junk.
 */
function extractOtpFromString(body: string): string | null {
  const junk = new Set(['000000', '111111', '123456', '999999']);

  // Only accept numbers in a verification context — no bare "any 6 digits" fallback.
  const patterns = [
    /\b(?:code|otp|pin|verification code)[\s:is]*([0-9]{4,8})\b/i,
    /\b([0-9]{6})\b(?=[\s\S]{0,80}(?:instagram|verif|expire))/i,
  ];

  for (const re of patterns) {
    const m = body.match(re);
    if (m && m[1] && !junk.has(m[1])) {
      return m[1];
    }
  }
  return null;
}