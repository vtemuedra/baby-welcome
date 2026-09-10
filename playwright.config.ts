import { defineConfig } from '@playwright/test'

const baseURL = `http://127.0.0.1:${process.env.ATLAS_TEST_PORT || '8106'}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'node server/test-server.js', url: `${baseURL}/api/health`, reuseExistingServer: false },
})