// Publie les 2 prochaines stories approuvées de la file, puis marque la file.
//   node publish-next-stories.mjs [nombre]
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv, ig, sleep } from "./lib.mjs";

const N = Number(process.argv[2] || 2);
const env = loadEnv();
const T = env.IG_LONG_TOKEN, U = env.IG_USER_ID;
const base = env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "");

const Q = "queue-stories.json";
const q = JSON.parse(readFileSync(Q, "utf8"));
const att = q.stories.filter((s) => s.approved && !s.publie).slice(0, N);

if (!att.length) {
  console.log("File des stories vide — rien à publier.");
  process.exit(0);
}

let ok = 0;
for (const s of att) {
  try {
    const c = await ig(`${U}/media`, { media_type: "STORIES", image_url: `${base}/${s.fichier}`, access_token: T }, "POST");
    await sleep(2500);
    const r = await ig(`${U}/media_publish`, { creation_id: c.id, access_token: T }, "POST");
    s.publie = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    s.id = r.id;
    console.log(`  ok  ${s.fichier}  ->  ${r.id}`);
    ok++;
    await sleep(2000);
  } catch (e) {
    console.log(`  ECHEC  ${s.fichier}  ${e.message.slice(0, 140)}`);
  }
}

writeFileSync(Q, JSON.stringify(q, null, 2) + "\n");
const reste = q.stories.filter((s) => s.approved && !s.publie).length;
console.log(`${ok} story(ies) publiee(s) — ${reste} en file.`);
if (!ok) process.exit(1);
