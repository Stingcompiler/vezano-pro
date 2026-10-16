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
const BUILD = "-gYlbkX9e898PytECrqsa";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/-gYlbkX9e898PytECrqsa/_buildManifest.js","/_next/static/-gYlbkX9e898PytECrqsa/_ssgManifest.js","/_next/static/chunks/1589-ef4abcc1e6980f41.js","/_next/static/chunks/1827-aab063ed94784137.js","/_next/static/chunks/191-46abaffba422d944.js","/_next/static/chunks/2489-112b14978a1cc9d4.js","/_next/static/chunks/2591-2e367243e3ce64f3.js","/_next/static/chunks/2874-c570197b79b0e2e7.js","/_next/static/chunks/2964-23b88ee292490b87.js","/_next/static/chunks/3581.78e1b6df1745134b.js","/_next/static/chunks/3778-a6af1c00f3ffcf6f.js","/_next/static/chunks/3852-44516f7b21ea768a.js","/_next/static/chunks/3997-db671292ebbb3090.js","/_next/static/chunks/4137-1effebd236984e4d.js","/_next/static/chunks/4202-cc3801d3dd458894.js","/_next/static/chunks/4519-2298860e9c7071dc.js","/_next/static/chunks/459-2b4139cdae4b8c6b.js","/_next/static/chunks/4742-f4a73f1ee431bc56.js","/_next/static/chunks/481.f23ac2d6592dc09f.js","/_next/static/chunks/482-549d676f4b392b62.js","/_next/static/chunks/5062-17e7e2ddc0ea052d.js","/_next/static/chunks/5477-d4a68b113b2b83b6.js","/_next/static/chunks/5489-6f68fb806af123c2.js","/_next/static/chunks/5528-85f19284d63ec940.js","/_next/static/chunks/554-b7be2c216b1c8e5a.js","/_next/static/chunks/57-64b6e3a66bb30dcf.js","/_next/static/chunks/5732-6c0cf17f964f097a.js","/_next/static/chunks/6044-b0c72bd49337a52c.js","/_next/static/chunks/6504-bdeadbcae0c8b8ab.js","/_next/static/chunks/7110-07875f2e17798b39.js","/_next/static/chunks/7142-fff89a93b795fe43.js","/_next/static/chunks/7466-9efd749954e79b17.js","/_next/static/chunks/7553-b688d66edffd22eb.js","/_next/static/chunks/7556-443f7327c0e1889b.js","/_next/static/chunks/7845-0cd673c477d3bbe2.js","/_next/static/chunks/823-3f33dae2cf250be8.js","/_next/static/chunks/8941.c4ac74574d9e9392.js","/_next/static/chunks/8973-c1f552e44b740d04.js","/_next/static/chunks/9182cbba-76e08575992072a7.js","/_next/static/chunks/9263-aca4d39e2a077bb8.js","/_next/static/chunks/9849-c9faa66238072328.js","/_next/static/chunks/9852-b9dbeeffa5b676f6.js","/_next/static/chunks/9857-0d500c10b4583a3c.js","/_next/static/chunks/app/(app)/crm/page-e148cf37b97f7069.js","/_next/static/chunks/app/(app)/customer-records/page-3233b63e650d002c.js","/_next/static/chunks/app/(app)/dashboard/page-c910281718d34b09.js","/_next/static/chunks/app/(app)/debts/page-d3101fc5e695ac1a.js","/_next/static/chunks/app/(app)/finance/page-1772d50f7bc47776.js","/_next/static/chunks/app/(app)/hr/page-3325933a8ff7ceaf.js","/_next/static/chunks/app/(app)/inventory/page-cb83beab00cd73f5.js","/_next/static/chunks/app/(app)/labels/page-4df8f42826e4afc3.js","/_next/static/chunks/app/(app)/layout-1f61a184e45cd303.js","/_next/static/chunks/app/(app)/logs/page-26848a6ecc3dab82.js","/_next/static/chunks/app/(app)/org/page-10ca64625ce05c29.js","/_next/static/chunks/app/(app)/platform-activity/page-b41e62142725227d.js","/_next/static/chunks/app/(app)/platform-analytics/page-54540bef89835cc8.js","/_next/static/chunks/app/(app)/platform-companies/page-3b5c0630202ede62.js","/_next/static/chunks/app/(app)/platform-errors/page-2bd584e167c4efd8.js","/_next/static/chunks/app/(app)/platform-finance/page-ce6df41635bc4e01.js","/_next/static/chunks/app/(app)/platform-leads/page-5282db95f6c7ca2b.js","/_next/static/chunks/app/(app)/platform-plans/page-ac06e0ac1579399e.js","/_next/static/chunks/app/(app)/platform-registrations/page-0badc5e7a10b341d.js","/_next/static/chunks/app/(app)/platform-seo/page-461af1d045f0b125.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-c4591bd70d62d761.js","/_next/static/chunks/app/(app)/platform-team/member/page-15a8fa41cb3b73f7.js","/_next/static/chunks/app/(app)/platform-team/page-0218ac5201ed9364.js","/_next/static/chunks/app/(app)/platform/page-276936607c1f1eab.js","/_next/static/chunks/app/(app)/purchasing/page-2c29a828925f220f.js","/_next/static/chunks/app/(app)/reports/page-771e746c645cd6e9.js","/_next/static/chunks/app/(app)/returns/page-c73df845f9b448b4.js","/_next/static/chunks/app/(app)/sales/page-b649b89aea9c4bdc.js","/_next/static/chunks/app/(app)/settings/page-fef847f3cc27d3a4.js","/_next/static/chunks/app/(app)/subscription/page-68a1f8fa86066b06.js","/_next/static/chunks/app/(app)/supplier-records/page-39e186294c91a111.js","/_next/static/chunks/app/(app)/users/detail/page-721c7ba5386c4386.js","/_next/static/chunks/app/(app)/users/page-9cd51c9e97c7fcd5.js","/_next/static/chunks/app/(app)/web-orders/page-36123b89532afec3.js","/_next/static/chunks/app/(app)/website/page-5e88215fe852230d.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-e942312017fe5d11.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-663f10b053cd1e64.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-9901328b9ebd7c6e.js","/_next/static/chunks/app/(marketing)/en/guides/page-d542b6775531852a.js","/_next/static/chunks/app/(marketing)/en/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/page-5569695e60957df7.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/pricing/page-905c27d447e978bb.js","/_next/static/chunks/app/(marketing)/en/product/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/product/page-23d9dea51fefea10.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-e70954727ca8988f.js","/_next/static/chunks/app/(marketing)/en/register/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/register/page-18e96778dcc987bc.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-f58b7ffb2e0ec354.js","/_next/static/chunks/app/(marketing)/en/solutions/page-4c27d5006c7d5f34.js","/_next/static/chunks/app/(marketing)/en/track/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/en/track/page-930bcee268614821.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-295667bbe0537a2b.js","/_next/static/chunks/app/(marketing)/guides/page-ba61b988574faa30.js","/_next/static/chunks/app/(marketing)/layout-eabda875b3867098.js","/_next/static/chunks/app/(marketing)/page-4b04c227d4f92a67.js","/_next/static/chunks/app/(marketing)/pricing/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/pricing/page-c99d1322cf7e9b25.js","/_next/static/chunks/app/(marketing)/product/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/product/page-c3a6a6cdc76d8742.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/register/hosting/page-d4e6f83fea72043d.js","/_next/static/chunks/app/(marketing)/register/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/register/page-e970f0036b6c5602.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-c6f41bde9f23bc80.js","/_next/static/chunks/app/(marketing)/solutions/page-7c99119f13838463.js","/_next/static/chunks/app/(marketing)/track/layout-6539258fe933c511.js","/_next/static/chunks/app/(marketing)/track/page-42bc2f8383e68ec6.js","/_next/static/chunks/app/_not-found/page-05f7e0a8fcd109a2.js","/_next/static/chunks/app/activate-owner/layout-d8fa82ba7816b7f3.js","/_next/static/chunks/app/activate-owner/page-7da06f077bd1d2fc.js","/_next/static/chunks/app/forgot-password/layout-d8fa82ba7816b7f3.js","/_next/static/chunks/app/forgot-password/page-261d110e31c31634.js","/_next/static/chunks/app/layout-395370ec14cde6ae.js","/_next/static/chunks/app/login/layout-d8fa82ba7816b7f3.js","/_next/static/chunks/app/login/page-325c2d4ec90c5d9f.js","/_next/static/chunks/app/reset-password/layout-d8fa82ba7816b7f3.js","/_next/static/chunks/app/reset-password/page-5994d8e43d2b9113.js","/_next/static/chunks/app/robots.txt/route-6539258fe933c511.js","/_next/static/chunks/app/sitemap.xml/route-6539258fe933c511.js","/_next/static/chunks/framework-b177d99568106957.js","/_next/static/chunks/main-app-262091bea5fead7b.js","/_next/static/chunks/main-f2ad74c2f4fa2aeb.js","/_next/static/chunks/pages/_app-7c7525d0f06312eb.js","/_next/static/chunks/pages/_error-7a8736c6ba765c80.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-2ca1c87b9a3ec4f9.js","/_next/static/css/a6d401e24f8cd5bb.css","/_next/static/css/d2546fbfc749abb7.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
