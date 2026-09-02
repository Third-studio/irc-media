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
  say(attente
    ? `FILE VIDE — ${attente} post(s) desactive(s), aucun approuve. Le compte ne publie plus.`
    : "FILE VIDE — plus aucun contenu. Le compte ne publie plus.");
  // Sortie en echec volontaire : GitHub notifie le proprietaire du depot.
  // Un exit 0 laissait le compte muet sans que personne ne le sache.
  process.exit(1);
}
if (!next.caption?.trim()) { say(`J${next.jour} : légende vide, publication annulée.`); process.exit(1); }

say(`J${next.jour} — ${next.fichier}${dry ? "  [simulation]" : ""}`);
if (dry) { console.log("\n" + next.caption.slice(0, 220) + "…\n"); process.exit(0); }

const env = loadEnv();
const T = env.IG_LONG_TOKEN, U = env.IG_USER_ID;
const RAW = env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "");
// GitHub sert les .mp4 en application/octet-stream : Meta refuse.
// jsDelivr sert le meme depot en video/mp4.
const CDN = RAW.replace(
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/,
  "https://cdn.jsdelivr.net/gh/$1/$2@$3"
);
const estVideo = /\.mp4$/i.test(next.fichier);
const url = `${estVideo ? CDN : RAW}/${next.fichier}`;
const estCarrousel = next.type === "carrousel" && Array.isArray(next.fichiers);

const estReel = next.type === "reel" || /\.mp4$/i.test(next.fichier);

try {
  if (estCarrousel) {
    if (next.fichiers.length < 2 || next.fichiers.length > 10) {
      throw new Error(`Un carrousel demande entre 2 et 10 images (recu : ${next.fichiers.length})`);
    }
    const enfants = [];
    for (const f of next.fichiers) {
      const e = await ig(`${U}/media`, { image_url: `${RAW}/${f}`, is_carousel_item: "true", access_token: T }, "POST");
      enfants.push(e.id);
      await sleep(1200);
    }
    const parent = await ig(`${U}/media`, {
      media_type: "CAROUSEL", children: enfants.join(","), caption: next.caption, access_token: T,
    }, "POST");
    await sleep(3000);
    const r = await ig(`${U}/media_publish`, { creation_id: parent.id, access_token: T }, "POST");
    const p = await ig(r.id, { fields: "permalink", access_token: T }).catch(() => ({}));
    next.publie = new Date().toISOString();
    next.permalink = p.permalink || null;
    writeFileSync(QP, JSON.stringify(q, null, 2));
    say(`Publie -> ${p.permalink || r.id}`);
    process.exit(0);
  }

  const params = estReel
    ? { media_type: "REELS", video_url: url, caption: next.caption, share_to_feed: "true", access_token: T }
    : { image_url: url, caption: next.caption, access_token: T };
  if (next.alt) params.alt_text = next.alt;
  const c = await ig(`${U}/media`, params, "POST");

  if (estReel) {
    // Meta encode la video : il faut attendre FINISHED avant de publier.
    let etat = "";
    for (let i = 0; i < 40; i++) {
      await sleep(6000);
      const s = await ig(c.id, { fields: "status_code,status", access_token: T });
      etat = s.status_code;
      if (etat === "FINISHED") break;
      if (etat === "ERROR") throw new Error(`Encodage refuse par Meta : ${JSON.stringify(s)} (url ${url})`);
    }
    if (etat !== "FINISHED") throw new Error(`Encodage toujours en cours apres 4 min (${etat})`);
  } else {
    await sleep(3000);
  }
  const r = await ig(`${U}/media_publish`, { creation_id: c.id, access_token: T }, "POST");
  const p = await ig(r.id, { fields: "permalink", access_token: T }).catch(() => ({}));
  next.publie = new Date().toISOString();
  next.permalink = p.permalink || null;
  writeFileSync(QP, JSON.stringify(q, null, 2));
  say(`Publié → ${p.permalink || r.id}`);
  // Alerte de reserve : prevenir AVANT la panne seche, pas apres.
  const reste = q.posts.filter((x) => !x.publie && x.approved).length;
  if (reste === 0) say("ALERTE : c'etait le dernier post approuve. Plus rien demain.");
  else if (reste <= 3) say(`ALERTE : plus que ${reste} post(s) en file. Produire du contenu.`);
  else say(`Reserve : ${reste} post(s) en file.`);
} catch (e) {
  say(`ÉCHEC J${next.jour} : ${e.message}`);
  process.exit(1);
}
