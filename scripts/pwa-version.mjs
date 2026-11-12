import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION_TOKEN = "__DR_VERSION__";

function metaRe() {
  return /(<meta name="dr-app-version" content=")([^"]+)(" \/>)/;
}

function spanRe() {
  return /(<span data-app-version>)([^<]*)(<\/span>)/g;
}

function swRe() {
  return /(const APP_VERSION = ")([^"]+)(";)/;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

export function listIconPaths() {
  return fs.readdirSync(path.join(ROOT, "icons"))
    .filter(function (name) { return !name.startsWith("."); })
    .sort()
    .map(function (name) { return "icons/" + name; });
}

export function extractVersions(indexHtml, swText) {
  const meta = indexHtml.match(metaRe());
  if (!meta) throw new Error("index.html is missing the dr-app-version meta tag");
  const spans = Array.from(indexHtml.matchAll(spanRe()), function (match) { return match[2]; });
  if (!spans.length) throw new Error("index.html is missing the version display");
  const sw = swText.match(swRe());
  if (!sw) throw new Error('sw.js is missing const APP_VERSION = "..."');
  return { meta: meta[2], spans: spans, sw: sw[2] };
}

export function normalizeIndex(html) {
  let metas = 0;
  const withMeta = html.replace(metaRe(), function (all, open, value, close) {
    metas += 1;
    return open + VERSION_TOKEN + close;
  });
  if (metas !== 1) throw new Error("expected exactly one dr-app-version meta tag");
  let spans = 0;
  const withSpans = withMeta.replace(spanRe(), function (all, open, value, close) {
    spans += 1;
    return open + VERSION_TOKEN + close;
  });
  if (spans < 1) throw new Error("expected at least one version display");
  return withSpans;
}

export function normalizeSw(text) {
  let count = 0;
  const next = text.replace(swRe(), function (all, open, value, close) {
    count += 1;
    return open + VERSION_TOKEN + close;
  });
  if (count !== 1) throw new Error("expected exactly one APP_VERSION in sw.js");
  return next;
}

export function fillIndex(html, version) {
  return normalizeIndex(html)
    .replace(metaRe(), function (all, open, value, close) { return open + version + close; })
    .replace(spanRe(), function (all, open, value, close) { return open + version + close; });
}

export function fillSw(text, version) {
  return normalizeSw(text).replace(swRe(), function (all, open, value, close) {
    return open + version + close;
  });
}

export function versionOfParts(parts) {
  const hash = crypto.createHash("sha256");
  parts.forEach(function (part) {
    hash.update(String(part.name));
    hash.update("\0");
    hash.update(part.bytes);
    hash.update("\0");
  });
  return hash.digest("hex").slice(0, 8);
}

export function normalizedPartsFromDisk() {
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const parts = [
    { name: "index.html", bytes: Buffer.from(normalizeIndex(index), "utf8") },
    { name: "sw.js", bytes: Buffer.from(normalizeSw(sw), "utf8") },
    { name: "pwa-update.js", bytes: read("pwa-update.js") },
    { name: "manifest.json", bytes: read("manifest.json") },
  ];
  listIconPaths().forEach(function (icon) {
    parts.push({ name: icon, bytes: read(icon) });
  });
  return { index: index, sw: sw, parts: parts };
}

export function expectedVersion() {
  return versionOfParts(normalizedPartsFromDisk().parts);
}

export function assertTreeStamped() {
  const disk = normalizedPartsFromDisk();
  const found = extractVersions(disk.index, disk.sw);
  const expected = versionOfParts(disk.parts);
  const unique = new Set([found.meta, found.sw].concat(found.spans));
  if (unique.size !== 1) {
    throw new Error("Version markers disagree: " + Array.from(unique).join(", "));
  }
  const current = found.sw;
  if (current === VERSION_TOKEN) {
    throw new Error("PWA version is still the placeholder. Run: node scripts/stamp-pwa-version.mjs");
  }
  if (!/^[0-9a-f]{8}$/.test(current)) {
    throw new Error("PWA version must be 8 hex characters. Run: node scripts/stamp-pwa-version.mjs");
  }
  if (current !== expected) {
    throw new Error(
      "PWA version is " + current + " but the app files hash to " + expected +
      ". Run: node scripts/stamp-pwa-version.mjs"
    );
  }
  return current;
}

export function stampWorkingTree() {
  const version = expectedVersion();
  const indexPath = path.join(ROOT, "index.html");
  const swPath = path.join(ROOT, "sw.js");
  fs.writeFileSync(indexPath, fillIndex(fs.readFileSync(indexPath, "utf8"), version));
  fs.writeFileSync(swPath, fillSw(fs.readFileSync(swPath, "utf8"), version));
  const stamped = assertTreeStamped();
  if (stamped !== version) {
    throw new Error("Stamped version " + stamped + " did not match " + version);
  }
  return stamped;
}
