import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const e2eBackendPort = 43300;
const e2eFrontendPort = 43173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${e2eFrontendPort}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `PORT=${e2eBackendPort} DASHBOARD_API_TOKEN=e2e-token node --import tsx tests/e2e/start-e2e-server.mjs`,
      cwd: '../',
      url: `http://127.0.0.1:${e2eBackendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        `VITE_DASHBOARD_HTTP_URL=http://127.0.0.1:${e2eBackendPort}/api VITE_DASHBOARD_WS_URL=ws://127.0.0.1:${e2eBackendPort}/ws VITE_DASHBOARD_API_TOKEN=e2e-token npm run dev -- --host 127.0.0.1 --port ${e2eFrontendPort}`,
      cwd: '.',
      url: `http://127.0.0.1:${e2eFrontendPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
