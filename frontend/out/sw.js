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
const BUILD = "4SQeB4L5QlZzziViu9-vg";
const CACHE = `vezano-shell-${BUILD}`;
// Every screen of the app, so the person lands on the page they asked for
// with no network — never on a different one. Filled in at build time from
// the export; the list below is the floor the PWA manifest relies on.
const PRECACHE_PAGES = ["/", "/login/", "/dashboard/", "/sales/", "/inventory/", "/returns/"];
const PRECACHE_APP_PAGES = ["/activate-owner/","/crm/","/customer-records/","/dashboard/","/debts/","/finance/","/forgot-password/","/hr/","/inventory/","/labels/","/login/","/logs/","/org/","/platform-activity/","/platform-analytics/","/platform-companies/","/platform-errors/","/platform-finance/","/platform-leads/","/platform-plans/","/platform-registrations/","/platform-seo/","/platform-subscriptions/","/platform-team/","/platform-team/member/","/platform/","/purchasing/","/reports/","/reset-password/","/returns/","/sales/","/settings/","/subscription/","/supplier-records/","/track/","/users/","/users/detail/","/web-orders/","/website/"];
// Every hashed chunk, stylesheet and font of this build, plus the manifest
// and icons — filled in at build time from the export.
const PRECACHE_ASSETS = ["/_next/static/4SQeB4L5QlZzziViu9-vg/_buildManifest.js","/_next/static/4SQeB4L5QlZzziViu9-vg/_ssgManifest.js","/_next/static/chunks/1052-b6cda74ff411391b.js","/_next/static/chunks/1139-82f53bba64ceb16e.js","/_next/static/chunks/1255-f456c2191ed027a9.js","/_next/static/chunks/1256-ffbb7e33cc7314ea.js","/_next/static/chunks/1268-0264e778c6695ff2.js","/_next/static/chunks/1358-bff448d56b1ae20c.js","/_next/static/chunks/1492-9db59b2da71e9472.js","/_next/static/chunks/1624-8cda549b9792de24.js","/_next/static/chunks/2262-622d36d512aacf00.js","/_next/static/chunks/2313-bc4127279a1a4411.js","/_next/static/chunks/2358-9df259959c68975b.js","/_next/static/chunks/2391.d0eed6031ed46fa3.js","/_next/static/chunks/2951-ff3f5adc8d8e694d.js","/_next/static/chunks/3098-ab5eca3845de5063.js","/_next/static/chunks/3302-ef39ea704e30a775.js","/_next/static/chunks/358-ef69ee1bdc113e4d.js","/_next/static/chunks/3607-6c8e02830a37bb0a.js","/_next/static/chunks/4011-91ae694263eef881.js","/_next/static/chunks/4121-7894a98e933750d7.js","/_next/static/chunks/4491-a32f3a7440341b1a.js","/_next/static/chunks/4516-373cd5759a8d5015.js","/_next/static/chunks/4545-f516c64e572ac8dd.js","/_next/static/chunks/4779-fd54ed5b745a6bc2.js","/_next/static/chunks/4796-ddc6021c16d1db57.js","/_next/static/chunks/4825-ad3c895d3d13c2aa.js","/_next/static/chunks/4bd1b696-100b9d70ed4e49c1.js","/_next/static/chunks/5263-feeb01b46d6367c5.js","/_next/static/chunks/5421.d04d2b84e94672b6.js","/_next/static/chunks/6531-130d13e3f29f8bda.js","/_next/static/chunks/6565-6533f7fb9bf6d70c.js","/_next/static/chunks/7289-ce2dea732489a2b2.js","/_next/static/chunks/7403-2f34a813c5883580.js","/_next/static/chunks/8109.46238d46d534e00a.js","/_next/static/chunks/8599-d2c2d6e34ac7b42a.js","/_next/static/chunks/8703-d0b6fc5589fca124.js","/_next/static/chunks/9053-a0c3cb66a2c53d2d.js","/_next/static/chunks/9285-92773d100e6cec9f.js","/_next/static/chunks/9336-7ddae8218e4eff09.js","/_next/static/chunks/9562-63ccd8946b62e02b.js","/_next/static/chunks/9572-886ab4b096530d2a.js","/_next/static/chunks/9952-3ccb41d672eaf97d.js","/_next/static/chunks/app/(app)/crm/page-48a59a77ca5b2c9d.js","/_next/static/chunks/app/(app)/customer-records/page-c302acbac69724dd.js","/_next/static/chunks/app/(app)/dashboard/page-4fc55238dd21e8db.js","/_next/static/chunks/app/(app)/debts/page-a3d813da87b77fc5.js","/_next/static/chunks/app/(app)/finance/page-a188bde55889d9dd.js","/_next/static/chunks/app/(app)/hr/page-527d5a103b88d3e7.js","/_next/static/chunks/app/(app)/inventory/page-0d90fd81fa4861b4.js","/_next/static/chunks/app/(app)/labels/page-cb63dbc8b6e704f0.js","/_next/static/chunks/app/(app)/layout-8698eaa4f4b02daf.js","/_next/static/chunks/app/(app)/logs/page-e884c51edebc1096.js","/_next/static/chunks/app/(app)/org/page-8e1742d8ea7b2841.js","/_next/static/chunks/app/(app)/platform-activity/page-8fb87d8c1550ae6e.js","/_next/static/chunks/app/(app)/platform-analytics/page-5d375761e81d81dc.js","/_next/static/chunks/app/(app)/platform-companies/page-4d28e510a49b68e6.js","/_next/static/chunks/app/(app)/platform-errors/page-6c8266106ebc6407.js","/_next/static/chunks/app/(app)/platform-finance/page-9d2e2faf1f7985da.js","/_next/static/chunks/app/(app)/platform-leads/page-9335806170824c81.js","/_next/static/chunks/app/(app)/platform-plans/page-c46605c14b618aa1.js","/_next/static/chunks/app/(app)/platform-registrations/page-2de1d18e84aec0d4.js","/_next/static/chunks/app/(app)/platform-seo/page-92ca3d5e87ed5d26.js","/_next/static/chunks/app/(app)/platform-subscriptions/page-96b7f4ac1bad28aa.js","/_next/static/chunks/app/(app)/platform-team/member/page-1b9874790a0db483.js","/_next/static/chunks/app/(app)/platform-team/page-c30343dd0057759c.js","/_next/static/chunks/app/(app)/platform/page-c5c7eec0804a926b.js","/_next/static/chunks/app/(app)/purchasing/page-2af21d6d6b99f382.js","/_next/static/chunks/app/(app)/reports/page-e0586770f8e88bf4.js","/_next/static/chunks/app/(app)/returns/page-8a34e9df1bbc5351.js","/_next/static/chunks/app/(app)/sales/page-04b6cea4397eb0f9.js","/_next/static/chunks/app/(app)/settings/page-d71c53e4efd1d4ad.js","/_next/static/chunks/app/(app)/subscription/page-7b93b218e71bd65a.js","/_next/static/chunks/app/(app)/supplier-records/page-fde5353f6b60b052.js","/_next/static/chunks/app/(app)/users/detail/page-97fa5b3dc21ecc90.js","/_next/static/chunks/app/(app)/users/page-a2da3d847dca4ec2.js","/_next/static/chunks/app/(app)/web-orders/page-45b5650482cb467f.js","/_next/static/chunks/app/(app)/website/page-6cb2b0ac41c7c940.js","/_next/static/chunks/app/(marketing)/compare/[slug]/page-348db6a9bdaaf362.js","/_next/static/chunks/app/(marketing)/en/compare/[slug]/page-6bf42f135b2ba8c1.js","/_next/static/chunks/app/(marketing)/en/guides/[slug]/page-c8050ef80f38fa57.js","/_next/static/chunks/app/(marketing)/en/guides/page-eb30396fe915e0fb.js","/_next/static/chunks/app/(marketing)/en/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/page-bc49025ebf32c29a.js","/_next/static/chunks/app/(marketing)/en/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/pricing/page-589c388ebbd62bb8.js","/_next/static/chunks/app/(marketing)/en/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/product/page-85fdcc154a263e86.js","/_next/static/chunks/app/(marketing)/en/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/hosting/page-a0eb47480e0b326a.js","/_next/static/chunks/app/(marketing)/en/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/register/page-f8276b825c96919b.js","/_next/static/chunks/app/(marketing)/en/solutions/[slug]/page-e6d8a4033829aedd.js","/_next/static/chunks/app/(marketing)/en/solutions/page-fcfa2fd5f14eee6a.js","/_next/static/chunks/app/(marketing)/en/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/en/track/page-5841d6a8abef5028.js","/_next/static/chunks/app/(marketing)/guides/[slug]/page-489ab30f81c10178.js","/_next/static/chunks/app/(marketing)/guides/page-e62571b354aabd9e.js","/_next/static/chunks/app/(marketing)/layout-05c6f964d901566e.js","/_next/static/chunks/app/(marketing)/page-b2c5aaab11468578.js","/_next/static/chunks/app/(marketing)/pricing/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/pricing/page-fa03cbacbba992ad.js","/_next/static/chunks/app/(marketing)/product/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/product/page-716b29e712761c1c.js","/_next/static/chunks/app/(marketing)/register/hosting/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/hosting/page-f65e72587eda59eb.js","/_next/static/chunks/app/(marketing)/register/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/register/page-fed2850c6ed68636.js","/_next/static/chunks/app/(marketing)/solutions/[slug]/page-a51658f7ef50a24c.js","/_next/static/chunks/app/(marketing)/solutions/page-cdcbc8e88e2f32f8.js","/_next/static/chunks/app/(marketing)/track/layout-d306913d2552031f.js","/_next/static/chunks/app/(marketing)/track/page-5fb39f2d5724c50c.js","/_next/static/chunks/app/_not-found/page-6856aaa7b4923e11.js","/_next/static/chunks/app/activate-owner/layout-8455bd9a4cd771b4.js","/_next/static/chunks/app/activate-owner/page-b4cc294e831da6c1.js","/_next/static/chunks/app/forgot-password/layout-8455bd9a4cd771b4.js","/_next/static/chunks/app/forgot-password/page-e170cf408cf323f9.js","/_next/static/chunks/app/layout-98556d3476a29c08.js","/_next/static/chunks/app/login/layout-8455bd9a4cd771b4.js","/_next/static/chunks/app/login/page-d8f53370d4b71b1d.js","/_next/static/chunks/app/reset-password/layout-8455bd9a4cd771b4.js","/_next/static/chunks/app/reset-password/page-d698aa787be4e8a7.js","/_next/static/chunks/app/robots.txt/route-d306913d2552031f.js","/_next/static/chunks/app/sitemap.xml/route-d306913d2552031f.js","/_next/static/chunks/framework-4374eae96780d8a1.js","/_next/static/chunks/main-app-8aaae7190b3dc8e0.js","/_next/static/chunks/main-bad072af1eaab979.js","/_next/static/chunks/pages/_app-4b3fb5e477a0267f.js","/_next/static/chunks/pages/_error-c970d8b55ace1b48.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-d420b014f2948cde.js","/_next/static/css/79745806ec2a976c.css","/_next/static/css/9996303cdb508b94.css","/_next/static/media/011e180705008d6f.woff2","/_next/static/media/19cfc7226ec3afaa.woff2","/_next/static/media/1ebb550cd0a67fc6.p.woff2","/_next/static/media/21350d82a1f187e9.woff2","/_next/static/media/3dc379dc9b5dec12.p.woff2","/_next/static/media/58c726479f69cacd.woff2","/_next/static/media/58f386aa6b1a2a92.woff2","/_next/static/media/63a79a6cf340c5d2.p.woff2","/_next/static/media/7ba5fb2a8c88521c.woff2","/_next/static/media/8e9860b6e62d6359.woff2","/_next/static/media/92eeb95d069020cc.woff2","/_next/static/media/98e207f02528a563.p.woff2","/_next/static/media/99dcf268bda04fe5.woff2","/_next/static/media/ba9851c3c22cd980.woff2","/_next/static/media/bd9c8c62ffadd9dd.p.woff2","/_next/static/media/c5f10e9e72d35c52.woff2","/_next/static/media/c5fe6dc8356a8c31.woff2","/_next/static/media/cc8b755e9c1ba115.woff2","/_next/static/media/ce401babc0566bc1.woff2","/_next/static/media/d29838c109ef09b4.woff2","/_next/static/media/d3ebbfd689654d3a.p.woff2","/_next/static/media/dd994fbf464986f0.p.woff2","/_next/static/media/df0a9ae256c0569c.woff2","/_next/static/media/e40af3453d7c920a.woff2","/_next/static/media/e4af272ccee01ff0.p.woff2","/_next/static/media/e97026df054cf2a3.woff2","/_next/static/media/ef4d5661765d0e49.woff2","/_next/static/media/f15f45d13243c643.woff2","/_next/static/media/f952393b67d608ec.p.woff2","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-192.png","/icons/icon-maskable-512.png","/manifest.webmanifest"];
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
