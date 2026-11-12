(function (root) {
  // Cache names only. Register entries, the PIN, and backups stay in
  // localStorage / sessionStorage and are never read here.
  var CACHE_PREFIX = "digital-register-";
  var SKIP_WAITING = "SKIP_WAITING";

  function cacheNameFor(version) {
    return CACHE_PREFIX + String(version || "");
  }

  function cachesToDelete(keys, currentVersion) {
    var current = cacheNameFor(currentVersion);
    return (keys || []).filter(function (key) {
      return typeof key === "string" && key.indexOf(CACHE_PREFIX) === 0 && key !== current;
    });
  }

  // "prompt" — a newer worker is waiting and the page should ask before reloading.
  // "activate" — first install; take control without a reload.
  // "idle" — nothing to do.
  function updateAction(state) {
    var hasWaiting = !!(state && state.hasWaitingWorker);
    var controlled = !!(state && state.controllerExists);
    if (hasWaiting && controlled) return "prompt";
    if (hasWaiting && !controlled) return "activate";
    return "idle";
  }

  function matchShellAsset(pathname, assets) {
    var path = String(pathname || "");
    var list = assets || [];
    var i;
    var asset;
    var suffix;
    for (i = 0; i < list.length; i++) {
      asset = list[i];
      if (asset === "./" || asset === ".") {
        if (path.charAt(path.length - 1) === "/") return asset;
        continue;
      }
      suffix = String(asset).replace(/^\.\//, "");
      if (!suffix || suffix === "sw.js") continue;
      if (path === "/" + suffix || path.slice(-(suffix.length + 1)) === "/" + suffix) {
        return asset;
      }
    }
    return null;
  }

  root.PwaUpdate = {
    CACHE_PREFIX: CACHE_PREFIX,
    SKIP_WAITING: SKIP_WAITING,
    cacheNameFor: cacheNameFor,
    cachesToDelete: cachesToDelete,
    updateAction: updateAction,
    matchShellAsset: matchShellAsset,
  };
})(typeof self !== "undefined" ? self : globalThis);
