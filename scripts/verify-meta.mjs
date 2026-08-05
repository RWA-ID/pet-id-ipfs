#!/usr/bin/env node
/**
 * Asserts the share-card wiring against the *built* HTML in out/.
 *
 * Both failure modes it guards against are invisible in the .tsx: Next replaces
 * `openGraph`/`twitter` instead of deep-merging them (so a page that restates a
 * title silently drops the inherited image), and a route that inherits the root
 * og:url announces itself as the homepage, which makes scrapers fold every page
 * into one cache entry.
 *
 * Usage: node scripts/verify-meta.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "out");

const ROUTES = [
  { file: "index.html",              path: "/",          card: "home",     index: true },
  { file: "register/index.html",     path: "/register/", card: "register", index: true },
  { file: "partner/index.html",      path: "/partner/",  card: "partner",  index: true },
  // /apply/ is a redirect to /partner/, so it deliberately points its canonical
  // and og:url at the destination and is noindex.
  { file: "apply/index.html",        path: "/partner/",  card: "apply",    index: false },
];

const SITE = "https://petid.eth.link";
let failures = 0;

const fail = (route, msg) => { console.error(`  ✗ ${route}: ${msg}`); failures++; };

const meta = (html, prop) => {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${prop}"[^>]*content="([^"]*)"`, "g");
  return [...html.matchAll(re)].map((m) => m[1]);
};

for (const route of ROUTES) {
  const full = join(OUT, route.file);
  if (!existsSync(full)) { fail(route.file, "not built"); continue; }
  const html = readFileSync(full, "utf8");

  const titles = [...html.matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1]);
  if (titles.length !== 1) fail(route.file, `expected 1 <title>, found ${titles.length}`);

  const canon = [...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/g)].map((m) => m[1]);
  if (canon.length !== 1) fail(route.file, `expected 1 canonical, found ${canon.length}`);
  else if (canon[0] !== `${SITE}${route.path}`) fail(route.file, `canonical is ${canon[0]}, expected ${SITE}${route.path}`);

  const ogUrl = meta(html, "og:url");
  if (ogUrl[0] !== `${SITE}${route.path}`) fail(route.file, `og:url is ${ogUrl[0] ?? "absent"}, expected ${SITE}${route.path}`);

  // The trap: these can vanish without any error when a page restates openGraph.
  const ogImg = meta(html, "og:image");
  const twImg = meta(html, "twitter:image");
  const want = `${SITE}/og/${route.card}.png`;
  if (ogImg[0] !== want) fail(route.file, `og:image is ${ogImg[0] ?? "absent"}, expected ${want}`);
  if (twImg[0] !== want) fail(route.file, `twitter:image is ${twImg[0] ?? "absent"}, expected ${want}`);
  if (!meta(html, "twitter:card")[0]) fail(route.file, "twitter:card absent");
  if (!meta(html, "og:image:alt")[0]) fail(route.file, "og:image:alt absent");

  // An absent robots tag means indexable.
  const robots = meta(html, "robots")[0] ?? "";
  const noindex = /noindex/.test(robots);
  if (route.index && noindex) fail(route.file, "unexpectedly noindex");
  if (!route.index && !noindex) fail(route.file, `expected noindex, robots="${robots}"`);

  if (!existsSync(join(OUT, "og", `${route.card}.png`))) fail(route.file, `out/og/${route.card}.png missing`);

  // Icons are declared by hand (not via app/icon.*), so nothing but this check
  // would catch a route that lost them.
  if (!/rel="icon"[^>]+href="\/favicon\.ico"/.test(html)) fail(route.file, "favicon.ico link absent");
  if (!/rel="apple-touch-icon"/.test(html)) fail(route.file, "apple-touch-icon link absent");

  if (!failures) console.log(`  ✓ ${route.file} — ${titles[0]?.slice(0, 52)}…`);
}

// The redirect has to survive the static export, not just the dev server.
const applyHtml = existsSync(join(OUT, "apply/index.html"))
  ? readFileSync(join(OUT, "apply/index.html"), "utf8") : "";
if (!/http-equiv="refresh"[^>]*\.\.\/partner\//.test(applyHtml))
  fail("apply/index.html", "relative meta-refresh to ../partner/ missing");

for (const asset of ["favicon.ico", "icon-512.png", "apple-touch-icon.png"]) {
  if (!existsSync(join(OUT, asset))) fail("icons", `out/${asset} missing`);
}

console.log(failures ? `\n${failures} problem(s) found.` : "\nAll routes verified.");
process.exit(failures ? 1 : 0);
