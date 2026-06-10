# Couche veille web (sites specialises) + recoupement PDF — Plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une couche de veille web a la demande (Foot Mercato + RMC) qui stocke des faits par equipe, les recoupe avec le PDF L'Equipe, et que `api/analyze.js` consomme au meme titre que la presse (un seul multiplicateur, anti-doublon).

**Architecture:** Script local `scripts/veille.mjs` (Anthropic web search restreint a footmercato.net et rmcsport.bfmtv.com) ecrit `data/web-facts-AAAA-MM-JJ.json` avec recoupement par equipe. `api/analyze.js` charge presse-facts ET web-facts, les injecte etiquetes par provenance, et n'utilise plus la recherche web en direct. Logique pure mutualisee dans `src/engine/presse.js`.

**Tech Stack:** Node ESM, Anthropic SDK (`@anthropic-ai/sdk`, deja installe) avec l'outil serveur `web_search_20250305` et `allowed_domains`, tests sans framework facon `scripts/test-buteur.mjs`.

**Regle de commit (consigne utilisateur, prioritaire) :** ne RIEN committer ni deployer sans accord explicite. Chaque tache se termine par `git add` (staging) seulement. Le `git commit`, le merge sur main et le `git push` (qui deploie) attendent le feu vert de l'utilisateur.

---

## Structure des fichiers

- Modify `src/engine/presse.js` : generaliser le chargement de faits a un prefixe (presse ou web), ajouter `loadWebFacts`/`latestWebDate`, `teamsPlayingSoon`, `buildContextBlock`.
- Modify `scripts/test-presse.mjs` : tests des nouvelles fonctions pures.
- Create `scripts/veille.mjs` : veille web Anthropic + recoupement, ecrit `data/web-facts-*.json`.
- Modify `api/analyze.js` : consomme presse-facts + web-facts, retire la recherche web en direct, sources issues des web-facts stockes.
- Modify `vercel.json` : `includeFiles` embarque aussi `data/web-facts-*.json`.

---

## Task 1 : generaliser le chargement de faits (presse + web)

**Files:**
- Modify: `src/engine/presse.js`
- Modify: `scripts/test-presse.mjs`

- [ ] **Step 1 : ecrire les tests qui echouent**

Dans `scripts/test-presse.mjs`, ajouter l'import en tete (completer la ligne d'import existante depuis presse.js) avec `loadWebFacts, latestWebDate` :

```js
import {
  cleanJsonText, asciiSlug, factsForTeams, buildPresseBlock, loadPresseFacts, latestPresseDate,
  loadWebFacts, latestWebDate,
} from "../src/engine/presse.js";
```

Puis, juste avant le `console.log(...)` final, ajouter :

```js
// loadWebFacts / latestWebDate : meme logique que la presse, fichiers web-facts-*.json.
const wdir = mkdtempSync(join(tmpdir(), "web-"));
writeFileSync(join(wdir, "web-facts-2026-06-09.json"), JSON.stringify({ teams: { Netherlands: { facts: ["Timber forfait"] } } }));
ok(loadWebFacts("2026-06-09", wdir).teams.Netherlands.facts[0] === "Timber forfait", "web-facts present lu");
ok(JSON.stringify(loadWebFacts("2026-01-01", wdir)) === JSON.stringify({ teams: {} }), "web-facts absent -> teams vide");
ok(latestWebDate(wdir, "2026-06-10") === "2026-06-09", "latestWebDate prend le plus recent dans la fenetre");
ok(latestWebDate(wdir, "2026-06-20") === null, "latestWebDate hors fenetre -> null");
// la presse ne doit pas confondre les deux familles de fichiers
ok(JSON.stringify(loadPresseFacts("2026-06-09", wdir)) === JSON.stringify({ teams: {} }), "loadPresseFacts ignore les web-facts");
rmSync(wdir, { recursive: true, force: true });
```

- [ ] **Step 2 : lancer pour verifier l'echec**

