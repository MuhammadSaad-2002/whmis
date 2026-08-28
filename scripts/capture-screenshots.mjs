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
// Every page runs inside the /workspace shell as a workspace tab. To keep the
// tab strip clean (and avoid the MAX_TABS=15 cap freezing later shots), we seed
// localStorage with a SINGLE tab for the target page before loading /workspace.
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

  // 2) Each app screen — seed a single workspace tab, load the shell, wait for
  //    the tab's iframe to render, then screenshot the whole shell.
  for (const [route, file, title] of SHOTS) {
    try {
      await page.evaluate(
        ([key, url, tabTitle]) =>
          localStorage.setItem(key, JSON.stringify({ items: [{ url, title: tabTitle }], active: 0 })),
        [TABS_KEY, route, title],
      );
      await page.goto(`${BASE}/workspace`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for the tab's content iframe to load its own page.
      await page.waitForSelector('iframe', { timeout: 15000 });
      const handle = await page.$('iframe');
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

  // 3) Workspace showcase — seed several tabs to show the in-app tab strip.
  try {
    const many = [
      ['/dashboard', 'Dashboard'],
      ['/sales', 'Sales Invoices'],
      ['/bookings', 'Bookings'],
      ['/inventory', 'Inventory'],
      ['/reports', 'Reports'],
      ['/customers', 'Customers'],
    ];
    await page.evaluate(
      ([key, items]) => localStorage.setItem(key, JSON.stringify({ items, active: 1 })),
      [TABS_KEY, many.map(([url, title]) => ({ url, title }))],
    );
    await page.goto(`${BASE}/workspace`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // With several tabs, only the active iframe is visible; wait for attachment.
    await page.waitForSelector('iframe', { state: 'attached', timeout: 15000 });
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
