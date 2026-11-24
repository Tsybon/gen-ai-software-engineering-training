import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./test', testMatch:'ui.spec.mjs', workers:1, timeout:30000,
  use:{ baseURL:process.env.TEST_UI_URL || 'http://localhost:5201', browserName:'chromium', headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || undefined, trace:'retain-on-failure' },
  webServer:{command:'API_PORT=3101 UI_PORT=5201 ./run.sh',url:'http://localhost:5201',reuseExistingServer:false},
  reporter:'list'
});