Run: `node scripts/test-presse.mjs`
Expected: FAIL (`loadWebFacts is not a function`).

- [ ] **Step 3 : implementer dans `src/engine/presse.js`**

Remplacer le bloc des fonctions `loadPresseFacts` et `latestPresseDate` (de `export function loadPresseFacts` jusqu'a la fin de `latestPresseDate`) par :

```js
// Charge data/<prefix><date>.json. Renvoie toujours { teams: {...} }. Fichier absent ou
// illisible = couche indisponible : degradation silencieuse, jamais d'erreur propagee.
export function loadFacts(prefix, date, dataDir) {
  if (!prefix || !date || !dataDir) return { teams: {} };
  try {
    const raw = readFileSync(join(dataDir, `${prefix}${date}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.teams ? parsed : { teams: {} };
  } catch {
    return { teams: {} };
  }
}

export function loadPresseFacts(date, dataDir) {
  return loadFacts("presse-facts-", date, dataDir);
}

export function loadWebFacts(date, dataDir) {
  return loadFacts("web-facts-", date, dataDir);
}

// Date du fichier <prefix>AAAA-MM-JJ.json le plus recent, a moins de maxAgeDays de refDate.
// Repli quand l'app n'envoie pas de date ; borne temporelle pour ne pas ressortir du
// contexte perime. Renvoie null si rien d'exploitable.
export function latestFactsDate(prefix, dataDir, refDate, maxAgeDays = 4) {
  if (!prefix || !dataDir) return null;
  try {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}(\\d{4}-\\d{2}-\\d{2})\\.json$`);
    const dates = readdirSync(dataDir)
      .map((f) => f.match(re))
      .filter(Boolean)
      .map((m) => m[1])
      .sort();
    if (!dates.length) return null;
    const latest = dates[dates.length - 1];
    if (refDate) {
      const ageDays = Math.abs(Date.parse(refDate) - Date.parse(latest)) / 86400000;
      if (ageDays > maxAgeDays) return null;
    }
    return latest;
  } catch {
    return null;
  }
}

export function latestPresseDate(dataDir, refDate, maxAgeDays = 4) {
  return latestFactsDate("presse-facts-", dataDir, refDate, maxAgeDays);
}

export function latestWebDate(dataDir, refDate, maxAgeDays = 4) {
  return latestFactsDate("web-facts-", dataDir, refDate, maxAgeDays);
}
```

- [ ] **Step 4 : lancer pour verifier le succes (et non-regression presse)**

Run: `node scripts/test-presse.mjs`
Expected: `presse: N OK, 0 KO` (les anciens tests presse passent toujours, les nouveaux web aussi).

- [ ] **Step 5 : stager**

```bash
git add src/engine/presse.js scripts/test-presse.mjs
```

---

## Task 2 : teamsPlayingSoon et buildContextBlock

**Files:**
- Modify: `src/engine/presse.js`
- Modify: `scripts/test-presse.mjs`

- [ ] **Step 1 : ecrire les tests qui echouent**

Completer l'import depuis presse.js dans `scripts/test-presse.mjs` pour inclure `teamsPlayingSoon, buildContextBlock`. Puis, avant le `console.log(...)` final, ajouter :

```js
// teamsPlayingSoon : equipes (canoniques) qui jouent dans la fenetre, depuis les fixtures.
const fixtures = [
  { date: "2026-06-11", domicile: "Mexique", exterieur: "Afrique du Sud" },
  { date: "2026-06-12", domicile: "Canada", exterieur: "Bosnie" },
  { date: "2026-06-20", domicile: "France", exterieur: "Senegal" },
];
const fakeCanon = (n) => ({ Mexique: "Mexico", "Afrique du Sud": "South Africa", Canada: "Canada", Bosnie: "Bosnia and Herzegovina", France: "France", Senegal: "Senegal" }[n] || null);
const soon = teamsPlayingSoon(fixtures, "2026-06-11", 2, fakeCanon);
ok(soon.includes("Mexico") && soon.includes("South Africa") && soon.includes("Canada"), "equipes de la fenetre presentes");
ok(!soon.includes("France"), "equipe hors fenetre absente");
ok(new Set(soon).size === soon.length, "pas de doublon");

// buildContextBlock : bloc etiquete par provenance, vide si rien.
ok(buildContextBlock("Pays-Bas", "Japon", { home: [], away: [] }, { home: [], away: [] }) === "", "aucun fait -> bloc vide");
const cb = buildContextBlock("Pays-Bas", "Japon", { home: ["De Ligt absent"], away: [] }, { home: ["Timber forfait"], away: ["Mitoma forfait"] });
ok(cb.includes("Pays-Bas :") && cb.includes("L'Equipe : De Ligt absent") && cb.includes("Web (Foot Mercato, RMC) : Timber forfait"), "provenance presse et web distinguees");
ok(cb.includes("Japon :") && cb.includes("Mitoma forfait"), "faits de l'equipe exterieure presents");
```

- [ ] **Step 2 : lancer pour verifier l'echec**

Run: `node scripts/test-presse.mjs`
Expected: FAIL (`teamsPlayingSoon is not a function`).

- [ ] **Step 3 : implementer dans `src/engine/presse.js`**

Ajouter a la fin de `src/engine/presse.js` :

```js
// Equipes (noms canoniques) qui jouent entre fromDate et fromDate+days inclus, depuis les
// fixtures mpp-points.json. canonical est une fonction nom -> nom canonique (ou null).
export function teamsPlayingSoon(fixtures, fromDate, days, canonical) {
  if (!Array.isArray(fixtures) || !fromDate) return [];
  const from = Date.parse(fromDate);
  const to = from + days * 86400000;
  const out = [];
  const seen = new Set();
  for (const f of fixtures) {
    const t = Date.parse(f.date);
    if (Number.isNaN(t) || t < from || t > to) continue;
    for (const name of [f.domicile, f.exterieur]) {
      const key = canonical(name);
      if (key && !seen.has(key)) { seen.add(key); out.push(key); }
    }
  }
  return out;
}

// Lignes de contexte d'une equipe, etiquetees par provenance (presse L'Equipe, web).
function teamContextLines(name, presseFacts, webFacts) {
  const parts = [];
  if (presseFacts.length) parts.push(`  L'Equipe : ${presseFacts.join(" ; ")}`);
  if (webFacts.length) parts.push(`  Web (Foot Mercato, RMC) : ${webFacts.join(" ; ")}`);
  return parts.length ? [`${name} :`, ...parts] : [];
}

