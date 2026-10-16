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
const BUILD = "ivTt5HiiaGQlfXQOd-YLh";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/chunks/1107-0d8aad9fba12801e.js","/_next/static/chunks/1114-ff54370b7c6779b9.js","/_next/static/chunks/1180-f5803c01bda69fae.js","/_next/static/chunks/133.e357378903806d97.js","/_next/static/chunks/1385-56bd58d03331dd49.js","/_next/static/chunks/1441-99ae0a50d4589ee8.js","/_next/static/chunks/1509.d7431b0b417670c1.js","/_next/static/chunks/153-93459b75d37d561f.js","/_next/static/chunks/1766-642f63598914907c.js","/_next/static/chunks/2094-c0019028a81a36b9.js","/_next/static/chunks/2439-52b478b07b4f7295.js","/_next/static/chunks/2748-1785844b301613cb.js","/_next/static/chunks/2755-51b307fc5a105a6f.js","/_next/static/chunks/3233-ce3e3691ae126b22.js","/_next/static/chunks/3754-addd5e82c1a257a6.js","/_next/static/chunks/4061.d53e13aac0ef212e.js","/_next/static/chunks/417-6aecdf03e7a78ceb.js","/_next/static/chunks/4927-f9e4f0aa46f8cfc1.js","/_next/static/chunks/5176-7172544fa969faa5.js","/_next/static/chunks/5226-8b6bb0c46048c962.js","/_next/static/chunks/5274-2172d2fc8f1c3eb8.js","/_next/static/chunks/5616-c702de6ff470c5c6.js","/_next/static/chunks/5633-dc1261fab0b67068.js","/_next/static/chunks/5793-3dec6a8397c01a0d.js","/_next/static/chunks/6048-0bf23e6faf02f3ca.js","/_next/static/chunks/6131-1599d45eb0900071.js","/_next/static/chunks/6159-d6b2bfa07c851f12.js","/_next/static/chunks/6336-927d0a9fa378571a.js","/_next/static/chunks/640-083ad5e1ffa949b6.js","/_next/static/chunks/66-c6635a65022ae85a.js","/_next/static/chunks/6992-2b003668aa846a93.js","/_next/static/chunks/7395-dcb3b1a2830b69a2.js","/_next/static/chunks/7447-9bf98b821cd703a7.js","/_next/static/chunks/8039-2838b09635fc3830.js","/_next/static/chunks/8190-008b1bda80390bb3.js","/_next/static/chunks/828-9b0fbde3e8ff3993.js","/_next/static/chunks/8499-f941f644accf77f5.js","/_next/static/chunks/8758-2829e7b90c0828f2.js","/_next/static/chunks/8804-dd74105c04360390.js","/_next/static/chunks/908-88e7080bad65cc7d.js","/_next/static/chunks/96e575d4-ad22827a4801cd80.js","/_next/static/chunks/app/(app)/crm/page-0f081ab59fff4fc1.js","/_next/static/chunks/app/(app)/customer-records/page-427887605ca833c2.js","/_next/static/chunks/app/(app)/dashboard/page-8c6e447a9045a919.js","/_next/static/chunks/app/(app)/debts/page-c74573723325932b.js","/_next/static/chunks/app/(app)/finance/page-bc7f9602e6d66286.js","/_next/static/chunks/app/(app)/hr/page-697054af433dd02a.js","/_next/static/chunks/app/(app)/inventory/page-6319d01320e5d2fb.js","/_next/static/chunks/app/(app)/labels/page-ec801d56b932e664.js","/_next/static/chunks/app/(app)/layout-1fea014df85dc48e.js","/_next/static/chunks/app/(app)/logs/page-7ba96942e2a7cdb0.js","/_next/static/chunks/app/(app)/org/page-129fe7fb959622d0.js","/_next/static/chunks/app/(app)/platform-activity/page-a441a9f6f4e38eaa.js","/_next/static/chunks/app/(app)/platform-analytics/page-5c263a58194a939e.js","/_next/static/chunks/app/(app)/platform-companies/page-3b868fafe61e41d5.js","/_next/static/chunks/app/(app)/platform-errors/page-ff853fad0a3118e0.js","/_next/static/chunks/app/(app)/platform-finance/page-b008817d65471f2e.js","/_next/static/chunks/app/(app)/platform-leads/page-7232d1af4deaec3a.js","/_next/static/chunks/app/(app)/platform-plans/page-cd2f5bb7beaa44c7.js","/_next/static/chunks/app/(app)/platform-registrations/page-6be4174a9df7ba8c.js","/_next/static/chunks/app/(app)/platform-seo/page-68dc40e6cdae2ac1.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-7563e6d2e8ec9c49.js","/_next/static/chunks/app/(app)/platform-team/member/page-f96585c9316d709b.js","/_next/static/chunks/app/(app)/platform-team/page-509487e063b7ba27.js","/_next/static/chunks/app/(app)/platform/page-595369e4069da6a4.js","/_next/static/chunks/app/(app)/purchasing/page-29858d94b80504b4.js","/_next/static/chunks/app/(app)/reports/page-50724a26ac245a94.js","/_next/static/chunks/app/(app)/returns/page-4a67e3256d76efea.js","/_next/static/chunks/app/(app)/sales/page-23459b45f190b035.js","/_next/static/chunks/app/(app)/settings/page-4600ebf47c3e3e35.js","/_next/static/chunks/app/(app)/subscription/page-3655522bb8cf7927.js","/_next/static/chunks/app/(app)/supplier-records/page-551529ee5ca0aea5.js","/_next/static/chunks/app/(app)/users/detail/page-98dc5fce6d3f808e.js","/_next/static/chunks/app/(app)/users/page-ee2a434fea53c757.js","/_next/static/chunks/app/(app)/web-orders/page-66fcc8116cb1535c.js","/_next/static/chunks/app/(app)/website/page-02c43a98a307d126.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-b2de4f7329ae7dbf.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-7d4f63057976a9eb.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-fc5a0651e0ce9027.js","/_next/static/chunks/app/(marketing)/en/guides/page-3fb4e0f460709710.js","/_next/static/chunks/app/(marketing)/en/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/page-47816c0eb51c0697.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/pricing/page-eadad57258182bc7.js","/_next/static/chunks/app/(marketing)/en/product/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/product/page-756544e47198d154.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-9035dfbac14d7fce.js","/_next/static/chunks/app/(marketing)/en/register/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/register/page-cb6ecb46ac910a51.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-37160d62488cd345.js","/_next/static/chunks/app/(marketing)/en/solutions/page-9b98093008f10f3b.js","/_next/static/chunks/app/(marketing)/en/track/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/track/page-b01f121407cb2368.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-4cfe97c856d9ef2b.js","/_next/static/chunks/app/(marketing)/guides/page-5e49d3e325b0bcd1.js","/_next/static/chunks/app/(marketing)/layout-de557fde4695c114.js","/_next/static/chunks/app/(marketing)/page-a9fc8713399bd408.js","/_next/static/chunks/app/(marketing)/pricing/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/pricing/page-bd1b6f5a6c859663.js","/_next/static/chunks/app/(marketing)/product/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/product/page-7b1e850cf9313d17.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/register/hosting/page-32a336d93f066f7e.js","/_next/static/chunks/app/(marketing)/register/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/register/page-b68ba51ee4d883fc.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-bee396f0a4158cdc.js","/_next/static/chunks/app/(marketing)/solutions/page-8526cc2813d3bc7d.js","/_next/static/chunks/app/(marketing)/track/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/track/page-4159ccb5ee5305a0.js","/_next/static/chunks/app/_not-found/page-02872063595e56ba.js","/_next/static/chunks/app/activate-owner/layout-5bb56de0cbe1b100.js","/_next/static/chunks/app/activate-owner/page-27a07ba187a3798d.js","/_next/static/chunks/app/forgot-password/layout-5bb56de0cbe1b100.js","/_next/static/chunks/app/forgot-password/page-7b0022454e026f22.js","/_next/static/chunks/app/layout-4025bafaf21afa2e.js","/_next/static/chunks/app/login/layout-5bb56de0cbe1b100.js","/_next/static/chunks/app/login/page-293113ab95ae5555.js","/_next/static/chunks/app/reset-password/layout-5bb56de0cbe1b100.js","/_next/static/chunks/app/reset-password/page-5ac9a244d7e5dd60.js","/_next/static/chunks/app/robots.txt/route-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/sitemap.xml/route-02bbfe4ce4a2fa73.js","/_next/static/chunks/framework-2538a1a309c7ded1.js","/_next/static/chunks/main-66d334a0816c3ae2.js","/_next/static/chunks/main-app-edd7f657d3f2d64a.js","/_next/static/chunks/pages/_app-b845bdefa3b13e41.js","/_next/static/chunks/pages/_error-eebb0e8bb66b8a22.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-6418547dec64183e.js","/_next/static/css/a77620c5092f47aa.css","/_next/static/css/f0228bff9bd94196.css","/_next/static/ivTt5HiiaGQlfXQOd-YLh/_buildManifest.js","/_next/static/ivTt5HiiaGQlfXQOd-YLh/_ssgManifest.js","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
