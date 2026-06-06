# Couche presse PDF via Gemini — Plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lire le PDF L'Equipe du jour en local avec Gemini, en extraire un petit JSON de faits par equipe, et l'injecter en silence dans le prompt Anthropic existant pour affiner le seul couple de multiplicateurs de contexte (anti-doublon respecte).

**Architecture:** Deux moities etanches. Local : `scripts/revue.mjs` televerse le PDF via Gemini Files API et ecrit `data/presse-facts-AAAA-MM-JJ.json`. Runtime : `api/analyze.js` charge ce JSON, canonise les noms d'equipes, injecte les faits dans son prompt. Logique pure isolee dans `src/engine/presse.js` (testable sans Gemini ni Vercel).

**Tech Stack:** Node ESM, `@google/genai` (Files API, `gemini-2.5-flash`), Anthropic SDK (deja en place), tests sans framework facon `scripts/test-buteur.mjs`.

**Regle de commit (consigne utilisateur, prioritaire) :** ne RIEN committer ni deployer sans accord explicite. Chaque tache se termine par `git add` (staging) seulement. Le `git commit` final et tout `git push` (qui declenche un deploiement Vercel) attendent le feu vert de l'utilisateur. Avant de modifier `calcul.js` ou `analyze.js`, lancer l'analyse d'impact GitNexus si l'outil fonctionne ; sinon le noter.

---

## Structure des fichiers

- Create `src/engine/presse.js` : fonctions pures de la couche presse (nettoyage JSON, slug ASCII, lecture du fichier de faits, extraction par equipe, construction du bloc de prompt).
- Modify `src/engine/calcul.js` : ajoute et exporte `canonicalTeam(name, ratings)` (jumeau de `resolveElo`, renvoie le nom canonique).
- Create `scripts/revue.mjs` : orchestration locale Gemini (env, choix du PDF, copie ASCII, upload, attente ACTIVE, generation, nettoyage, ecriture).
- Modify `api/analyze.js` : charge les faits, canonise home/away, injecte le bloc presse dans le prompt.
- Modify `vercel.json` : `includeFiles` pour embarquer `data/presse-facts-*.json` dans la fonction.
- Create `scripts/test-presse.mjs` : assertions d'invariants des fonctions pures.

---

## Task 1 : fonctions pures de presse.js (nettoyage, slug, extraction, bloc)

**Files:**
- Create: `src/engine/presse.js`
- Create: `scripts/test-presse.mjs`

- [ ] **Step 1 : ecrire les tests qui echouent**

Create `scripts/test-presse.mjs` :

```js
// Tests d'invariants de la couche presse. Lance : node scripts/test-presse.mjs
// Pas de framework : assertions Node simples, dans l'esprit de test-buteur.mjs.
import {
  cleanJsonText, asciiSlug, factsForTeams, buildPresseBlock, loadPresseFacts,
} from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  FAIL:", msg); } };

// cleanJsonText : retire les fences ```json (le bug le plus sournois).
ok(cleanJsonText('```json\n{"a":1}\n```') === '{"a":1}', "fences json retirees");
ok(cleanJsonText('```\n{"a":1}\n```') === '{"a":1}', "fences nues retirees");
ok(cleanJsonText('bla bla {"a":1} fin') === '{"a":1}', "texte parasite retire");
ok(cleanJsonText('{"a":1}') === '{"a":1}', "json nu inchange");
ok(cleanJsonText(null) === "", "entree non chaine -> chaine vide");

// asciiSlug : noms accentues -> ASCII neutre (piege du televersement).
ok(asciiSlug("L'Équipe du Jeudi 4 Juin 2026.PDF") === "L_Equipe_du_Jeudi_4_Juin_2026.PDF", "accents et apostrophe normalises");
ok(/^[\x00-\x7F]+$/.test(asciiSlug("L’Équipe Du Vendredi 5 Juin.pdf")), "resultat purement ASCII");

// factsForTeams : extraction robuste par cle d'equipe.
const presse = { teams: { Spain: { facts: ["a", "b"] }, France: { facts: ["c"] } } };
ok(JSON.stringify(factsForTeams(presse, "Spain", "France")) === JSON.stringify({ home: ["a", "b"], away: ["c"] }), "facts des deux equipes");
ok(JSON.stringify(factsForTeams(presse, "Spain", "Brazil")) === JSON.stringify({ home: ["a", "b"], away: [] }), "equipe absente -> liste vide");
ok(JSON.stringify(factsForTeams({ teams: {} }, "Spain", "France")) === JSON.stringify({ home: [], away: [] }), "presse vide -> listes vides");