// Bloc de contexte injecte dans le prompt Anthropic, fusionnant presse et web par equipe.
// presseFor et webFor sont les sorties de factsForTeams ({ home: [...], away: [...] }).
// Vide si aucun fait : le prompt reste alors inchange.
export function buildContextBlock(homeName, awayName, presseFor, webFor) {
  const lines = [
    ...teamContextLines(homeName, presseFor.home, webFor.home),
    ...teamContextLines(awayName, presseFor.away, webFor.away),
  ];
  if (!lines.length) return "";
  return `\n\nContexte du jour, faits concrets a integrer comme contexte (ce n'est pas un pronostic, n'invente rien au dela de ces faits ; un fait confirme par les deux sources est plus sur) :\n${lines.join("\n")}`;
}
```

- [ ] **Step 4 : lancer pour verifier le succes**

Run: `node scripts/test-presse.mjs && node scripts/test-buteur.mjs`
Expected: les deux suites a `0 KO`.

- [ ] **Step 5 : stager**

```bash
git add src/engine/presse.js scripts/test-presse.mjs
```

---

## Task 3 : script local veille.mjs (Anthropic web search + recoupement)

**Files:**
- Create: `scripts/veille.mjs`

Pas de test unitaire (depend d'Anthropic et du reseau) : la validation est un run reel controle par l'humain. Le code reutilise les fonctions pures deja testees.

- [ ] **Step 1 : ecrire `scripts/veille.mjs`**

Create `scripts/veille.mjs` :

```js
// Veille web locale : pour les equipes des matchs a venir, interroge les sites specialises
// retenus (Foot Mercato, RMC) via la recherche web Anthropic, RECOUPE avec les faits du PDF
// L'Equipe du jour, et ecrit data/web-facts-AAAA-MM-JJ.json. A lancer A LA DEMANDE.
//
// Usage :
//   node scripts/veille.mjs                       # equipes jouant dans les 2 prochains jours
//   node scripts/veille.mjs 2026-06-10 --days 3   # fenetre explicite
//   node scripts/veille.mjs 2026-06-10 --teams "Netherlands,Japan"
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { cleanJsonText, loadPresseFacts, factsForTeams, teamsPlayingSoon } from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };
import mpp from "../data/mpp-points.json" with { type: "json" };

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL = "claude-sonnet-4-6";
const DOMAINS = ["footmercato.net", "rmcsport.bfmtv.com"];

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* pas de .env.local : on garde l'env shell */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Args : [date] [--days N] [--teams "A,B"].
function parseArgs(argv) {
  const out = { date: new Date().toISOString().slice(0, 10), days: 2, teams: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") out.days = Number(argv[++i]) || 2;
    else if (argv[i] === "--teams") out.teams = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(argv[i])) out.date = argv[i];
  }
  return out;
}

