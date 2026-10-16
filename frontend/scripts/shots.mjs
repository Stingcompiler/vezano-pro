// Review screenshots for the UI guide (docs/ui-profile.md, part C):
// every representative screen × width × colour scheme × language, into
// shots/<label>/<screen>--<width>--<scheme>--<lang>.png at the repo root.
//
//   npm run shots -- <label>            (label defaults to "current")
//   npm run shots -- <label> dashboard pos   (only these screens)
//
// Runs against a LOCAL copy of the app that is already running — Django
// serving frontend/out, never production. BASE_URL (default
// http://127.0.0.1:8000) and these local test accounts in a throwaway
// SQLite database:
//
//   manage.py migrate && manage.py seed_e2e     # company + owner (fixture)
//   manage.py seed_demo --owner e2e-owner@vezano.test --scale 2500 --sales 60 --platform --yes
//   manage.py createsuperuser                   # a local platform account
//
//   SHOTS_EMAIL / SHOTS_PASSWORD           the company owner; default: the
//                                          seed_e2e fixture account
//   SHOTS_PLATFORM_EMAIL / _PASSWORD       the local superuser; without them
//                                          the platform screens are skipped
//   SHOTS_CLOCK                            the page's fixed clock (ISO);
//                                          default today 10:00, so the seeded
//                                          "last 28 days" stay in range
//
// One login per account writes a storageState (shots/.auth/<account>.json)
// that every later context reuses. Each context: reduced motion, service
// workers blocked, a fixed clock, and the app's language/theme preference
// keys (I18nProvider) set before the first script runs.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
// Local only: these are seeded test accounts, and production is never a target.
if (!/^(localhost|127\.0\.0\.1|\[::1\]|[\w.-]+\.(localhost|test))$/.test(new URL(BASE).hostname)) {
  console.error(`BASE_URL must be a local host, not ${BASE}`);
  process.exit(2);
}
const [LABEL = "current", ...ONLY] = process.argv.slice(2);
const OUT = join(ROOT, "shots", LABEL);
const AUTH = join(ROOT, "shots", ".auth");

// docs/ui-profile.md: supported widths, both schemes, both languages.
const WIDTHS = [375, 768, 1280, 1920];
const HEIGHT = { 375: 812, 768: 1024, 1280: 800, 1920: 1080 };
const SCHEMES = ["light", "dark"];
const LANGS = ["ar", "en"];

const ACCOUNTS = {
  owner: {
    email: process.env.SHOTS_EMAIL || "e2e-owner@vezano.test",
    // The seed_e2e fixture's own password (backend/core/management/commands/seed_e2e.py).
    password: process.env.SHOTS_PASSWORD || "E2e-owner-passw0rd!",
  },
  platform: {
    email: process.env.SHOTS_PLATFORM_EMAIL,
    password: process.env.SHOTS_PLATFORM_PASSWORD,
  },
};

// The representative screens (docs/ui-profile.md). `ready`: a selector that
// means the content is in; `hold`: a URL glob whose API calls are kept
// pending, so the screen's loading state (skeletons) is what gets captured.
const SCREENS = [
  { name: "dashboard", account: "owner", path: "/dashboard/", ready: "main h1" },
  { name: "dashboard-loading", account: "owner", path: "/dashboard/", ready: "main", hold: "**/api/dashboard/**" },
  { name: "pos", account: "owner", path: "/sales/", ready: "main input[placeholder]" },
  { name: "invoices", account: "owner", path: "/sales/?tab=invoices", ready: "main table tbody tr" },
  { name: "inventory", account: "owner", path: "/inventory/", ready: "main table tbody tr" },
  { name: "subscription", account: "owner", path: "/subscription/", ready: "main h1" },
  { name: "web-orders-empty", account: "owner", path: "/web-orders/", ready: "main table" },
  // One shot per report tab. The query differs per tab so each is a real
  // navigation (a hash change alone would not reload the page).
  { name: "reports-overview", account: "owner", path: "/reports/?t=overview#overview", ready: "main h1" },
  { name: "reports-sales", account: "owner", path: "/reports/?t=sales#sales", ready: "main h1" },
  { name: "reports-purchasing", account: "owner", path: "/reports/?t=purchasing#purchasing", ready: "main h1" },
  { name: "reports-finance", account: "owner", path: "/reports/?t=finance#finance", ready: "main h1" },
  { name: "reports-hr", account: "owner", path: "/reports/?t=hr#hr", ready: "main h1" },
  { name: "platform", account: "platform", path: "/platform/", ready: "main h1" },
  { name: "platform-companies", account: "platform", path: "/platform-companies/", ready: "main h1" },
].filter((s) => !ONLY.length || ONLY.includes(s.name));