// buildPresseBlock : bloc de prompt, vide si aucun fait.
ok(buildPresseBlock("Espagne", "France", [], []) === "", "aucun fait -> bloc vide");
const block = buildPresseBlock("Espagne", "France", ["Carvajal forfait"], ["Mbappe menage"]);
ok(block.includes("Espagne : Carvajal forfait") && block.includes("France : Mbappe menage"), "bloc contient les faits par equipe");
ok(block.includes("pas un pronostic"), "bloc rappelle la prudence anti-invention");

console.log(`\npresse: ${pass} OK, ${fail} KO`);
if (fail) process.exit(1);
```

- [ ] **Step 2 : lancer pour verifier l'echec**

Run: `node scripts/test-presse.mjs`
Expected: FAIL (`Cannot find module ... presse.js` ou `canonicalTeam` indefini).

- [ ] **Step 3 : implementer presse.js (sans loadPresseFacts pour l'instant, ajoute en Task 2)**

Create `src/engine/presse.js` :

```js
// Couche presse : fonctions pures, isolees de React et de Gemini.
// Les faits extraits de la presse ajustent les buts attendus via le prompt Anthropic
// existant (anti-doublon : un seul canal de contexte, jamais une source de fusion separee).
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Retire un eventuel bloc ```json ... ``` puis isole du premier { au dernier }.
// Bug le plus sournois rencontre sur Rugby Prono : un JSON.parse brut sur une reponse
// entouree de fences echoue en silence et annule tout l'ajustement.
export function cleanJsonText(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s.trim();
}

