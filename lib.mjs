import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(ROOT, ".env");

export function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error("Fichier .env absent. Copie .env.example vers .env et remplis-le.");
  }
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

export function saveEnv(updates) {
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  const done = new Set();
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    const i = t.indexOf("=");
    if (i === -1) return line;
    const key = t.slice(0, i).trim();
    if (key in updates) { done.add(key); return `${key}=${updates[key]}`; }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) if (!done.has(k)) out.push(`${k}=${v}`);
  writeFileSync(ENV_PATH, out.join("\n"));
}

const IG = "https://graph.instagram.com";

export async function ig(path, params = {}, method = "GET") {
  const url = new URL(path.startsWith("http") ? path : `${IG}/${path.replace(/^\//, "")}`);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  }
  const opts = { method };
  if (method === "POST") {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null) body.set(k, v);
    opts.body = body;
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Réponse non-JSON (${res.status}) : ${text.slice(0, 300)}`); }
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Meta ${res.status} — ${e.message || text} ${e.error_user_msg ? `(${e.error_user_msg})` : ""}`);
  }
  return json;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function requireVars(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variables manquantes dans .env : ${missing.join(", ")}`);
}
