import { defineConfig, devices } from '@playwright/test';

// Failure screenshots/videos capture the filled-in form (email, name, DOB),
// so they are off unless explicitly requested: DEBUG_ARTIFACTS=1 npx playwright test
const debugArtifacts = process.env.DEBUG_ARTIFACTS === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // No HTML reporter: it persists stdout, which includes account details.
  reporter: [['list']],
  use: {
    headless: false,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15_000,
    screenshot: debugArtifacts ? 'only-on-failure' : 'off',
    video: debugArtifacts ? 'retain-on-failure' : 'off',
    ...devices['Desktop Chrome'],
  },
});