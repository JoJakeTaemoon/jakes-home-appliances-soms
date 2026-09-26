/**
 * Every literal `t("key")` in a component resolves in ko, vi and en.
 *
 * next-intl only complains at render time (a MISSING_MESSAGE in the browser
 * console, and the raw key on screen), so a missing key ships unless someone
 * opens that exact screen. This scans the source instead: for each
 * `const x = useTranslations("ns")` in a file, every `x("literal")` must exist
 * under `ns` — or, when the same variable name is bound to several namespaces
 * in one file (one per component), under at least one of them.
 *
 * Dynamic keys (`t(\`states.${s}\`)`) and translators passed in as props are
 * out of reach and skipped.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

type Tree = Record<string, unknown>;
const LOCALES = ["ko", "vi", "en"] as const;
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(`src/messages/${l}.json`, "utf8")) as Tree]),
) as Record<(typeof LOCALES)[number], Tree>;

function has(tree: Tree, dotted: string): boolean {
  let node: unknown = tree;
  for (const part of dotted.split(".")) {
    if (!node || typeof node !== "object" || !(part in (node as Tree))) return false;
    node = (node as Tree)[part];
  }
  return true;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : sourceFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const DECL = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*"([^"]*)"\s*\)/g;

describe("i18n — literal translation keys", () => {
  it("resolve in every locale", () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const src = fs.readFileSync(file, "utf8");
      const spaces = new Map<string, Set<string>>();
      for (const [, v, ns] of src.matchAll(DECL)) {
        if (!spaces.has(v)) spaces.set(v, new Set());
        spaces.get(v)!.add(ns);
      }
      for (const [v, nss] of spaces) {
        const call = new RegExp(`(?<![\\w.])${v}\\(\\s*"([A-Za-z0-9_.]+)"`, "g");
        const keys = new Set([...src.matchAll(call)].map((m) => m[1]));
        for (const key of keys) {
          for (const l of LOCALES) {
            const ok = [...nss].some((ns) => has(messages[l], ns ? `${ns}.${key}` : key));
            if (!ok) missing.push(`${[...nss].join("|")}.${key} (${l}) ← ${file}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
