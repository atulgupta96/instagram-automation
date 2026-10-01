# Signup automation with email-OTP verification

An end-to-end browser automation, written as an independent project, that completes a multi-step web signup with no human input. That includes reading the one-time code from the verification email.

▶️ **[Watch the 39-second explainer](demo/explainer.mp4)**

https://github.com/user-attachments/assets/d8e752ff-2540-4074-aec1-42a89427a7be

## How it works

1. **Fill:** Playwright drives a real Chrome browser and fills the signup form (email, password, date of birth, name, username) using accessibility-role selectors (`getByRole`) instead of brittle CSS.
2. **Verify:** After submitting, it polls the Gmail API over OAuth2 every 3 seconds for a verification email from a trusted sender that arrived after the submit time. It walks the MIME tree, decodes the base64 body, and extracts the code with context-aware patterns that reject junk values.
3. **Repeat:** It enters the code, confirms the session reached the home page, trashes the verification email, and removes the processed row from the CSV queue with an atomic rewrite. `run-signups.sh` runs N attempts, keeps failed rows for retry, and prints a pass/fail summary.

**Stack:** TypeScript · Playwright · Gmail API · Google OAuth2 · Node.js · Bash

## Setup

```bash
npm install
npx playwright install chromium
```

1. In Google Cloud Console, enable the Gmail API and create an OAuth client of type **Desktop app**. Save it as `credentials.json` in the project root.
2. Copy `data/accounts.example.csv` to `data/accounts.csv` and add test rows (`email,full_name,username,dob,password`; dob as `DD/MM/YYYY`).
3. Run once: `./run-signups.sh 1`. On the first run you'll be asked to authorize Gmail access. After approving, paste the `code` parameter from the redirect URL. The token is saved to `token.json` with owner-only permissions.

To keep failure screenshots and videos for debugging, run with `DEBUG_ARTIFACTS=1`. They are off by default.

## Security notes

- `credentials.json`, `token.json`, `data/accounts.csv`, and all Playwright output are git-ignored. Never commit them.
- The OAuth scope is `gmail.modify` because the OTP email is trashed after use. Switch to `gmail.readonly` if you remove `deleteMessage()`.
- Logs show masked emails and never print the code.
- If your OAuth app is in "Testing" status, refresh tokens expire after 7 days. Delete `token.json` to re-authorize.

## Responsible use

This is a proof of concept for automated email-OTP flows. Automating account creation on third-party platforms usually violates their terms of service. Use it only against systems you own or are authorized to test.
