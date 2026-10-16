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
const BUILD = "T1rnAfCG4LcOJmd2DwGjK";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/T1rnAfCG4LcOJmd2DwGjK/_buildManifest.js","/_next/static/T1rnAfCG4LcOJmd2DwGjK/_ssgManifest.js","/_next/static/chunks/1052-7b89b0e3904e8d59.js","/_next/static/chunks/108-2e8932d28142673b.js","/_next/static/chunks/1241-5655702296e7dd84.js","/_next/static/chunks/1255-f456c2191ed027a9.js","/_next/static/chunks/1268-0264e778c6695ff2.js","/_next/static/chunks/1355-f1ffdab3908a791a.js","/_next/static/chunks/1364-7018158f31e46f4f.js","/_next/static/chunks/1486-f08db72ff8c8102e.js","/_next/static/chunks/1492-4019af2bbc20bc90.js","/_next/static/chunks/1920-b027cb1ccb62092e.js","/_next/static/chunks/2313-22ba5f5e8be23849.js","/_next/static/chunks/2391.d0eed6031ed46fa3.js","/_next/static/chunks/2619-04bc32f026a0d946.js","/_next/static/chunks/2951-70d71d808111cc0c.js","/_next/static/chunks/3031-05e03491b4b1667f.js","/_next/static/chunks/3098-a9682f52e91c87c3.js","/_next/static/chunks/3302-ef39ea704e30a775.js","/_next/static/chunks/3607-6c8e02830a37bb0a.js","/_next/static/chunks/3834-30e7975e971e9701.js","/_next/static/chunks/4089-a58074a5ade8288a.js","/_next/static/chunks/4121-7894a98e933750d7.js","/_next/static/chunks/4276-fd427ff2127da356.js","/_next/static/chunks/4491-a32f3a7440341b1a.js","/_next/static/chunks/4545-f516c64e572ac8dd.js","/_next/static/chunks/4581-21937c4a62b13f65.js","/_next/static/chunks/4825-ad3c895d3d13c2aa.js","/_next/static/chunks/4bd1b696-100b9d70ed4e49c1.js","/_next/static/chunks/5167-74c0a6b9921bf8f0.js","/_next/static/chunks/5263-feeb01b46d6367c5.js","/_next/static/chunks/5297-09c383dbb63edbab.js","/_next/static/chunks/5421.d04d2b84e94672b6.js","/_next/static/chunks/6415-5f4744e1e768f44f.js","/_next/static/chunks/6565-b07042e5544bc1ad.js","/_next/static/chunks/7289-ce2dea732489a2b2.js","/_next/static/chunks/738-b7558cbc768f72c8.js","/_next/static/chunks/8100-a763df309b7c6727.js","/_next/static/chunks/8109.46238d46d534e00a.js","/_next/static/chunks/8148-38d70818f38cdf7a.js","/_next/static/chunks/8703-e9f7e66ea11f412a.js","/_next/static/chunks/9053-20d8861f4f1b774e.js","/_next/static/chunks/9285-92773d100e6cec9f.js","/_next/static/chunks/9365-9c81016a17432514.js","/_next/static/chunks/9377-6a957f5d3b2b2b56.js","/_next/static/chunks/9557-4d5318c46d2a0bf9.js","/_next/static/chunks/9786-a06f7ee680158e56.js","/_next/static/chunks/9958-3313d9c45b17845d.js","/_next/static/chunks/app/(app)/crm/page-0927823db6e72a74.js","/_next/static/chunks/app/(app)/customer-records/page-8b044aef5c4e4240.js","/_next/static/chunks/app/(app)/dashboard/page-ef87ce86e78fb5dd.js","/_next/static/chunks/app/(app)/debts/page-0c58ce5c20aa74d4.js","/_next/static/chunks/app/(app)/finance/page-413c32dde85ad074.js","/_next/static/chunks/app/(app)/hr/page-20b6b456876be958.js","/_next/static/chunks/app/(app)/inventory/page-de05a6e2b8a01b01.js","/_next/static/chunks/app/(app)/labels/page-c755fdf8235c57b8.js","/_next/static/chunks/app/(app)/layout-9d8f5bee0681c4c3.js","/_next/static/chunks/app/(app)/logs/page-5f5cba3b1ed80a56.js","/_next/static/chunks/app/(app)/org/page-11ad14de0963d249.js","/_next/static/chunks/app/(app)/platform-activity/page-25090b20c32cdf7d.js","/_next/static/chunks/app/(app)/platform-analytics/page-a9cd732eb3585626.js","/_next/static/chunks/app/(app)/platform-companies/page-e5ee08fd537fce04.js","/_next/static/chunks/app/(app)/platform-errors/page-688dbd775d0ff20e.js","/_next/static/chunks/app/(app)/platform-finance/page-40166cb02e08ee3a.js","/_next/static/chunks/app/(app)/platform-leads/page-f6d33a20ff4715f0.js","/_next/static/chunks/app/(app)/platform-plans/page-a9b513f02223bb11.js","/_next/static/chunks/app/(app)/platform-registrations/page-ff2b40d1f2f8c4c1.js","/_next/static/chunks/app/(app)/platform-seo/page-c84b3b4c9846afc3.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-cc9ef6c5465333bb.js","/_next/static/chunks/app/(app)/platform-team/member/page-42e52852d3a99ac7.js","/_next/static/chunks/app/(app)/platform-team/page-2b103ea4dae8ff1f.js","/_next/static/chunks/app/(app)/platform/page-6c33a9ffc780880d.js","/_next/static/chunks/app/(app)/purchasing/page-88d29fdf63e6c60f.js","/_next/static/chunks/app/(app)/reports/page-f4c1fca2332c53d0.js","/_next/static/chunks/app/(app)/returns/page-541a69d442ef27c6.js","/_next/static/chunks/app/(app)/sales/page-0249784fb4076c55.js","/_next/static/chunks/app/(app)/settings/page-a924b3418cdd8c88.js","/_next/static/chunks/app/(app)/subscription/page-45659608a1e3d406.js","/_next/static/chunks/app/(app)/supplier-records/page-66d5a6e1d2578a5b.js","/_next/static/chunks/app/(app)/users/detail/page-d5f77b902a843540.js","/_next/static/chunks/app/(app)/users/page-d97f2e9622360d7f.js","/_next/static/chunks/app/(app)/web-orders/page-38ea7b6b2ad4b323.js","/_next/static/chunks/app/(app)/website/page-9279b78957deff97.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-bd87aef18740333a.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-20fa8c9a207080c6.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-cac967d853ebc519.js","/_next/static/chunks/app/(marketing)/en/guides/page-7aa8b2362baf0b0c.js","/_next/static/chunks/app/(marketing)/en/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/page-aa00e905c204fa28.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/pricing/page-dae09fb18d736bb3.js","/_next/static/chunks/app/(marketing)/en/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/product/page-633c05525de6b5d4.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-51687d723a1b99d8.js","/_next/static/chunks/app/(marketing)/en/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/page-3b01590d604e2631.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-328e1cc40fb113ce.js","/_next/static/chunks/app/(marketing)/en/solutions/page-19f4ae43dd522819.js","/_next/static/chunks/app/(marketing)/en/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/track/page-bf4457f34cc3c311.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-e1f8d60a41001c84.js","/_next/static/chunks/app/(marketing)/guides/page-c1c0d78db6f39dd6.js","/_next/static/chunks/app/(marketing)/layout-349711afe1cbe107.js","/_next/static/chunks/app/(marketing)/page-bed24d86575f4182.js","/_next/static/chunks/app/(marketing)/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/pricing/page-a7cd885ba1019daa.js","/_next/static/chunks/app/(marketing)/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/product/page-e39097844c31bbe3.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/hosting/page-f36ff1aa0c2ba24d.js","/_next/static/chunks/app/(marketing)/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/page-4f7dfcde7e8f9d1e.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-2497b9b5e86e3f73.js","/_next/static/chunks/app/(marketing)/solutions/page-10903659ed28f8c7.js","/_next/static/chunks/app/(marketing)/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/track/page-b1c4e8a0257dd03f.js","/_next/static/chunks/app/_not-found/page-60d88ff066648fad.js","/_next/static/chunks/app/activate-owner/layout-54d057f9743b8971.js","/_next/static/chunks/app/activate-owner/page-c085f2293a42bef8.js","/_next/static/chunks/app/forgot-password/layout-54d057f9743b8971.js","/_next/static/chunks/app/forgot-password/page-4c656e0d44ea4297.js","/_next/static/chunks/app/layout-2ffb3e4a31898c47.js","/_next/static/chunks/app/login/layout-54d057f9743b8971.js","/_next/static/chunks/app/login/page-d86a58d344a67142.js","/_next/static/chunks/app/reset-password/layout-54d057f9743b8971.js","/_next/static/chunks/app/reset-password/page-e668be0adc1d03ec.js","/_next/static/chunks/app/robots.txt/route-d306913d2552031f.js","/_next/static/chunks/app/sitemap.xml/route-d306913d2552031f.js","/_next/static/chunks/framework-4374eae96780d8a1.js","/_next/static/chunks/main-app-5fb8822d7098eca1.js","/_next/static/chunks/main-bad072af1eaab979.js","/_next/static/chunks/pages/_app-4b3fb5e477a0267f.js","/_next/static/chunks/pages/_error-c970d8b55ace1b48.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-d420b014f2948cde.js","/_next/static/css/7a64359ef257d35a.css","/_next/static/css/9996303cdb508b94.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
