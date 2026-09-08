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
// Une story peut reclamer un jour precis ("mercredi" pour accompagner le point
// info). Elle attend son jour ; les autres comblent le reste de la semaine.
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const aujourdhui = JOURS[new Date().getDay()];
const dispo = q.stories.filter((s) => s.approved && !s.publie);
const att = dispo.filter((s) => !s.jourSemaine || s.jourSemaine === aujourdhui).slice(0, N);

if (!att.length) {
  const bloquees = dispo.length;
  if (bloquees) {
    // Rien a publier aujourd'hui, mais la file n'est pas vide : ce n'est pas une alerte.
    console.log(`Rien pour ${aujourdhui} : ${bloquees} story(ies) attendent leur jour.`);
    process.exit(0);
  }
  console.log("FILE DES STORIES VIDE — plus aucune story a publier.");
  process.exit(1);   // echec volontaire : GitHub notifie
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
if (reste <= 2) console.log(`ALERTE : plus que ${reste} story(ies). Produire du contenu.`);
if (!ok) process.exit(1);
