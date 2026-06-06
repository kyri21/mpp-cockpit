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
  const prompt = `Tu lis l'edition du jour du journal L'Equipe (PDF, ${dateArg}). Pour les selections de la Coupe du Monde 2026, extrais SEULEMENT les faits qui changent le niveau attendu d'une equipe pour ses matchs a venir.

A retenir (ce qui pese sur les buts attendus) :
- Blessures, forfaits, suspensions, retours de joueurs cles.
- Joueurs menages ou turnover annonce, compositions probables.
- Etat de forme tres recent et net (serie, defense qui prend l'eau, attaque en feu).
- Enjeu : equipe deja qualifiee qui fait tourner, match decisif.

A EXCLURE absolument :
- Le recit ou le commentaire d'un match deja joue (chronique minute par minute, notes des joueurs, formules de journaliste).
- Le simple calendrier (qui joue qui et quand) : c'est deja connu de l'app, ne l'extrais pas.
- Tout pronostic ou opinion.

Regles strictes :
- N'extrais QUE ce qui est ecrit dans ce journal. N'invente aucun nom ni aucune information. Si tu n'es pas sur, n'ecris rien.
- Utilise EXCLUSIVEMENT les noms d'equipes de cette liste comme cles (noms canoniques). Si une equipe du journal n'y est pas, ignore-la.
- Maximum 6 faits par equipe, les plus importants d'abord, chacun en une phrase courte et factuelle en francais.

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
