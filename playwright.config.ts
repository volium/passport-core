import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',testMatch:'**/*.spec.ts',workers:1,
  use:{baseURL:'http://127.0.0.1:4175',viewport:{width:1280,height:800},launchOptions:{executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}},
  webServer:{command:'npm run build && vite --port 4175 --strictPort',url:'http://127.0.0.1:4175/tests/browser/app.html',reuseExistingServer:!process.env.CI},
});
