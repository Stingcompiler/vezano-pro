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
const BUILD = "ydfDg5bw_PNsBoHs0HqEc";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/chunks/1052-2a1bf0da3316aaf1.js","/_next/static/chunks/108-b8d68bd70f901af9.js","/_next/static/chunks/1241-2966263a1eeb0fe3.js","/_next/static/chunks/1255-f456c2191ed027a9.js","/_next/static/chunks/1268-0264e778c6695ff2.js","/_next/static/chunks/1355-f1ffdab3908a791a.js","/_next/static/chunks/1364-7018158f31e46f4f.js","/_next/static/chunks/1486-f08db72ff8c8102e.js","/_next/static/chunks/1492-4019af2bbc20bc90.js","/_next/static/chunks/1920-6a7a9435d2ed45fa.js","/_next/static/chunks/2313-e0ec688361830e46.js","/_next/static/chunks/2391.d0eed6031ed46fa3.js","/_next/static/chunks/2619-04bc32f026a0d946.js","/_next/static/chunks/2951-ff3f5adc8d8e694d.js","/_next/static/chunks/3031-05e03491b4b1667f.js","/_next/static/chunks/3098-2f538e6b194d2737.js","/_next/static/chunks/3607-6c8e02830a37bb0a.js","/_next/static/chunks/3834-30e7975e971e9701.js","/_next/static/chunks/4121-7894a98e933750d7.js","/_next/static/chunks/4276-7d09535d773bc60d.js","/_next/static/chunks/4359-433b08dfeced4eee.js","/_next/static/chunks/4491-a32f3a7440341b1a.js","/_next/static/chunks/4545-f516c64e572ac8dd.js","/_next/static/chunks/4581-f33ec7695d8ad5f0.js","/_next/static/chunks/4825-ad3c895d3d13c2aa.js","/_next/static/chunks/4bd1b696-100b9d70ed4e49c1.js","/_next/static/chunks/5263-feeb01b46d6367c5.js","/_next/static/chunks/5297-0ca7824e8da65e49.js","/_next/static/chunks/5421.d04d2b84e94672b6.js","/_next/static/chunks/6415-7bc4f4136409d4dc.js","/_next/static/chunks/6502-d79118e418998f55.js","/_next/static/chunks/6565-b07042e5544bc1ad.js","/_next/static/chunks/7289-ce2dea732489a2b2.js","/_next/static/chunks/738-b7558cbc768f72c8.js","/_next/static/chunks/7897-df27dbb410ecfb4d.js","/_next/static/chunks/8100-a763df309b7c6727.js","/_next/static/chunks/8109.46238d46d534e00a.js","/_next/static/chunks/8148-38d70818f38cdf7a.js","/_next/static/chunks/8703-892fa615d9ea5afc.js","/_next/static/chunks/9053-20d8861f4f1b774e.js","/_next/static/chunks/9285-2d3e046b70dad50e.js","/_next/static/chunks/9365-9c81016a17432514.js","/_next/static/chunks/9377-091d6cbe98d514cc.js","/_next/static/chunks/9557-842d71f81cfb89a5.js","/_next/static/chunks/9786-a06f7ee680158e56.js","/_next/static/chunks/9958-3313d9c45b17845d.js","/_next/static/chunks/9969-fbb97a975a8c0656.js","/_next/static/chunks/app/(app)/crm/page-2fecf750f9baa342.js","/_next/static/chunks/app/(app)/customer-records/page-021555dbea45bba9.js","/_next/static/chunks/app/(app)/dashboard/page-91076565f7ce725a.js","/_next/static/chunks/app/(app)/debts/page-47047726e0e14239.js","/_next/static/chunks/app/(app)/finance/page-b097af207fb099c5.js","/_next/static/chunks/app/(app)/hr/page-049ed4d9317aedfe.js","/_next/static/chunks/app/(app)/inventory/page-a428e168131aaa36.js","/_next/static/chunks/app/(app)/labels/page-9eb4a52e92c3094b.js","/_next/static/chunks/app/(app)/layout-e8ae72a22bd1ee97.js","/_next/static/chunks/app/(app)/logs/page-27c8b551082c11fb.js","/_next/static/chunks/app/(app)/org/page-1717246c11f6f72d.js","/_next/static/chunks/app/(app)/platform-activity/page-cb0dc2f171399929.js","/_next/static/chunks/app/(app)/platform-analytics/page-b145dd6819c7cfb4.js","/_next/static/chunks/app/(app)/platform-companies/page-d0abe665b1689461.js","/_next/static/chunks/app/(app)/platform-errors/page-506cc9a320639fe5.js","/_next/static/chunks/app/(app)/platform-finance/page-ac16b72920432216.js","/_next/static/chunks/app/(app)/platform-leads/page-35b68ce7fb54f537.js","/_next/static/chunks/app/(app)/platform-plans/page-695cf420b65e3cdb.js","/_next/static/chunks/app/(app)/platform-registrations/page-31c736a1bfa4e2bf.js","/_next/static/chunks/app/(app)/platform-seo/page-f53cf25ff9623ffa.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-58c909a3d6b27b54.js","/_next/static/chunks/app/(app)/platform-team/member/page-ce4953c75e871954.js","/_next/static/chunks/app/(app)/platform-team/page-06896b074c2070ee.js","/_next/static/chunks/app/(app)/platform/page-ed61f1655eb2047c.js","/_next/static/chunks/app/(app)/purchasing/page-7570bd084ab213a3.js","/_next/static/chunks/app/(app)/reports/page-374b1177d882707d.js","/_next/static/chunks/app/(app)/returns/page-e99d75b037edbf5b.js","/_next/static/chunks/app/(app)/sales/page-10acca5c6d6422f8.js","/_next/static/chunks/app/(app)/settings/page-b655b149f9cdef92.js","/_next/static/chunks/app/(app)/subscription/page-14e4187eee798711.js","/_next/static/chunks/app/(app)/supplier-records/page-d4159f860713ec58.js","/_next/static/chunks/app/(app)/users/detail/page-a62205dc46f3d944.js","/_next/static/chunks/app/(app)/users/page-d1a58f60a6a19fa8.js","/_next/static/chunks/app/(app)/web-orders/page-a1a8346e68bf28bb.js","/_next/static/chunks/app/(app)/website/page-7783ef05ba82e4f1.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-1f4e431abf523a9d.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-a3479dc9190e6994.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-a92d45c754e132fe.js","/_next/static/chunks/app/(marketing)/en/guides/page-8e96a2d268095632.js","/_next/static/chunks/app/(marketing)/en/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/page-053f30f368523cf1.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/pricing/page-6a2e7e3575894bf1.js","/_next/static/chunks/app/(marketing)/en/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/product/page-2c60d33637f9d834.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-5a5f04e1619bcbc7.js","/_next/static/chunks/app/(marketing)/en/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/page-4935b90c477754e5.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-412e0bc53fa65846.js","/_next/static/chunks/app/(marketing)/en/solutions/page-5d56c449f55a980c.js","/_next/static/chunks/app/(marketing)/en/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/track/page-b3aeec0c28c9ba29.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-5b52e177c573762a.js","/_next/static/chunks/app/(marketing)/guides/page-ae6cd2564a781dec.js","/_next/static/chunks/app/(marketing)/layout-0e589f59b4e25218.js","/_next/static/chunks/app/(marketing)/page-5cab636f818f5aaf.js","/_next/static/chunks/app/(marketing)/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/pricing/page-7b1dcf3badf406a5.js","/_next/static/chunks/app/(marketing)/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/product/page-3c7a6581ee91c44c.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/hosting/page-405fa4da55b72faa.js","/_next/static/chunks/app/(marketing)/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/page-75bd38b01fdea19a.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-7ed597f2924e7fbd.js","/_next/static/chunks/app/(marketing)/solutions/page-3579793f503ea08a.js","/_next/static/chunks/app/(marketing)/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/track/page-e8839d1843a96a44.js","/_next/static/chunks/app/_not-found/page-93635a23c9f71518.js","/_next/static/chunks/app/activate-owner/layout-9ce45afc3ac202e4.js","/_next/static/chunks/app/activate-owner/page-578bd77dcbbe8e11.js","/_next/static/chunks/app/forgot-password/layout-9ce45afc3ac202e4.js","/_next/static/chunks/app/forgot-password/page-42676141c5db1a75.js","/_next/static/chunks/app/layout-d2ae693aa4f34259.js","/_next/static/chunks/app/login/layout-9ce45afc3ac202e4.js","/_next/static/chunks/app/login/page-e8311efe2f2903a8.js","/_next/static/chunks/app/reset-password/layout-9ce45afc3ac202e4.js","/_next/static/chunks/app/reset-password/page-c1d35dbcbccd4294.js","/_next/static/chunks/app/robots.txt/route-d306913d2552031f.js","/_next/static/chunks/app/sitemap.xml/route-d306913d2552031f.js","/_next/static/chunks/framework-4374eae96780d8a1.js","/_next/static/chunks/main-app-90de6f7ef5420c91.js","/_next/static/chunks/main-bad072af1eaab979.js","/_next/static/chunks/pages/_app-4b3fb5e477a0267f.js","/_next/static/chunks/pages/_error-c970d8b55ace1b48.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-379c4e5f8db9fa75.js","/_next/static/css/67981be5c89770d3.css","/_next/static/css/73dbdb0d6bacc093.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/_next/static/ydfDg5bw_PNsBoHs0HqEc/_buildManifest.js","/_next/static/ydfDg5bw_PNsBoHs0HqEc/_ssgManifest.js","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
