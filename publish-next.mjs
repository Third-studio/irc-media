// Publie le prochain post approuvé de la file. Conçu pour tourner sans personne devant.
//   node publish-next.mjs          → publie
//   node publish-next.mjs --dry    → montre ce qui partirait, sans rien envoyer
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, ig, sleep } from "./lib.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const QP = join(ROOT, "queue.json");
const LOG = join(ROOT, "publication.log");
const dry = process.argv.includes("--dry");
const say = (m) => { const l = `${new Date().toISOString()}  ${m}`; console.log(l); if (!dry) appendFileSync(LOG, l + "\n"); };

const q = JSON.parse(readFileSync(QP, "utf8"));
const next = q.posts.find((p) => !p.publie && p.approved);

if (!next) {
  const attente = q.posts.filter((p) => !p.publie && !p.approved).length;
  say(attente ? `Rien à publier : ${attente} post(s) en attente d'approbation.` : "File vide.");
  process.exit(0);
}
if (!next.caption?.trim()) { say(`J${next.jour} : légende vide, publication annulée.`); process.exit(1); }

say(`J${next.jour} — ${next.fichier}${dry ? "  [simulation]" : ""}`);
if (dry) { console.log("\n" + next.caption.slice(0, 220) + "…\n"); process.exit(0); }

const env = loadEnv();
const T = env.IG_LONG_TOKEN, U = env.IG_USER_ID;
const url = `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${next.fichier}`;

try {
  const params = { image_url: url, caption: next.caption, access_token: T };
  if (next.alt) params.alt_text = next.alt;
  const c = await ig(`${U}/media`, params, "POST");
  await sleep(3000);
  const r = await ig(`${U}/media_publish`, { creation_id: c.id, access_token: T }, "POST");
  const p = await ig(r.id, { fields: "permalink", access_token: T }).catch(() => ({}));
  next.publie = new Date().toISOString();
  next.permalink = p.permalink || null;
  writeFileSync(QP, JSON.stringify(q, null, 2));
  say(`Publié → ${p.permalink || r.id}`);
} catch (e) {
  say(`ÉCHEC J${next.jour} : ${e.message}`);
  process.exit(1);
}
