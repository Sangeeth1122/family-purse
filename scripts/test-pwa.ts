import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import manifest from "../app/manifest";

const root = join(__dirname, "..");
let failures = 0;
const checks: [string, boolean][] = [];

const check = (name: string, ok: boolean) => {
  checks.push([name, ok]);
  if (!ok) failures++;
};

const read = (p: string) => readFileSync(join(root, p), "utf8");
const exists = (p: string) => {
  try {
    read(p);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  console.log("A. Web app manifest");
  const man = manifest();
  try {
    if (man.name !== "Family Purse") throw new Error("name");
    if (man.short_name !== "Purse") throw new Error("short_name");
    if (man.start_url !== "/app/dashboard") throw new Error("start_url");
    if (man.scope !== "/") throw new Error("scope");
    if (man.display !== "standalone") throw new Error("display");
    if (man.theme_color !== "#F7F4EE") throw new Error("theme_color");
    if (man.background_color !== "#F7F4EE") throw new Error("background_color");
    const icons = man.icons as { src: string; sizes: string }[];
    const srcs = icons.map((i) => i.src);
    for (const need of ["/icon.svg", "/app-icon-192.png", "/app-icon-512.png"]) {
      if (!srcs.includes(need)) throw new Error(`missing icon ${need}`);
    }
    const sizes = new Set(icons.map((i) => i.sizes));
    if (!sizes.has("192x192") || !sizes.has("512x512")) throw new Error("missing png sizes");
    if (!man.description) throw new Error("missing description");
    check("manifest is valid", true);
  } catch (e) {
    check(`manifest is valid — ${(e as Error).message}`, false);
  }

  console.log("B. Icon assets");
  for (const [file, size] of [
    ["public/app-icon-192.png", 192],
    ["public/app-icon-512.png", 512],
    ["public/apple-touch-icon.png", 180],
  ] as const) {
    try {
      if (!exists(file)) throw new Error("missing");
      const meta = await sharp(join(root, file)).metadata();
      if (meta.width !== size || meta.height !== size) throw new Error(`got ${meta.width}x${meta.height}`);
      check(`${file} is ${size}x${size}`, true);
    } catch (e) {
      check(`${file} is ${size}x${size} — ${(e as Error).message}`, false);
    }
  }

  console.log("C. Service worker");
  try {
    if (!exists("public/sw.js")) throw new Error("missing");
    check("public/sw.js exists", true);
  } catch (e) {
    check(`public/sw.js exists — ${(e as Error).message}`, false);
  }
  try {
    if (!read("public/sw.js").includes("/_next/static/")) throw new Error("static cache missing");
    check("sw.js makes /_next/static cache-first", true);
  } catch (e) {
    check(`sw.js makes /_next/static cache-first — ${(e as Error).message}`, false);
  }
  try {
    const sw = read("public/sw.js");
    const at = sw.indexOf('req.mode === "navigate"');
    if (at < 0) throw new Error("no navigation handler");
    const nav = sw.slice(at, at + 400);
    if (nav.includes("cache.put") || nav.includes(".add(") || nav.includes("addAll(")) {
      throw new Error("navigation response cached");
    }
    check("sw.js never caches navigations", true);
  } catch (e) {
    check(`sw.js never caches navigations — ${(e as Error).message}`, false);
  }
  try {
    if (!read("public/sw.js").includes("./offline.html")) throw new Error("fallback missing");
    check("sw.js offline fallback targets offline.html", true);
  } catch (e) {
    check(`sw.js offline fallback targets offline.html — ${(e as Error).message}`, false);
  }
  try {
    const html = read("public/offline.html");
    if (!html.includes("You're offline")) throw new Error("heading missing");
    if (!html.toLowerCase().includes("#f7f4ee")) throw new Error("theme color missing");
    check("offline.html exists and is branded", true);
  } catch (e) {
    check(`offline.html exists and is branded — ${(e as Error).message}`, false);
  }

  console.log("D. App wiring");
  const layout = read("app/layout.tsx");
  try {
    if (!layout.includes("/manifest.webmanifest")) throw new Error("missing");
    check("layout links /manifest.webmanifest", true);
  } catch (e) {
    check(`layout links /manifest.webmanifest — ${(e as Error).message}`, false);
  }
  try {
    if (!layout.includes("SwRegister")) throw new Error("missing");
    check("layout registers SwRegister", true);
  } catch (e) {
    check(`layout registers SwRegister — ${(e as Error).message}`, false);
  }
  try {
    if (!exists("components/pwa/sw-register.tsx")) throw new Error("missing");
    const src = read("components/pwa/sw-register.tsx");
    if (!src.includes('process.env.NODE_ENV !== "production"')) throw new Error("env gate missing");
    if (!src.includes('"/sw.js"')) throw new Error("sw url missing");
    if (!src.includes('"use client"')) throw new Error("not a client component");
    check("components/pwa/sw-register.tsx registers only in production", true);
  } catch (e) {
    check(`components/pwa/sw-register.tsx registers only in production — ${(e as Error).message}`, false);
  }

  for (const [name, ok] of checks) console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}`);
  console.log(`\n${failures === 0 ? "All PWA checks passed." : failures + " PWA checks failed."}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});