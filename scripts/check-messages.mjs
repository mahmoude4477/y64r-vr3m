// CI check: messages/ar and messages/en hold the same files and the same keys,
// file names are lowercase, and no file starts with a UTF-8 BOM (Turbopack rejects it).
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../messages/", import.meta.url);
let failed = false;
const fail = (msg) => {
  console.error(msg);
  failed = true;
};

const read = (locale, file) => {
  const raw = readFileSync(new URL(`${locale}/${file}`, dir), "utf8");
  if (raw.charCodeAt(0) === 0xfeff) fail(`${locale}/${file}: UTF-8 BOM (Turbopack rejects it)`);
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    fail(`${locale}/${file}: invalid JSON (${e.message})`);
    return {};
  }
};
const keys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
const files = (locale) =>
  readdirSync(new URL(`${locale}/`, dir))
    .filter((f) => f.endsWith(".json"))
    .sort();

const [ar, en] = [files("ar"), files("en")];
for (const f of new Set([...ar, ...en])) {
  if (f !== f.toLowerCase()) fail(`${f}: file names must be lowercase (Linux is case-sensitive)`);
  if (!ar.includes(f) || !en.includes(f)) {
    fail(`missing file: ${ar.includes(f) ? "en" : "ar"}/${f}`);
    continue;
  }
  const a = new Set(keys(read("ar", f)));
  const e = new Set(keys(read("en", f)));
  for (const k of a) if (!e.has(k)) fail(`en/${f}: missing ${k}`);
  for (const k of e) if (!a.has(k)) fail(`ar/${f}: missing ${k}`);
}

if (failed) process.exit(1);
console.log(`messages OK (${ar.length} namespaces, ar/en in sync)`);
