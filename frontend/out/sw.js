/* Vezano app-shell service worker.
 *
 * Goal: the app OPENS without a network — after a power cut reboots the till
 * the cashier can still reach the POS and the queued sales. Data is not
 * cached here (IndexedDB owns that); this only keeps the shell available.
 *
 *   _next/static/*   cache-first   (content-hashed, immutable per build)
 *   navigations      network-first with a short timeout, then the cached page
 *   other same-origin GET assets  stale-while-revalidate
 *   /api/*           never touched
 *
 * Install is ATOMIC: every page and every asset of this build is fetched
 * into a fresh cache before the worker is allowed to install, so a shell is
 * either complete or not there. This worker never calls skipWaiting() on
 * its own: a new build waits until the page asks for it (see
 * lib/serviceWorker.js), because activating mid-session would delete the
 * cache the running page still loads chunks from — a white screen on the
 * next navigation, offline. BUILD and PRECACHE_ASSETS are stamped per build
 * by scripts/stamp-sw.mjs.
 */
const BUILD = "Wpx5WfRhmp0rNDXkFEkFZ";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/Wpx5WfRhmp0rNDXkFEkFZ/_buildManifest.js","/_next/static/Wpx5WfRhmp0rNDXkFEkFZ/_ssgManifest.js","/_next/static/chunks/1052-7b89b0e3904e8d59.js","/_next/static/chunks/1139-15273688988471c9.js","/_next/static/chunks/1255-f456c2191ed027a9.js","/_next/static/chunks/1256-340d7cfa4dc1be02.js","/_next/static/chunks/1268-0264e778c6695ff2.js","/_next/static/chunks/1355-f1ffdab3908a791a.js","/_next/static/chunks/1358-bff448d56b1ae20c.js","/_next/static/chunks/1492-9db59b2da71e9472.js","/_next/static/chunks/1624-3aef456659eddf36.js","/_next/static/chunks/2313-bc4127279a1a4411.js","/_next/static/chunks/2358-cdc7bb3010d16330.js","/_next/static/chunks/2391.d0eed6031ed46fa3.js","/_next/static/chunks/2951-70d71d808111cc0c.js","/_next/static/chunks/3098-a9682f52e91c87c3.js","/_next/static/chunks/3302-ef39ea704e30a775.js","/_next/static/chunks/3607-6c8e02830a37bb0a.js","/_next/static/chunks/4011-91ae694263eef881.js","/_next/static/chunks/4121-7894a98e933750d7.js","/_next/static/chunks/4491-a32f3a7440341b1a.js","/_next/static/chunks/4516-373cd5759a8d5015.js","/_next/static/chunks/4545-f516c64e572ac8dd.js","/_next/static/chunks/4779-cfbb878e37c9c51c.js","/_next/static/chunks/4796-ddc6021c16d1db57.js","/_next/static/chunks/4825-ad3c895d3d13c2aa.js","/_next/static/chunks/4bd1b696-100b9d70ed4e49c1.js","/_next/static/chunks/5263-feeb01b46d6367c5.js","/_next/static/chunks/5421.d04d2b84e94672b6.js","/_next/static/chunks/6531-130d13e3f29f8bda.js","/_next/static/chunks/6565-e3a3e025a3113a26.js","/_next/static/chunks/7289-ce2dea732489a2b2.js","/_next/static/chunks/7403-ed3559376c448646.js","/_next/static/chunks/8109.46238d46d534e00a.js","/_next/static/chunks/8599-94b920626a80f5e3.js","/_next/static/chunks/8703-d0b6fc5589fca124.js","/_next/static/chunks/8758-12e978c23ffe72de.js","/_next/static/chunks/9053-f87ab4c43a88d1d0.js","/_next/static/chunks/9285-92773d100e6cec9f.js","/_next/static/chunks/9336-7ddae8218e4eff09.js","/_next/static/chunks/9562-63ccd8946b62e02b.js","/_next/static/chunks/9572-886ab4b096530d2a.js","/_next/static/chunks/9952-2fcd367e57a04895.js","/_next/static/chunks/app/(app)/crm/page-1bc6f149c04ddb8a.js","/_next/static/chunks/app/(app)/customer-records/page-9a6d2f6e08c7a0e2.js","/_next/static/chunks/app/(app)/dashboard/page-fca8ee1d4024697b.js","/_next/static/chunks/app/(app)/debts/page-d19c74977217420c.js","/_next/static/chunks/app/(app)/finance/page-4dc0500d2a6acd55.js","/_next/static/chunks/app/(app)/hr/page-573f592b7ec2adb0.js","/_next/static/chunks/app/(app)/inventory/page-ee52468ec1591075.js","/_next/static/chunks/app/(app)/labels/page-ab192958982a1e15.js","/_next/static/chunks/app/(app)/layout-48443c7f58cf6fee.js","/_next/static/chunks/app/(app)/logs/page-0c994344d15086e2.js","/_next/static/chunks/app/(app)/org/page-148a425800bb664c.js","/_next/static/chunks/app/(app)/platform-activity/page-5f9fe524d9e75e82.js","/_next/static/chunks/app/(app)/platform-analytics/page-5f31e608a7a8ca9e.js","/_next/static/chunks/app/(app)/platform-companies/page-dabb12beef4e5f47.js","/_next/static/chunks/app/(app)/platform-errors/page-4429709851eb7cae.js","/_next/static/chunks/app/(app)/platform-finance/page-7a168b02614beaac.js","/_next/static/chunks/app/(app)/platform-leads/page-7cc12a6457d1ae00.js","/_next/static/chunks/app/(app)/platform-plans/page-f458a18e898be014.js","/_next/static/chunks/app/(app)/platform-registrations/page-5e69606339d820f6.js","/_next/static/chunks/app/(app)/platform-seo/page-1ddce187f4f9ff14.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-a509bfcfe339cb8d.js","/_next/static/chunks/app/(app)/platform-team/member/page-46eb7935cc6214e3.js","/_next/static/chunks/app/(app)/platform-team/page-a8883eee3e4e68d6.js","/_next/static/chunks/app/(app)/platform/page-2f802d91c8358854.js","/_next/static/chunks/app/(app)/purchasing/page-17b8f8282591e0f9.js","/_next/static/chunks/app/(app)/reports/page-b8f726e6c049cb34.js","/_next/static/chunks/app/(app)/returns/page-e89dbbdca7234193.js","/_next/static/chunks/app/(app)/sales/page-134f7acb5e4bd9eb.js","/_next/static/chunks/app/(app)/settings/page-024c9624163e5a58.js","/_next/static/chunks/app/(app)/subscription/page-4628ccd56940f2d1.js","/_next/static/chunks/app/(app)/supplier-records/page-1ff0a59810751fde.js","/_next/static/chunks/app/(app)/users/detail/page-9818e1d39d6e2cfa.js","/_next/static/chunks/app/(app)/users/page-7a92a912d3d88c1f.js","/_next/static/chunks/app/(app)/web-orders/page-f82618ce0a464879.js","/_next/static/chunks/app/(app)/website/page-d59b81cd62ed00ae.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-b882dc1735209eb8.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-32508c2524567206.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-f01f0c8ff5bd6cdf.js","/_next/static/chunks/app/(marketing)/en/guides/page-e77e1ab728b6c305.js","/_next/static/chunks/app/(marketing)/en/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/page-711912ec5538cfa9.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/pricing/page-979600e59ca77952.js","/_next/static/chunks/app/(marketing)/en/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/product/page-07d482b608b242e3.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-4b2788d6909a003e.js","/_next/static/chunks/app/(marketing)/en/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/page-91ae694f960b3fd9.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-62950d4b2038d240.js","/_next/static/chunks/app/(marketing)/en/solutions/page-b6a41580c696f89d.js","/_next/static/chunks/app/(marketing)/en/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/track/page-cd62141c74e5c710.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-4c95ced4cb089b24.js","/_next/static/chunks/app/(marketing)/guides/page-8ec408c95ed0bbcc.js","/_next/static/chunks/app/(marketing)/layout-26bdf2716ae3e547.js","/_next/static/chunks/app/(marketing)/page-9d551ff574188d6f.js","/_next/static/chunks/app/(marketing)/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/pricing/page-57cc5987d4ca4beb.js","/_next/static/chunks/app/(marketing)/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/product/page-6785b19bfe481d42.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/hosting/page-1ab4fda3c6cebf88.js","/_next/static/chunks/app/(marketing)/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/page-419b163ea07600ed.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-b3079a975da31228.js","/_next/static/chunks/app/(marketing)/solutions/page-92c6b6eee1d90775.js","/_next/static/chunks/app/(marketing)/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/track/page-f4b7b86e02884e37.js","/_next/static/chunks/app/_not-found/page-6157a4dcbb7cb0c5.js","/_next/static/chunks/app/activate-owner/layout-a019ba6924c9266b.js","/_next/static/chunks/app/activate-owner/page-33247e107e0df352.js","/_next/static/chunks/app/forgot-password/layout-a019ba6924c9266b.js","/_next/static/chunks/app/forgot-password/page-78838d0e0cf4a034.js","/_next/static/chunks/app/layout-e21a2f1caf7f3e67.js","/_next/static/chunks/app/login/layout-a019ba6924c9266b.js","/_next/static/chunks/app/login/page-1788f7a6fab479bd.js","/_next/static/chunks/app/reset-password/layout-a019ba6924c9266b.js","/_next/static/chunks/app/reset-password/page-4484510457c01b2e.js","/_next/static/chunks/app/robots.txt/route-d306913d2552031f.js","/_next/static/chunks/app/sitemap.xml/route-d306913d2552031f.js","/_next/static/chunks/framework-4374eae96780d8a1.js","/_next/static/chunks/main-app-23dd6c45548b1793.js","/_next/static/chunks/main-bad072af1eaab979.js","/_next/static/chunks/pages/_app-4b3fb5e477a0267f.js","/_next/static/chunks/pages/_error-c970d8b55ace1b48.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-4a42bfff079a5bc6.js","/_next/static/css/20c400b7a1c741cc.css","/_next/static/css/a6d401e24f8cd5bb.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
const NAVIGATION_TIMEOUT_MS = 3000;
// Django stamps `Vary: Accept-Language, Origin` on every response, and the
// Cache API honours Vary: a chunk stored by the worker's own fetch would
// then only match a page request carrying byte-identical Accept-Language
// and Origin headers — which a font (CORS, sends Origin) or a browser with
// a different language list never does. The shell cache is keyed by URL
// and every URL is content-hashed, so Vary carries no information here.
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([...new Set([...PRECACHE_PAGES, ...PRECACHE_APP_PAGES]), ...PRECACHE_ASSETS].map((url) => new Request(url, { cache: "reload" }))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

// The page decides when a waiting build may take over (queue empty, online,
// nothing on screen worth keeping).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Web Push from the server (core/push.py): a new order for this shop. The
// payload is small and self-contained; tapping opens the order.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Vezano Pro", body: event.data?.text() || "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Vezano Pro", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/web-orders/" },
      dir: "auto",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/web-orders/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      if (open) { open.navigate(url); return open.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// A router with no upstream — the common failure — accepts the TCP
// connection and then hangs, so "network first" without a deadline would
// keep the till staring at a blank tab for the whole browser timeout.
function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // The requested page only (with or without the trailing slash). Serving
    // another page's HTML — the old fallback handed out the POS — rendered
    // the wrong screen under the right address whenever a navigation was
    // slow or offline; the app hydrates the page in the HTML, not the URL.
    const url = new URL(request.url);
    const variants = [url.pathname, url.pathname.replace(/\/?$/, "/")];
    for (const path of variants) {
      const hit = await cache.match(new Request(new URL(path, url.origin)), MATCH);
      if (hit) return hit;
    }
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Vezano Pro</title>" +
      "<p style='font-family:system-ui;padding:2rem'>لا يوجد اتصال ولم تُحفظ هذه الصفحة بعد. افتح التطبيق مرة واحدة أثناء الاتصال.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  const refresh = fetch(request)
    .then((response) => { if (response.ok) cache.put(request, response.clone()); return response; })
    .catch(() => null);
  return hit || (await refresh) || new Response("", { status: 504 });
}
