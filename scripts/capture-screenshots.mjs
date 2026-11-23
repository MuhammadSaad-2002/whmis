// Live screenshot capture for the WHMIS client presentation.
//
// Drives the ALREADY-INSTALLED Google Chrome (no Chromium download) against a
// locally running `php artisan serve` (http://127.0.0.1:8000), logs in as the
// seeded admin, and writes one PNG per screen into docs/presentation/img/.
//
//   php artisan serve --host=127.0.0.1 --port=8000   # in another shell
//   node scripts/capture-screenshots.mjs
//
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const EMAIL = process.env.WHMIS_EMAIL || 'admin@whmis.local';
const PASSWORD = process.env.WHMIS_PASSWORD || 'password';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'docs', 'presentation', 'img');
mkdirSync(OUT, { recursive: true });

// [path, output filename, tab title]. Order = document order.
// Each screenshot opens its page from a fresh workspace so tabs do not accumulate.
const SHOTS = [
  ['/dashboard', '02-dashboard.png', 'Dashboard'],
  ['/sales', '03-sales-index.png', 'Sales Invoices'],
  ['/sales/create', '04-sales-entry.png', 'New Sale'],
  ['/bookings', '05-bookings-index.png', 'Bookings'],
  ['/bookings/create', '06-bookings-entry.png', 'New Booking'],
  ['/purchases', '07-purchases-index.png', 'Purchase Invoices'],
  ['/purchases/create', '08-purchases-entry.png', 'New Purchase'],
  ['/inventory', '09-inventory.png', 'Inventory'],
  ['/inventory/batches', '10-batches.png', 'Batches'],
  ['/products', '11-products.png', 'Products'],
  ['/suppliers', '12-suppliers.png', 'Suppliers'],
  ['/customers', '13-customers.png', 'Customers'],
  ['/ledger/customers/1', '14-customer-ledger.png', 'Customer Ledger'],
  ['/incentives', '15-incentives.png', 'Incentive Rules'],
  ['/payments', '16-payments.png', 'Payments'],
  ['/returns/sales', '17-returns.png', 'Returns'],
  ['/reports', '18-reports-catalog.png', 'Reports'],
  ['/reports/profit-by-month', '19-report-profit.png', 'Monthly Sales & Profit'],
  ['/reports/sales-register', '20-report-sales-register.png', 'Sales Register'],
];

const TABS_KEY = 'whmis:workspace-tabs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const ok = [];
  const failed = [];

  // 1) Login page itself, then authenticate.
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    await page.screenshot({ path: resolve(OUT, '01-login.png') });
    ok.push('01-login.png');

    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    // App lands on /workspace after login; just wait until we leave /login.
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 });
    await sleep(1000);
  } catch (e) {
    console.error('LOGIN FAILED:', e.message);
    await browser.close();
    process.exit(1);
  }

  // 2) Each app screen — open a deep link from a fresh workspace.
  for (const [route, file] of SHOTS) {
    try {
      await page.evaluate((key) => sessionStorage.removeItem(key), TABS_KEY);
      await page.goto(`${BASE}/workspace?open=${encodeURIComponent(route)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for the tab's content iframe to load its own page.
      const handle = await page.locator(`iframe[src=${JSON.stringify(route)}]`).elementHandle({ timeout: 15000 });
      const frame = await handle.contentFrame();
      if (frame) await frame.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(1800); // let Inertia render + charts/animations settle
      await page.screenshot({ path: resolve(OUT, file) });
      ok.push(file);
      console.log('captured', file);
    } catch (e) {
      failed.push([file, e.message]);
      console.error('FAILED', file, '-', e.message);
    }
  }

  // 3) Workspace showcase — open several tabs through the workspace deep link.
  try {
    await page.evaluate((key) => sessionStorage.removeItem(key), TABS_KEY);
    for (const route of ['/sales', '/bookings', '/inventory', '/reports', '/customers']) {
      await page.goto(`${BASE}/workspace?open=${encodeURIComponent(route)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator(`iframe[src=${JSON.stringify(route)}]`).waitFor({ state: 'attached', timeout: 15000 });
    }
    await page.getByRole('tab', { name: 'Sales Invoices' }).click();
    await sleep(2500);
    await page.screenshot({ path: resolve(OUT, '21-workspace.png') });
    ok.push('21-workspace.png');
    console.log('captured 21-workspace.png');
  } catch (e) {
    failed.push(['21-workspace.png', e.message]);
    console.error('FAILED 21-workspace.png -', e.message);
  }

  await browser.close();
  console.log(`\nDone. ${ok.length} captured, ${failed.length} failed.`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f[0]).join(', '));
    process.exitCode = 2;
  }
})();