function clock() {
  if (process.env.SHOTS_CLOCK) return new Date(process.env.SHOTS_CLOCK);
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return d;
}

async function login(browser, account) {
  const { email, password } = ACCOUNTS[account];
  const file = join(AUTH, `${account}.json`);
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login/`);
  await page.fill("input[type=email], input[name=email], input[autocomplete=username]", email);
  await page.fill("input[type=password]", password);
  await Promise.all([
    page.waitForURL(/dashboard|platform/, { timeout: 30000 }),
    page.keyboard.press("Enter"),
  ]);
  await context.storageState({ path: file });
  await context.close();
  return file;
}

async function shoot(page, screen, file) {
  // Never answered: the screen stays in its loading state.
  if (screen.hold) await page.route(screen.hold, () => {});
  try {
    await page.goto(`${BASE}${screen.path}`, { waitUntil: screen.hold ? "domcontentloaded" : "networkidle", timeout: 45000 });
    await page.locator(screen.ready).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(screen.hold ? 1500 : 700);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  } finally {
    if (screen.hold) await page.unrouteAll({ behavior: "ignoreErrors" });
  }
}

// SHOTS_CHROMIUM: a Chromium binary to use when the one matching this
// Playwright version is not installed (`npx playwright install chromium`).
const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : { channel: "chromium" },
);
let shot = 0;
const failed = [];
try {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(AUTH, { recursive: true });
  const states = {};
  for (const account of new Set(SCREENS.map((s) => s.account))) {
    if (!ACCOUNTS[account].email || !ACCOUNTS[account].password) {
      console.warn(`no credentials for the ${account} account: skipping its screens`);
      continue;
    }
    states[account] = await login(browser, account);
  }
  for (const width of WIDTHS) {
    for (const scheme of SCHEMES) {
      for (const lang of LANGS) {
        for (const account of Object.keys(states)) {
          const context = await browser.newContext({
            storageState: states[account],
            viewport: { width, height: HEIGHT[width] },
            colorScheme: scheme,
            reducedMotion: "reduce",
            locale: lang === "ar" ? "ar-SD" : "en-US",
            timezoneId: "Africa/Khartoum",
            serviceWorkers: "block",
          });
          await context.addCookies([{ name: "erp_language", value: lang, url: BASE }]);
          await context.addInitScript(([l, s]) => {
            try {
              localStorage.setItem("erp.language", l);
              localStorage.setItem("erp.theme", s);
            } catch { /* ignore */ }
          }, [lang, scheme]);
          const page = await context.newPage();
          await page.clock.setFixedTime(clock());
          for (const screen of SCREENS.filter((s) => s.account === account)) {
            const file = join(OUT, `${screen.name}--${width}--${scheme}--${lang}.png`);
            try {
              await shoot(page, screen, file);
              shot += 1;
            } catch (err) {
              failed.push(`${screen.name}--${width}--${scheme}--${lang}: ${err.message.split("\n")[0]}`);
            }
          }
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`${shot} shots in ${OUT}`);
if (failed.length) {
  console.error(`${failed.length} failed:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
