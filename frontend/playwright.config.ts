import { defineConfig } from "@playwright/test";
import path from "node:path";
const isolated=process.env.FOODIEGO_E2E_ISOLATED==='1';
const frontPort=process.env.FOODIEGO_E2E_FRONTEND_PORT||'3000',apiPort=process.env.FOODIEGO_E2E_API_PORT||'5000';
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  expect: { timeout: 20000 },
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: `http://localhost:${frontPort}`,
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: isolated?[{command:"npm run test:e2e:server",cwd:path.resolve(process.cwd(),"../backend"),url:`http://localhost:${apiPort}/api/health/ready`,reuseExistingServer:false,timeout:180000},{command:`npm run start -- --hostname localhost --port ${frontPort}`,url:`http://localhost:${frontPort}`,reuseExistingServer:false,timeout:120000}]:{command:`npm run start -- --hostname localhost --port ${frontPort}`,url:`http://localhost:${frontPort}`,reuseExistingServer:true,timeout:120000},
});