// Normalise un nom de fichier accentue en ASCII neutre avant televersement Gemini
// (les noms accentues peuvent casser l'upload).
export function asciiSlug(str) {
  return (str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "_")
    .replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// Recupere les faits des deux equipes d'un match depuis le JSON de presse.
export function factsForTeams(presse, homeKey, awayKey) {
  const teams = (presse && presse.teams) || {};
  const pick = (k) => (k && teams[k] && Array.isArray(teams[k].facts)) ? teams[k].facts : [];
  return { home: pick(homeKey), away: pick(awayKey) };
}

// Construit le bloc de prompt injecte dans la requete Anthropic. Vide si aucun fait,
// pour ne rien changer au comportement quand la presse est absente.
export function buildPresseBlock(homeName, awayName, homeFacts, awayFacts) {
  const lines = [];
  if (homeFacts.length) lines.push(`${homeName} : ${homeFacts.join(" ; ")}`);
  if (awayFacts.length) lines.push(`${awayName} : ${awayFacts.join(" ; ")}`);
  if (!lines.length) return "";
  return `\n\nPresse du jour (L'Equipe), faits concrets a integrer comme contexte (ce n'est pas un pronostic, n'invente rien au dela de ces faits) :\n${lines.join("\n")}`;
}
```

- [ ] **Step 4 : lancer pour verifier le succes (cleanJsonText, asciiSlug, factsForTeams, buildPresseBlock)**

Run: `node scripts/test-presse.mjs`
Expected: les assertions de Task 1 passent, MAIS la ligne `import { loadPresseFacts }` echouera tant que Task 2 n'est pas faite. Pour isoler, commenter temporairement `loadPresseFacts` dans l'import et les tests de Task 2 si on execute Task 1 seule ; sinon enchainer directement Task 2 (recommande).

- [ ] **Step 5 : stager (commit differe)**

```bash
git add src/engine/presse.js scripts/test-presse.mjs
```

---

## Task 2 : loadPresseFacts (lecture du fichier, degradation silencieuse)

**Files:**
- Modify: `src/engine/presse.js`
- Modify: `scripts/test-presse.mjs`

- [ ] **Step 1 : ajouter les tests qui echouent**

Ajouter dans `scripts/test-presse.mjs`, avant la ligne `console.log(...)` finale :

```js
// loadPresseFacts : fichier present, absent, malforme.
const dir = mkdtempSync(join(tmpdir(), "presse-"));
writeFileSync(join(dir, "presse-facts-2026-05-29.json"), JSON.stringify({ teams: { Spain: { facts: ["x"] } } }));
ok(loadPresseFacts("2026-05-29", dir).teams.Spain.facts[0] === "x", "fichier present lu");
ok(JSON.stringify(loadPresseFacts("2026-01-01", dir)) === JSON.stringify({ teams: {} }), "fichier absent -> teams vide");
writeFileSync(join(dir, "presse-facts-2026-05-30.json"), "{ pas du json");
ok(JSON.stringify(loadPresseFacts("2026-05-30", dir)) === JSON.stringify({ teams: {} }), "json malforme -> teams vide");
ok(JSON.stringify(loadPresseFacts(null, dir)) === JSON.stringify({ teams: {} }), "date nulle -> teams vide");
rmSync(dir, { recursive: true, force: true });
```

- [ ] **Step 2 : lancer pour verifier l'echec**

Run: `node scripts/test-presse.mjs`
Expected: FAIL (`loadPresseFacts is not a function`).

- [ ] **Step 3 : implementer loadPresseFacts dans presse.js**

Ajouter a la fin de `src/engine/presse.js` :

```js
// Charge data/presse-facts-AAAA-MM-JJ.json. Renvoie toujours un objet { teams: {...} }.
// Fichier absent ou illisible = presse indisponible : degradation silencieuse, pas
// d'erreur propagee (mais pas d'invention non plus, les listes seront vides).
export function loadPresseFacts(date, dataDir) {
  if (!date || !dataDir) return { teams: {} };
  try {
    const raw = readFileSync(join(dataDir, `presse-facts-${date}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.teams ? parsed : { teams: {} };
  } catch {
    return { teams: {} };
  }
}
```

- [ ] **Step 4 : lancer pour verifier le succes**

Run: `node scripts/test-presse.mjs`
Expected: `presse: N OK, 0 KO` (toutes les assertions passent).

- [ ] **Step 5 : stager**

```bash
git add src/engine/presse.js scripts/test-presse.mjs
```

---

## Task 3 : canonicalTeam dans calcul.js (rapprochement des noms FR/EN)

**Files:**
- Modify: `src/engine/calcul.js` (ajout apres `resolveElo`, vers la ligne 167)
- Modify: `scripts/test-presse.mjs`

Avant edition : si GitNexus fonctionne, lancer `gitnexus_impact({target: "resolveElo", direction: "upstream"})` et rapporter le risque ; sinon le noter (FTS GitNexus est casse dans cet environnement).

- [ ] **Step 1 : ajouter les tests qui echouent**

Ajouter dans `scripts/test-presse.mjs`, avant le `console.log(...)` final :

```js
// canonicalTeam : nom FR ou EN -> cle canonique du dataset Elo.
const R = elo.ratings;
ok(canonicalTeam("Espagne", R) === "Spain", "FR Espagne -> Spain");
ok(canonicalTeam("Spain", R) === "Spain", "EN Spain inchange");
ok(canonicalTeam("Etats-Unis", R) === "United States", "Etats-Unis -> United States via alias");
ok(canonicalTeam("Pays-Bas", R) === "Netherlands", "Pays-Bas -> Netherlands");
ok(canonicalTeam("Equipe Inexistante", R) === null, "inconnu -> null");
```

- [ ] **Step 2 : lancer pour verifier l'echec**

Run: `node scripts/test-presse.mjs`
Expected: FAIL (`canonicalTeam is not a function`).

- [ ] **Step 3 : implementer canonicalTeam dans calcul.js**

Inserer juste apres la fonction `resolveElo` (apres sa ligne `return null; }`, vers la ligne 167) :

```js
// Retrouve le NOM canonique d'une equipe (cle du dataset Elo, anglais), robuste aux
// variantes FR/EN. Meme logique d'alias que resolveElo, mais renvoie le nom au lieu de
// la note. Utilise par la couche presse pour rapprocher les noms du cockpit (francais)
// des cles du JSON de faits (anglais). Renvoie null si introuvable.
export function canonicalTeam(name, ratings) {
  if (!ratings || !name) return null;
  if (ratings[name] != null) return name;
  const norm = normalizeName(name);
  const aliased = ELO_ALIASES[norm] || norm;
  for (const key of Object.keys(ratings)) {
    if (normalizeName(key) === aliased) return key;
  }
  return null;
}
```

- [ ] **Step 4 : lancer pour verifier le succes (et non-regression du moteur)**

Run: `node scripts/test-presse.mjs && node scripts/test-buteur.mjs`
Expected: les deux suites passent (`0 KO`), confirmant que l'ajout ne casse pas le moteur.

- [ ] **Step 5 : stager**

```bash
git add src/engine/calcul.js scripts/test-presse.mjs
```

---

## Task 4 : script local revue.mjs (Gemini Files API)

**Files:**
- Create: `scripts/revue.mjs`

Pas de test unitaire (depend de Gemini et d'un vrai PDF) : la validation est un run reel en Task 6. Le code reutilise les fonctions pures deja testees.

- [ ] **Step 1 : ecrire revue.mjs**

Create `scripts/revue.mjs` :

```js
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
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import { cleanJsonText, asciiSlug } from "../src/engine/presse.js";
import elo from "../data/elo-ratings.json" with { type: "json" };

const ROOT = new URL("..", import.meta.url).pathname;
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

  const ai = new GoogleGenAI({ apiKey: key });

  // Televersement via Files API (gros PDF image only).
  console.log("Televersement...");
  let file = await ai.files.upload({ file: safe, config: { mimeType: "application/pdf" } });
  // Attente de l'etat ACTIVE.
  while (file.state === "PROCESSING") {
    await sleep(2000);
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === "FAILED") { console.error("Echec du traitement Gemini du PDF."); process.exit(2); }
  console.log(`Fichier actif : ${file.uri}`);

  const names = Object.keys(elo.ratings);
  const prompt = `Tu lis l'edition du jour du journal L'Equipe (PDF, ${dateArg}). Extrais, equipe par equipe, les faits concrets utiles a un parieur sur les matchs de Coupe du Monde 2026 a venir : blessures et suspensions de joueurs cles, joueurs menages, compositions probables, etat de forme tres recent, enjeu (equipe deja qualifiee qui fait tourner, match decisif).

Regles strictes :
- N'extrais QUE ce qui est ecrit dans ce journal. N'invente aucun nom ni aucune information. Si tu n'es pas sur, n'ecris rien.
- Utilise EXCLUSIVEMENT les noms d'equipes de cette liste comme cles (ce sont les noms canoniques attendus). Si une equipe du journal n'est pas dans la liste, ignore-la.
- Pour chaque equipe trouvee, donne une liste courte ("facts") de faits en francais, formules tels quels, sans pronostic.

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
```

- [ ] **Step 2 : verifier la syntaxe sans appeler Gemini**

Run: `node --check scripts/revue.mjs`
Expected: aucune sortie (syntaxe valide).

- [ ] **Step 3 : stager**

```bash
git add scripts/revue.mjs
```

---

## Task 5 : brancher api/analyze.js et vercel.json

**Files:**
- Modify: `api/analyze.js`
- Modify: `vercel.json`

Avant edition : si GitNexus fonctionne, `gitnexus_impact({target: "handler", direction: "upstream"})` sur analyze.js ; sinon le noter.

- [ ] **Step 1 : modifier vercel.json pour embarquer le JSON dans la fonction**

Remplacer le contenu de `vercel.json` par :

```json
{
  "framework": "vite",
  "functions": {
    "api/analyze.js": {
      "includeFiles": "data/presse-facts-*.json"
    }
  }
}
```

- [ ] **Step 2 : ajouter les imports en tete de api/analyze.js**

Apres la ligne `import Anthropic from "@anthropic-ai/sdk";` (ligne 10), ajouter :

```js
import { join } from "node:path";
import { loadPresseFacts, factsForTeams, buildPresseBlock } from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };
```

- [ ] **Step 3 : charger les faits et construire le bloc, juste avant la construction du prompt**

Dans `api/analyze.js`, juste apres la ligne `const today = date || new Date().toISOString().slice(0, 10);` (ligne 29), inserer :

```js
  // Couche presse : faits du jour extraits localement par Gemini (scripts/revue.mjs).
  // Ils affinent le contexte Anthropic existant, sans creer de source separee (anti-doublon).
  const presse = loadPresseFacts(today, join(process.cwd(), "data"));
  const homeKey = canonicalTeam(home, elo.ratings);
  const awayKey = canonicalTeam(away, elo.ratings);
  const { home: homeFacts, away: awayFacts } = factsForTeams(presse, homeKey, awayKey);
  const presseBlock = buildPresseBlock(home, away, homeFacts, awayFacts);
```

- [ ] **Step 4 : injecter le bloc dans le prompt**

Dans `api/analyze.js`, le prompt se termine actuellement par la consigne JSON (ligne 42-43) :

```js
Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"multHome": float, "multAway": float, "reasoning": "2 phrases max en francais", "factors": ["fait court", "..."]}`;
```

Inserer `${presseBlock}` juste avant la ligne `Reponds UNIQUEMENT...`, de sorte que le template devienne :

```js
Reste mesure : la plupart des multiplicateurs sont entre 0.85 et 1.15. Maximum 0.6 a 1.4.${presseBlock}

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"multHome": float, "multAway": float, "reasoning": "2 phrases max en francais", "factors": ["fait court", "..."]}`;
```

(Quand `presseBlock` est vide, le prompt est identique a aujourd'hui : aucun changement de comportement.)

- [ ] **Step 5 : test de fumee local des parties pures du branchement**

Create temporaire `scripts/test-analyze-wiring.mjs` :

```js
// Verifie le rapprochement noms + extraction + bloc, comme le fera analyze.js,
// avec un faux fichier de faits. Ne touche pas Anthropic.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPresseFacts, factsForTeams, buildPresseBlock } from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };

const dir = mkdtempSync(join(tmpdir(), "wiring-"));
writeFileSync(join(dir, "presse-facts-2026-05-29.json"), JSON.stringify({
  teams: { Spain: { facts: ["Carvajal forfait"] }, France: { facts: ["Mbappe menage"] } },
}));
const presse = loadPresseFacts("2026-05-29", dir);
const hk = canonicalTeam("Espagne", elo.ratings);
const ak = canonicalTeam("France", elo.ratings);
const { home, away } = factsForTeams(presse, hk, ak);
const block = buildPresseBlock("Espagne", "France", home, away);
console.log("homeKey:", hk, "| awayKey:", ak);
console.log(block);
rmSync(dir, { recursive: true, force: true });
if (hk !== "Spain" || ak !== "France" || !block.includes("Carvajal")) { console.error("KO"); process.exit(1); }
console.log("\nwiring OK");
```

Run: `node scripts/test-analyze-wiring.mjs`
Expected: affiche `homeKey: Spain | awayKey: France`, le bloc presse avec Carvajal et Mbappe, puis `wiring OK`. Supprimer ensuite ce fichier de fumee : `rm scripts/test-analyze-wiring.mjs`.

- [ ] **Step 6 : stager**

```bash
git add api/analyze.js vercel.json
```

---

## Task 6 : run reel sur le PDF du 29 mai et revue des faits

**Files:** aucun (validation).

- [ ] **Step 1 : lancer la revue sur le vrai PDF**

Run: `node scripts/revue.mjs "presse/Lquipe Du Vendredi 29 Mai 2026.pdf" 2026-05-29`
Expected: televersement, etat actif, puis `Ecrit : data/presse-facts-2026-05-29.json (N equipes)` avec N > 0.

- [ ] **Step 2 : afficher les faits extraits par equipe**

Run: `node -e "const f=require('./data/presse-facts-2026-05-29.json'); for (const [t,v] of Object.entries(f.teams)) console.log(t+':', (v.facts||[]).join(' | '))"`
Expected: une ligne par equipe avec ses faits concrets.

- [ ] **Step 3 : point d'arret pour revue utilisateur**

Montrer les faits extraits a l'utilisateur et obtenir son accord AVANT toute suite (commit, deploiement). Verifier la qualite : noms d'equipes corrects (canoniques), faits plausibles, pas d'invention manifeste.

- [ ] **Step 4 : stager le JSON de faits (commit toujours differe)**

```bash
git add data/presse-facts-2026-05-29.json
```

---

## Notes de fin

- Commit et push : differes jusqu'a l'accord explicite de l'utilisateur. Un push sur main declenche un deploiement Vercel.
- Verification prod (apres deploiement autorise) : confirmer que `api/analyze.js` lit bien `data/presse-facts-*.json` (le `includeFiles` de vercel.json doit l'embarquer). Tester un match du jour dans le cockpit et verifier que le contexte tient compte de la presse.
- Clé Gemini `AQ.` possiblement ephemere : si un appel echoue en 401/403, regenerer une clé AI Studio format `AIza...` dans `.env.local` et sur Vercel.
- GEMINI_API_KEY doit etre presente dans `.env.local` (fait) et sur Vercel (fait par l'utilisateur).

## Self-review (couverture spec)

- PDF image only lourd lu par Gemini Files API : Task 4.
- Une seule etape Gemini (lecture + structuration + noms) : Task 4 (prompt unique).
- Nom ASCII avant upload : Task 1 (asciiSlug) + Task 4 (copie).
- Nettoyage des fences ```json : Task 1 (cleanJsonText) + Task 4 (parsing).
- Backoff sur 503 : Task 4.
- Anti-invention dans le prompt : Task 4.
- Erreurs non avalees, fiches vides explicites : Task 4 (parsed -> teams {}, ATTENTION si 0).
- Rapprochement noms FR/EN : Task 3 (canonicalTeam) + Task 5.
- Consommation runtime sans double comptage (un seul canal) : Task 5 (injection dans le prompt existant).
- Piege Vercel includeFiles : Task 5.
- Tests TDD des fonctions pures : Tasks 1, 2, 3, 5.
- Run reel + revue avant suite : Task 6.
