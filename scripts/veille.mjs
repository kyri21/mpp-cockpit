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
