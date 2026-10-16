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
const BUILD = "p3EWk_nO1G-nVhCFBhrL7";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/chunks/1107-0d8aad9fba12801e.js","/_next/static/chunks/1114-ff54370b7c6779b9.js","/_next/static/chunks/1180-f5803c01bda69fae.js","/_next/static/chunks/133.e357378903806d97.js","/_next/static/chunks/1385-56bd58d03331dd49.js","/_next/static/chunks/1441-99ae0a50d4589ee8.js","/_next/static/chunks/1509.d7431b0b417670c1.js","/_next/static/chunks/1526-f16c99915a387307.js","/_next/static/chunks/153-93459b75d37d561f.js","/_next/static/chunks/1766-642f63598914907c.js","/_next/static/chunks/2094-c0019028a81a36b9.js","/_next/static/chunks/2439-52b478b07b4f7295.js","/_next/static/chunks/2748-bbf1949fe072dce7.js","/_next/static/chunks/2755-51b307fc5a105a6f.js","/_next/static/chunks/3233-ce3e3691ae126b22.js","/_next/static/chunks/4061.d53e13aac0ef212e.js","/_next/static/chunks/417-6aecdf03e7a78ceb.js","/_next/static/chunks/4927-f9e4f0aa46f8cfc1.js","/_next/static/chunks/5176-7172544fa969faa5.js","/_next/static/chunks/5226-8b6bb0c46048c962.js","/_next/static/chunks/5274-2172d2fc8f1c3eb8.js","/_next/static/chunks/5616-c702de6ff470c5c6.js","/_next/static/chunks/5633-dc1261fab0b67068.js","/_next/static/chunks/5793-3dec6a8397c01a0d.js","/_next/static/chunks/6048-0bf23e6faf02f3ca.js","/_next/static/chunks/6131-1599d45eb0900071.js","/_next/static/chunks/6159-d6b2bfa07c851f12.js","/_next/static/chunks/6336-927d0a9fa378571a.js","/_next/static/chunks/640-9d0b92376b3e8623.js","/_next/static/chunks/66-c6635a65022ae85a.js","/_next/static/chunks/6992-2b003668aa846a93.js","/_next/static/chunks/7395-dcb3b1a2830b69a2.js","/_next/static/chunks/7447-9bf98b821cd703a7.js","/_next/static/chunks/8039-2838b09635fc3830.js","/_next/static/chunks/8190-008b1bda80390bb3.js","/_next/static/chunks/828-9b0fbde3e8ff3993.js","/_next/static/chunks/8499-f941f644accf77f5.js","/_next/static/chunks/8758-2829e7b90c0828f2.js","/_next/static/chunks/8804-dd74105c04360390.js","/_next/static/chunks/908-88e7080bad65cc7d.js","/_next/static/chunks/96e575d4-ad22827a4801cd80.js","/_next/static/chunks/app/(app)/crm/page-2cfad81fffb882cb.js","/_next/static/chunks/app/(app)/customer-records/page-27693018e8e3753d.js","/_next/static/chunks/app/(app)/dashboard/page-8dc89a21a0b6d77c.js","/_next/static/chunks/app/(app)/debts/page-842c5969b35df96d.js","/_next/static/chunks/app/(app)/finance/page-c2f8a56dba9b7f65.js","/_next/static/chunks/app/(app)/hr/page-6f0e8b5a3161703b.js","/_next/static/chunks/app/(app)/inventory/page-773adb8d2d1ce6d4.js","/_next/static/chunks/app/(app)/labels/page-f88277c6eec9696d.js","/_next/static/chunks/app/(app)/layout-ced4af4535be382c.js","/_next/static/chunks/app/(app)/logs/page-57d3992447b012d3.js","/_next/static/chunks/app/(app)/org/page-4f5ebd58b7c77782.js","/_next/static/chunks/app/(app)/platform-activity/page-7d42576ad915ec6c.js","/_next/static/chunks/app/(app)/platform-analytics/page-ea74f32eb2a53619.js","/_next/static/chunks/app/(app)/platform-companies/page-d38b8edf5230b484.js","/_next/static/chunks/app/(app)/platform-errors/page-09329349de0b1c12.js","/_next/static/chunks/app/(app)/platform-finance/page-f7d1f8970d965268.js","/_next/static/chunks/app/(app)/platform-leads/page-d7033f81224a6dae.js","/_next/static/chunks/app/(app)/platform-plans/page-3c556a565e44eb4e.js","/_next/static/chunks/app/(app)/platform-registrations/page-7d09cf40d46473ef.js","/_next/static/chunks/app/(app)/platform-seo/page-007b470417298643.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-7a62cf6eb5d682cd.js","/_next/static/chunks/app/(app)/platform-team/member/page-62b8fa2b282c939f.js","/_next/static/chunks/app/(app)/platform-team/page-cbe0bd96b415bae9.js","/_next/static/chunks/app/(app)/platform/page-1a86ca820ac72a27.js","/_next/static/chunks/app/(app)/purchasing/page-9588113fc90c7c4c.js","/_next/static/chunks/app/(app)/reports/page-2427fbf56ad97364.js","/_next/static/chunks/app/(app)/returns/page-884fb2594d1d7b36.js","/_next/static/chunks/app/(app)/sales/page-fb793930756e5634.js","/_next/static/chunks/app/(app)/settings/page-3a994d5121fdbeda.js","/_next/static/chunks/app/(app)/subscription/page-74543737ec284bcc.js","/_next/static/chunks/app/(app)/supplier-records/page-69163e80cc1539de.js","/_next/static/chunks/app/(app)/users/detail/page-a74506291621910b.js","/_next/static/chunks/app/(app)/users/page-996cbf0b0e2a3aa5.js","/_next/static/chunks/app/(app)/web-orders/page-fa8f227efb158a1a.js","/_next/static/chunks/app/(app)/website/page-0b075eab4b5b0be9.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-fc4ab49092dc6282.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-6572c8e959a2383e.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-66f16b18fe636f4f.js","/_next/static/chunks/app/(marketing)/en/guides/page-8f79eb7565b2c59d.js","/_next/static/chunks/app/(marketing)/en/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/page-202b97d1ee0747e0.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/pricing/page-06b071ffa8af487e.js","/_next/static/chunks/app/(marketing)/en/product/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/product/page-e4bbed823bb3c3e5.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-13e459812d026053.js","/_next/static/chunks/app/(marketing)/en/register/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/register/page-450da8b337ba45f3.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-7e37f0f7ddbbb73c.js","/_next/static/chunks/app/(marketing)/en/solutions/page-03f58599d6ca3234.js","/_next/static/chunks/app/(marketing)/en/track/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/en/track/page-4ac171a95997aec7.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-bb1e6b3d0c98a775.js","/_next/static/chunks/app/(marketing)/guides/page-048c262e13e1669a.js","/_next/static/chunks/app/(marketing)/layout-ad9ad7f5be3ecbd1.js","/_next/static/chunks/app/(marketing)/page-55a63708badfc9c1.js","/_next/static/chunks/app/(marketing)/pricing/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/pricing/page-9b2f1411b31dc7d5.js","/_next/static/chunks/app/(marketing)/product/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/product/page-747931840c556739.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/register/hosting/page-556b9e19513ad4aa.js","/_next/static/chunks/app/(marketing)/register/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/register/page-1c00923cec253b6a.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-e665390e49b53e67.js","/_next/static/chunks/app/(marketing)/solutions/page-051ac5390eb7a1be.js","/_next/static/chunks/app/(marketing)/track/layout-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/(marketing)/track/page-ab53bc1d46dbde75.js","/_next/static/chunks/app/_not-found/page-02872063595e56ba.js","/_next/static/chunks/app/activate-owner/layout-6106357df40c4813.js","/_next/static/chunks/app/activate-owner/page-be5d8958185fece3.js","/_next/static/chunks/app/forgot-password/layout-6106357df40c4813.js","/_next/static/chunks/app/forgot-password/page-a46475d8d75cb268.js","/_next/static/chunks/app/layout-6d592d4cdd12563d.js","/_next/static/chunks/app/login/layout-6106357df40c4813.js","/_next/static/chunks/app/login/page-a111c4fe0283c908.js","/_next/static/chunks/app/reset-password/layout-6106357df40c4813.js","/_next/static/chunks/app/reset-password/page-696c33e25d808516.js","/_next/static/chunks/app/robots.txt/route-02bbfe4ce4a2fa73.js","/_next/static/chunks/app/sitemap.xml/route-02bbfe4ce4a2fa73.js","/_next/static/chunks/framework-2538a1a309c7ded1.js","/_next/static/chunks/main-66d334a0816c3ae2.js","/_next/static/chunks/main-app-edd7f657d3f2d64a.js","/_next/static/chunks/pages/_app-b845bdefa3b13e41.js","/_next/static/chunks/pages/_error-eebb0e8bb66b8a22.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-10d116d5106048f7.js","/_next/static/css/2db83111b0888de2.css","/_next/static/css/76dd4964b3594899.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/_next/static/p3EWk_nO1G-nVhCFBhrL7/_buildManifest.js","/_next/static/p3EWk_nO1G-nVhCFBhrL7/_ssgManifest.js","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