// Interroge le web (domaines retenus) pour une equipe et recoupe avec ses faits presse.
async function veilleTeam(client, team, presseFacts, date) {
  const prompt = `Nous sommes le ${date}, Coupe du Monde 2026. Sujet : la selection nationale ${team}.

Faits deja extraits aujourd'hui du journal L'Equipe pour cette equipe :
${presseFacts.length ? presseFacts.map((f) => "- " + f).join("\n") : "(aucun)"}

Cherche sur le web, UNIQUEMENT sur Foot Mercato et RMC, les informations recentes et concretes sur cette selection pour ses matchs a venir : blessures, forfaits, suspensions, retours, turnover, compositions probables, forme recente, enjeu. N'invente rien, ne garde que ce qui est ecrit sur ces sites.

Puis RECOUPE avec les faits L'Equipe ci-dessus. Reponds UNIQUEMENT avec ce JSON, sans texte autour :
{"facts": ["faits web concrets, confirmes ou nouveaux, en francais"], "reconciliation": {"confirmedByBoth": ["fait dit par le PDF ET le web"], "webOnly": ["fait vu seulement sur le web"], "pdfOnly": ["fait du PDF non confirme par le web"], "contradictions": ["divergence entre PDF et web"]}}`;

  let message;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, allowed_domains: DOMAINS }],
        messages: [{ role: "user", content: prompt }],
      });
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/overloaded|429|529/i.test(msg) && attempt < 4) {
        const wait = 2000 * attempt;
        console.error(`  surcharge, reessai dans ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      console.error(`  echec Anthropic pour ${team} :`, msg);
      return { facts: [], sources: [], reconciliation: {} };
    }
  }

  const text = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const sources = [];
  for (const b of message.content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(cleanJsonText(text));
  } catch {
    console.error(`  reponse non parseable pour ${team}`);
    return { facts: [], sources: sources.slice(0, 5), reconciliation: {} };
  }
  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 6) : [],
    sources: sources.slice(0, 5),
    reconciliation: parsed.reconciliation && typeof parsed.reconciliation === "object" ? parsed.reconciliation : {},
  };
}

async function main() {
  loadEnvLocal();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error("ANTHROPIC_API_KEY absente (.env.local ou env shell)."); process.exit(1); }

  const { date, days, teams: teamsArg } = parseArgs(process.argv.slice(2));
  const canonical = (n) => canonicalTeam(n, elo.ratings);
  const teams = teamsArg
    ? teamsArg.map((t) => canonical(t) || t)
    : teamsPlayingSoon(mpp.matchs, date, days, canonical);

  if (!teams.length) { console.error("Aucune equipe a sonder (verifier la date ou --teams)."); process.exit(1); }
  console.log(`Date : ${date} | equipes a sonder (${teams.length}) : ${teams.join(", ")}`);

  const presse = loadPresseFacts(date, join(ROOT, "data"));
  const client = new Anthropic({ apiKey: key });
  const out = { source: "web (Foot Mercato, RMC)", date, generatedAt: new Date().toISOString(), teams: {} };

  for (const team of teams) {
    const { home: presseFacts } = factsForTeams(presse, team, null);
    process.stdout.write(`- ${team}... `);
    const res = await veilleTeam(client, team, presseFacts, date);
    if (res.facts.length || (res.reconciliation && Object.keys(res.reconciliation).length)) {
      out.teams[team] = { facts: res.facts, sources: res.sources, reconciliation: res.reconciliation };
      console.log(`${res.facts.length} faits`);
    } else {
      console.log("rien");
    }
    await sleep(500);
  }

  const outPath = join(ROOT, "data", `web-facts-${date}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nEcrit : data/web-facts-${date}.json (${Object.keys(out.teams).length} equipes)`);

  // Briefing de recoupement.
  console.log("\n=== Recoupement presse / web ===");
  for (const [team, v] of Object.entries(out.teams)) {
    const r = v.reconciliation || {};
    console.log(`\n${team}`);
    if (r.confirmedByBoth?.length) console.log("  confirme (2 sources) : " + r.confirmedByBoth.join(" | "));
    if (r.webOnly?.length) console.log("  web seulement : " + r.webOnly.join(" | "));
    if (r.pdfOnly?.length) console.log("  PDF seulement : " + r.pdfOnly.join(" | "));
    if (r.contradictions?.length) console.log("  CONTRADICTION : " + r.contradictions.join(" | "));
  }
}

main();
```

- [ ] **Step 2 : verifier la syntaxe sans appeler Anthropic**

Run: `node --check scripts/veille.mjs`
Expected: aucune sortie.

- [ ] **Step 3 : stager**

```bash
git add scripts/veille.mjs
```

---

## Task 4 : brancher api/analyze.js (deux couches stockees, sans recherche web en direct)

**Files:**
- Modify: `api/analyze.js`
- Modify: `vercel.json`

Avant edition, lire le `api/analyze.js` courant pour ancrer les modifications.

- [ ] **Step 1 : modifier vercel.json pour embarquer les deux familles de faits**

Remplacer le contenu de `vercel.json` par :

```json
{
  "framework": "vite",
  "functions": {
    "api/analyze.js": {
      "includeFiles": "data/*-facts-*.json"
    }
  }
}
```

- [ ] **Step 2 : mettre a jour les imports d'`api/analyze.js`**

Remplacer la ligne d'import depuis presse.js par :

```js
import { loadPresseFacts, loadWebFacts, factsForTeams, buildContextBlock, latestPresseDate, latestWebDate } from "../src/engine/presse.js";
```

- [ ] **Step 3 : charger les deux couches et construire le bloc de contexte**

Remplacer le bloc actuel (de `const dataDir = join(process.cwd(), "data");` jusqu'a la ligne `const presseBlock = buildPresseBlock(...)`) par :

```js
  // Deux couches de contexte stockees : presse (PDF L'Equipe) et web (Foot Mercato, RMC).
  // Chacune : jour courant, sinon fichier le plus recent (borne a 4 jours). Anti-doublon :
  // elles ajustent le meme multiplicateur, ce ne sont pas des sources de fusion separees.
  const dataDir = join(process.cwd(), "data");
  const pickFacts = (load, latest) => {
    let f = load(today, dataDir);
    if (!Object.keys(f.teams).length) { const d = latest(dataDir, today); if (d) f = load(d, dataDir); }
    return f;
  };
  const presse = pickFacts(loadPresseFacts, latestPresseDate);
  const web = pickFacts(loadWebFacts, latestWebDate);
  const homeKey = canonicalTeam(home, elo.ratings);
  const awayKey = canonicalTeam(away, elo.ratings);
  const presseFor = factsForTeams(presse, homeKey, awayKey);
  const webFor = factsForTeams(web, homeKey, awayKey);
  const contextBlock = buildContextBlock(home, away, presseFor, webFor);
  // Sources affichees : celles stockees par la veille web pour les deux equipes.
  const webSources = [];
  for (const k of [homeKey, awayKey]) {
    const s = (web.teams[k] && web.teams[k].sources) || [];
    for (const src of s) if (src && src.url) webSources.push(src);
  }
```

- [ ] **Step 4 : reecrire le prompt et retirer la recherche web en direct**

Le prompt actuel commence par "Cherche sur le web le contexte recent..." et la requete porte un outil `web_search`. Remplacer le prompt complet par celui ci-dessous (il n'ordonne plus de recherche web, il interprete le contexte stocke), et inserer `${contextBlock}` avant la consigne JSON :

```js
  const prompt = `Nous sommes le ${today}, Coupe du Monde 2026. Match : ${home} contre ${away}.
Tu ne predis pas le resultat. A partir du contexte connu ci-dessous et de ta connaissance des deux selections, traduis le contexte en deux multiplicateurs sur les buts attendus de chaque equipe :
- 1.0 = rien de notable.
- en dessous de 1.0 = l'equipe devrait marquer moins que sa norme (absences offensives, turnover, sans enjeu).
- au dessus de 1.0 = l'equipe devrait marquer plus (adversaire diminue en defense, forme exceptionnelle).
Reste mesure : la plupart des multiplicateurs sont entre 0.85 et 1.15. Maximum 0.6 a 1.4. Si le contexte est vide, renvoie 1.0 et 1.0.${contextBlock}

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"multHome": float, "multAway": float, "reasoning": "2 phrases max en francais", "factors": ["fait court", "..."]}`;
```

Puis, dans l'appel `client.messages.create({ ... })`, SUPPRIMER la ligne de l'outil :

```js
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
```

- [ ] **Step 5 : sources issues des web-facts, plus de la recherche en direct**

Le bloc actuel qui collecte `sources` depuis les `web_search_tool_result` n'a plus lieu d'etre (il n'y a plus de recherche). Remplacer la collecte de `sources` (la boucle sur `message.content` qui remplit `const sources = []`) par l'usage de `webSources`. Dans la reponse finale `res.json({...})`, remplacer `sources: sources.slice(0, 5)` par :

```js
    sources: webSources.slice(0, 5),
```

et supprimer la declaration `const sources = [];` et sa boucle de remplissage devenues inutiles.

- [ ] **Step 6 : test de fumee local des parties pures (sans Anthropic)**

Create temporaire `scripts/test-analyze2-wiring.mjs` :

```js
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPresseFacts, loadWebFacts, factsForTeams, buildContextBlock } from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };

const dir = mkdtempSync(join(tmpdir(), "ctx-"));
writeFileSync(join(dir, "presse-facts-2026-06-09.json"), JSON.stringify({ teams: { Netherlands: { facts: ["De Ligt absent"] } } }));
writeFileSync(join(dir, "web-facts-2026-06-09.json"), JSON.stringify({ teams: { Netherlands: { facts: ["Timber forfait"], sources: [{ title: "FM", url: "https://footmercato.net/x" }] }, Japan: { facts: ["Mitoma forfait"], sources: [] } } }));
const presse = loadPresseFacts("2026-06-09", dir);
const web = loadWebFacts("2026-06-09", dir);
const hk = canonicalTeam("Pays-Bas", elo.ratings);
const ak = canonicalTeam("Japon", elo.ratings);
const pf = factsForTeams(presse, hk, ak);
const wf = factsForTeams(web, hk, ak);
const block = buildContextBlock("Pays-Bas", "Japon", pf, wf);
console.log(block);
rmSync(dir, { recursive: true, force: true });
if (hk !== "Netherlands" || ak !== "Japan" || !block.includes("De Ligt absent") || !block.includes("Timber forfait") || !block.includes("Mitoma forfait")) { console.error("KO"); process.exit(1); }
console.log("\nwiring2 OK");
```

Run: `node scripts/test-analyze2-wiring.mjs`
Expected: le bloc montre Pays-Bas (L'Equipe : De Ligt absent / Web : Timber forfait) et Japon (Web : Mitoma forfait), puis `wiring2 OK`. Supprimer ensuite ce fichier : `rm scripts/test-analyze2-wiring.mjs`.

- [ ] **Step 7 : valider la syntaxe**

Run: `node --check api/analyze.js`
Expected: aucune sortie.

- [ ] **Step 8 : stager**

```bash
git add api/analyze.js vercel.json
```

---

## Task 5 : run reel de la veille et revue du recoupement

**Files:** aucun (validation, pilotee par l'humain).

- [ ] **Step 1 : lancer la veille sur un match a venir**

Run: `node scripts/veille.mjs 2026-06-10 --teams "Netherlands,Japan"`
Expected: pour chaque equipe, des faits issus de Foot Mercato / RMC, puis `Ecrit : data/web-facts-2026-06-10.json` et un briefing de recoupement.

- [ ] **Step 2 : afficher les faits et le recoupement**

Run: `node -e "const f=require('./data/web-facts-2026-06-10.json'); for (const [t,v] of Object.entries(f.teams)) { console.log('### '+t); (v.facts||[]).forEach(x=>console.log('  - '+x)); console.log('  sources:', (v.sources||[]).map(s=>s.url).join(', ')); }"`
Expected: faits concrets par equipe avec sources footmercato/rmc.

- [ ] **Step 3 : point d'arret pour revue utilisateur**

Montrer le recoupement a l'utilisateur (confirme par les deux, web seulement, contradictions) et obtenir son accord AVANT tout commit ou deploiement.

- [ ] **Step 4 : stager le fichier de faits web (commit toujours differe)**

```bash
git add data/web-facts-2026-06-10.json
```

---

## Notes de fin

- Commit, merge sur main et push : differes jusqu'a l'accord explicite de l'utilisateur (un push sur main deploie).
- Cout : la veille fait un appel Anthropic par equipe sondee. Defaut prudent : 2 jours de fenetre. Utiliser `--teams` pour cibler et limiter.
- Comportement runtime apres ce changement : `api/analyze.js` ne fait plus de recherche web en direct. Le contexte web n'est present que si une veille recente (< 4 jours) a ete stockee. C'est le mode "a la demande" voulu. Reversible (remettre l'outil web_search et la collecte de sources).
- GEMINI_API_KEY reste pour `revue.mjs` (PDF). `veille.mjs` utilise ANTHROPIC_API_KEY (deja en prod).

## Self-review (couverture spec)

- Sources retenues Foot Mercato + RMC, Marca/L'Equipe ecartees : Task 3 (DOMAINS), doc.
- Couche web stockee `web-facts-*.json` : Task 3.
- Veille a la demande, par equipe des matchs a venir : Task 3 (teamsPlayingSoon, args).
- Fourniture des faits PDF au modele et recoupement en une etape : Task 3 (prompt, reconciliation).
- Briefing de recoupement affiche : Task 3 (Step 1, section briefing).
- Generalisation loadFacts/latestFactsDate + variantes web : Task 1.
- teamsPlayingSoon, buildContextBlock (fusion etiquetee, subsume mergeFactLayers) : Task 2.
- analyze.js consomme les deux couches, retrait de la recherche web en direct, sources depuis web-facts : Task 4.
- includeFiles couvre presse et web : Task 4 (glob `data/*-facts-*.json`).
- Tests TDD des fonctions pures : Tasks 1, 2 ; fumee d'integration Task 4 ; run reel Task 5.
- Anti-doublon (un seul multiplicateur) : Task 4 (buildContextBlock unique, prompt unique).
