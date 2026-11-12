import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  assertTreeStamped,
  expectedVersion,
  extractVersions,
  fillIndex,
  fillSw,
  listIconPaths,
  versionOfParts,
  normalizeIndex,
  normalizeSw,
  normalizedPartsFromDisk,
  VERSION_TOKEN,
} from "../scripts/pwa-version.mjs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const updateSource = fs.readFileSync(new URL("../pwa-update.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

const sandbox = {};
vm.runInNewContext(updateSource, sandbox);
const PwaUpdate = sandbox.PwaUpdate;
assert.ok(PwaUpdate, "PwaUpdate should be defined");

const registerScript = html.match(/<script id="pwa-register">([\s\S]*?)<\/script>/);
assert.ok(registerScript, "update registration should live in index.html");

test("a waiting worker prompts only when the page is already controlled", () => {
  assert.equal(PwaUpdate.updateAction({ controllerExists: true, hasWaitingWorker: true }), "prompt");
  assert.equal(PwaUpdate.updateAction({ controllerExists: false, hasWaitingWorker: true }), "activate");
  assert.equal(PwaUpdate.updateAction({ controllerExists: true, hasWaitingWorker: false }), "idle");
  assert.equal(PwaUpdate.updateAction({ controllerExists: false, hasWaitingWorker: false }), "idle");
  assert.equal(PwaUpdate.updateAction(null), "idle");
});

test("old version caches are removed and other caches are left alone", () => {
  const current = "abc12345";
  assert.equal(PwaUpdate.cacheNameFor(current), "digital-register-abc12345");
  assert.deepEqual(
    PwaUpdate.cachesToDelete([
      "digital-register-old11111",
      "digital-register-abc12345",
      "digital-register-older222",
      "workbox-precache",
      "digital-register",
    ], current),
    ["digital-register-old11111", "digital-register-older222"]
  );
  assert.deepEqual(Array.from(PwaUpdate.cachesToDelete(null, current)), []);
});

test("shell matching finds the app files and ignores the worker script", () => {
  const assets = [
    "./",
    "./index.html",
    "./manifest.json",
    "./pwa-update.js",
    "./icons/icon-192.png",
    "./sw.js",
  ];
  assert.equal(PwaUpdate.matchShellAsset("/Digital-Register/", assets), "./");
  assert.equal(PwaUpdate.matchShellAsset("/Digital-Register/index.html", assets), "./index.html");
  assert.equal(PwaUpdate.matchShellAsset("/index.html", assets), "./index.html");
  assert.equal(PwaUpdate.matchShellAsset("/Digital-Register/icons/icon-192.png", assets), "./icons/icon-192.png");
  assert.equal(PwaUpdate.matchShellAsset("/Digital-Register/sw.js", assets), null);
  assert.equal(PwaUpdate.matchShellAsset("/Digital-Register/icons/icon-192.png.bak", assets), null);
});

test("the worker caches a versioned shell and deletes stale caches", () => {
  assert.match(sw, /importScripts\("\.\/pwa-update\.js"\)/);
  assert.match(sw, /const APP_VERSION = "[^"]+";/);
  assert.match(sw, /PwaUpdate\.cacheNameFor\(APP_VERSION\)/);
  assert.match(sw, /PwaUpdate\.cachesToDelete\(keys, APP_VERSION\)/);
  assert.match(sw, /caches\.delete\(key\)/);
  assert.match(sw, /cache:\s*"reload"/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /event\.data\.type !== self\.PwaUpdate\.SKIP_WAITING/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.pathname\.endsWith\("\/sw\.js"\)/);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.doesNotMatch(sw, /localStorage|sessionStorage|indexedDB|digital-register-v1|PIN_KEY/);
  assert.doesNotMatch(sw, /caches\.delete\(\s*\)/);
});

test("every icon file is part of the cached shell", () => {
  listIconPaths().forEach(function (icon) {
    assert.match(sw, new RegExp(icon.replace(".", "\\.")), icon + " should be precached");
  });
  assert.doesNotMatch(sw, /"\.\/sw\.js"/);
});

test("the page checks on open and when returning, then reloads only after a tap", () => {
  const script = registerScript[1];
  assert.match(html, /New version available\. Tap to update/);
  assert.match(script, /serviceWorker\.register\("\.\/sw\.js"/);
  assert.match(script, /updateViaCache:\s*"none"/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /pageshow/);
  assert.match(script, /registration\.update\(\)/);
  assert.match(script, /digital-register-flush/);
  assert.match(script, /update-ready/);
  assert.match(html, /body\.update-ready/);
  assert.match(html, /addEventListener\("digital-register-flush", flushPersist\)/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|caches\.delete|STORAGE_KEY|PIN_KEY/);
});

test("saved register data is still stored under the same keys", () => {
  assert.match(html, /const STORAGE_KEY = "digital-register-v1"/);
  assert.match(html, /const USER_KEY = "digital-register-user-v1"/);
  assert.match(html, /const PIN_KEY = "digital-register-pin-v1"/);
  assert.match(html, /const UNLOCK_SESSION_KEY = "digital-register-unlocked-v1"/);
});

test("the installed app keeps the same manifest identity", () => {
  assert.equal(manifest.id, "/Digital-Register/");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
});

test("the stamped version matches the app files and is shown in the page", () => {
  const version = assertTreeStamped();
  assert.equal(version, expectedVersion());
  assert.match(version, /^[0-9a-f]{8}$/);
  const found = extractVersions(html, sw);
  assert.equal(found.meta, version);
  assert.equal(found.sw, version);
  assert.deepEqual(found.spans, [version, version]);
  assert.match(html, /<p class="app-version">Version <span data-app-version>/);
});

test("rewriting the version does not change the hash, and page edits do", () => {
  const disk = normalizedPartsFromDisk();
  const version = expectedVersion();
  assert.equal(normalizeIndex(fillIndex(disk.index, "1234abcd")), normalizeIndex(disk.index));
  assert.equal(normalizeSw(fillSw(disk.sw, "1234abcd")), normalizeSw(disk.sw));
  assert.equal(normalizeIndex(fillIndex(disk.index, VERSION_TOKEN)), normalizeIndex(disk.index));

  const edited = disk.parts.map(function (part) {
    if (part.name !== "index.html") return part;
    return { name: part.name, bytes: Buffer.from(part.bytes.toString("utf8") + "\n<!-- changed -->", "utf8") };
  });
  assert.notEqual(versionOfParts(edited), version);
});
