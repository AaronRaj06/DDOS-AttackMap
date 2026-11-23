import { defineConfig, devices } from '@playwright/test';

const PORT = 5055;

// Runs against the production build served by the real backend in demo mode (no API keys)
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'node ../backend/index.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Empty keys on purpose: whatever is in the developer's environment, this is demo mode
    env: { PORT: String(PORT), HOST: '127.0.0.1', CLOUDFLARE_API_TOKEN: '', ABUSEIPDB_KEY: '', MONGODB_URI: '', ALERT_WEBHOOK_URL: '', METRICS_TOKEN: '' },
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Software GL, so the globe renders on machines and CI runners without a GPU
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    },
  }],
});
