#!/usr/bin/env node
/**
 * Fails if a Server module imports a plain constant (UPPER_CASE export) from a
 * "use client" module. Server code then receives a client *reference*, not
 * the value — no build or type error, just undefined at runtime. This bit us
 * twice (stadium CATEGORY_META, compare SERIES_COLORS). Put shared constants
 * in a non-client module instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

const root = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = new Map();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.set(p.split(sep).join("/"), readFileSync(p, "utf8"));
  }
})(decodeURIComponent(root));

const rootPosix = decodeURIComponent(root).split(sep).join("/");
const isClient = (src) => /^\s*["']use client["']/.test(src);
const stripExt = (p) => p.replace(/\.(ts|tsx)$/, "");

const clientConsts = new Map(); // module path (no ext) → Set of UPPER_CASE exports
for (const [p, src] of files) {
  if (!isClient(src)) continue;
  const names = [...src.matchAll(/export const ([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]);
  if (names.length) clientConsts.set(stripExt(p), new Set(names));
}

let issues = 0;
for (const [p, src] of files) {
  if (isClient(src)) continue;
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const target = m[2];
    const resolved = target.startsWith("@/")
      ? `${rootPosix}/${target.slice(2)}`
      : target.startsWith(".")
        ? normalize(join(dirname(p), target)).split(sep).join("/")
        : null;
    const consts = resolved && clientConsts.get(resolved);
    if (!consts) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (consts.has(name)) {
        console.error(`✗ ${p.replace(rootPosix, "src")} imports ${name} from client module ${target}`);
        issues++;
      }
    }
  }
}
console.log(issues ? `\n${issues} server/client boundary issue(s)` : "✓ no server modules import constants from client modules");
process.exit(issues ? 1 : 0);
