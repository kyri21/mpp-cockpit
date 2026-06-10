// Revue de presse locale : lit un PDF L'Equipe via Gemini Files API et ecrit un petit
// JSON de faits par equipe (data/presse-facts-AAAA-MM-JJ.json). A lancer en session,
// la ou presse/*.pdf existe. Travail lourd, une fois par jour ; le runtime ne lit que
// le JSON produit.
//
// Usage :
//   node scripts/revue.mjs "presse/Lquipe Du Vendredi 29 Mai 2026.pdf" 2026-05-29
//   node scripts/revue.mjs                # prend le PDF le plus recent de presse/
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import { cleanJsonText, asciiSlug } from "../src/engine/presse.js";
import elo from "../data/elo-ratings.json" with { type: "json" };

// fileURLToPath, pas .pathname : decode les espaces du chemin (ex. "MPP project"),
// sinon le %20 casse toutes les lectures de fichiers.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL = "gemini-2.5-flash";

// Charge .env.local sans dependance (le projet n'embarque pas dotenv).
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* pas de .env.local : on garde l'env shell */ }
}

// Choisit le PDF : argument explicite, sinon le plus recent de presse/.
function pickPdf(arg) {
  if (arg) return arg;
  const dir = join(ROOT, "presse");
  const pdfs = readdirSync(dir)
    .filter((f) => /\.pdf$/i.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!pdfs.length) throw new Error("Aucun PDF dans presse/.");
  return join("presse", pdfs[0].f);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Au dela d'environ 40 Mo, generateContent renvoie un 400 INVALID_ARGUMENT sur le PDF
// (limite de taille cote Gemini). Les editions L'Equipe les plus lourdes (60 Mo) passent
// apres une compression ghostscript /ebook (61 Mo -> 13 Mo, lisibilite conservee). Si
// ghostscript est absent ou la compression insuffisante, on tente quand meme l'upload brut.
const SIZE_LIMIT = 40 * 1024 * 1024;
function maybeCompress(absPath, tmpDir) {
  if (statSync(absPath).size <= SIZE_LIMIT) return absPath;
  const out = join(tmpDir, "compressed.pdf");
  try {
    console.log("PDF volumineux : compression ghostscript /ebook...");
    execFileSync("gs", [
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4", "-dPDFSETTINGS=/ebook",
      "-dNOPAUSE", "-dQUIET", "-dBATCH", `-sOutputFile=${out}`, absPath,
    ]);
    const mb = (statSync(out).size / (1024 * 1024)).toFixed(1);
    console.log(`Compresse a ${mb} Mo.`);
    return out;
  } catch (e) {
    console.error("Compression impossible (ghostscript absent ?), upload du PDF brut :", String(e?.message || e).slice(0, 120));
    return absPath;
  }
}

async function main() {
  loadEnvLocal();
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error("GEMINI_API_KEY absente."); process.exit(1); }

  const pdfArg = process.argv[2];
  const dateArg = process.argv[3] || new Date().toISOString().slice(0, 10);
  const pdfPath = pickPdf(pdfArg);
  console.log(`PDF : ${pdfPath}`);
  console.log(`Date de sortie : ${dateArg}`);

  // Copie sous un nom ASCII neutre (piege des noms accentues a l'upload).
  const tmp = mkdtempSync(join(tmpdir(), "revue-"));
  const safe = join(tmp, asciiSlug(basename(pdfPath)) || "presse.pdf");
  copyFileSync(join(ROOT, pdfPath), safe);

  // Compresse si le PDF depasse la limite de taille de Gemini.
  const toUpload = maybeCompress(safe, tmp);

  const ai = new GoogleGenAI({ apiKey: key });

  // Televersement via Files API (gros PDF image only).
  console.log("Televersement...");
  let file = await ai.files.upload({ file: toUpload, config: { mimeType: "application/pdf" } });
  // Attente de l'etat ACTIVE.
  while (file.state === "PROCESSING") {
    await sleep(2000);
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === "FAILED") { console.error("Echec du traitement Gemini du PDF."); process.exit(2); }
  console.log(`Fichier actif : ${file.uri}`);

  const names = Object.keys(elo.ratings);
  const prompt = `Tu lis l'edition du jour du journal L'Equipe (PDF, ${dateArg}). Parcours TOUT le journal, page par page, pas seulement la une. Recense CHAQUE selection nationale de football (masculine) citee, meme dans une breve, et pour chacune extrais les faits qui changent le niveau attendu de l'equipe pour ses matchs a venir.

Pour CHAQUE equipe citee, retiens (ce qui pese sur les buts attendus) :
- Blessures, forfaits, suspensions, retours, joueurs hors groupe ou ajoutes.
- Joueurs menages ou turnover annonce, compositions probables.
- Etat de forme tres recent et net (serie, gros resultat amical, defense qui prend l'eau, attaque en feu, joueur en forme).
- Enjeu : equipe deja qualifiee qui fait tourner, match decisif.

Couvre toutes les equipes concernees, pas seulement le sujet principal du jour.

CONDITION D'ENTREE (stricte) : ne cree une entree pour une equipe QUE si CETTE edition donne une vraie info sur son effectif, une blessure, un retour, du turnover, une forme recente nette ou un enjeu. Si le journal ne fait que citer un match a venir ou un adversaire SANS info sur l'effectif, n'inclus PAS l'equipe du tout. Mieux vaut peu d'equipes bien renseignees que beaucoup d'equipes vides.

A EXCLURE :
- Le simple calendrier (qui joue qui et quand) : ne jamais ecrire un fait du type "a un match a venir contre X".
- Le recit ou le commentaire d'un match deja joue (chronique minute par minute, notes individuelles, formules de journaliste).
- Tout pronostic ou opinion d'expert.
- Le football feminin, les clubs, les autres sports.
- Tout rappel historique ou ancien (resultats passes, statistiques d'annees precedentes).

Regles strictes :
- N'utilise QUE ce qui est imprime dans CETTE edition du ${dateArg}. N'utilise jamais ta memoire, ni des faits anterieurs, ni des effectifs que tu crois connaitre. N'invente aucun nom ni aucune information. Dans le doute, n'ecris rien.
- Utilise EXCLUSIVEMENT les noms d'equipes de cette liste comme cles (noms canoniques anglais). Si une equipe citee n'y est pas, ignore-la.
- Au plus 5 faits par equipe, les plus importants d'abord, chacun en une phrase courte et factuelle en francais.

Liste des noms autorises : ${names.join(", ")}

Reponds UNIQUEMENT avec ce JSON, sans aucun texte autour :
{"teams": {"Spain": {"facts": ["fait court", "..."]}, "France": {"facts": ["..."]}}}`;

  // Generation avec backoff sur 503 (overloaded), distinct du quota 429.
  let text = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: createUserContent([createPartFromUri(file.uri, file.mimeType), prompt]),
      });
      text = res.text || "";
      break;
    } catch (err) {
      const msg = String(err?.message || err);
      if (/503|overloaded|UNAVAILABLE/i.test(msg) && attempt < 4) {
        const wait = 2000 * attempt;
        console.error(`503 overloaded, reessai dans ${wait}ms (tentative ${attempt}/3)...`);
        await sleep(wait);
        continue;
      }
      console.error("Echec generation Gemini :", msg);
      process.exit(3);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonText(text));
  } catch {
    console.error("Reponse Gemini non parseable. Brut :\n", text.slice(0, 2000));
    // Fiche vide explicite : distingue presse indisponible de presse neutre.
    parsed = { teams: {} };
  }

  const out = {
    source: "L'Equipe",
    paperDate: dateArg,
    generatedAt: new Date().toISOString(),
    teams: parsed.teams && typeof parsed.teams === "object" ? parsed.teams : {},
  };
  const outPath = join(ROOT, "data", `presse-facts-${dateArg}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const n = Object.keys(out.teams).length;
  console.log(`Ecrit : data/presse-facts-${dateArg}.json (${n} equipes)`);
  if (n === 0) console.error("ATTENTION : 0 equipe extraite (presse indisponible ou non parseable).");
}

main();
