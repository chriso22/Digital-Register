importScripts("./pwa-update.js");

// Stamped from the app files by scripts/stamp-pwa-version.mjs.
// The browser only installs a new worker when this file changes, so the
// version below has to change on every release that should reach installed apps.
const APP_VERSION = "5c929b0f";
const CACHE_NAME = self.PwaUpdate.cacheNameFor(APP_VERSION);

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./pwa-update.js",
  "./icons/favicon-32.png",
  "./icons/favicon.ico",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
];

function storeResponse(response) {
  if (!response.redirected) return Promise.resolve(response);
  return response.blob().then(function (body) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  });
}

function precache() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(ASSETS.map(function (asset) {
      var url = new URL(asset, self.location.href).href;
      // cache: "reload" skips the HTTP cache. GitHub Pages keeps files for
      // several minutes, and a new worker must store the new files, not the old ones.
      return fetch(new Request(url, { cache: "reload", credentials: "same-origin" })).then(function (response) {
        if (!response || !response.ok) {
          throw new Error("Could not cache " + asset);
        }
        return storeResponse(response).then(function (stored) {
          return cache.put(url, stored);
        });
      });
    }));
  });
}

function serveNavigation(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    var indexUrl = new URL("./index.html", self.location.href).href;
    return cache.match(indexUrl).then(function (cached) {
      if (cached) return cached;
      return fetch(request);
    });
  });
}

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(request);
    });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(precache());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var stale = self.PwaUpdate.cachesToDelete(keys, APP_VERSION);
      return Promise.all(stale.map(function (key) { return caches.delete(key); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== self.PwaUpdate.SKIP_WAITING) return;
  self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  // Never intercept the worker script. The browser must be able to fetch a
  // new sw.js directly, or installed apps will stay on the old version.
  if (url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(serveNavigation(request));
    return;
  }

  if (!self.PwaUpdate.matchShellAsset(url.pathname, ASSETS)) return;
  event.respondWith(cacheFirst(request));
});
