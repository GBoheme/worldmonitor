import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testMatch:'**/intelligence-pwa.spec.ts', use:{...base.use,baseURL:'http://127.0.0.1:4187'},
 webServer:{command:'node scripts/benchmark-gboheme.mjs serve',url:'http://127.0.0.1:4187/dashboard',reuseExistingServer:false,timeout:60000} });
