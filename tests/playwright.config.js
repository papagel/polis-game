import { defineConfig } from '@playwright/test';

// The game is a single static index.html with no build step, so there is no
// dev server to start — each test loads the file directly via file:// (see
// harness.js). Keep workers serial-ish; these tests boot a full page each.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
  },
});
