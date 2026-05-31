// Precalcule un Elo par nation depuis l'historique des matchs internationaux.
// Methode World Football Elo : K-factor pondere par l'importance du match
// et l'ecart de buts, avantage du terrain de 100 points.
//
// Entree  : data/intl-results.csv (date,home_team,away_team,home_score,away_score,tournament,city,country,neutral)
// Sortie  : data/elo-ratings.json { generated_at, source, count, ratings:{team:rating}, played:{team:n} }
//
// Lancement : node scripts/buildElo.js

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Parse CSV simple avec gestion des champs entre guillemets.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

// Poids d'importance du match (K0) selon le tournoi.
function tournamentWeight(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("world cup") && !s.includes("qualification")) return 60;
  if (s.includes("uefa euro") && !s.includes("qualification")) return 50;
  if (s.includes("copa am") || s.includes("nations league") || s.includes("confederations")) return 50;
  if (s.includes("qualification")) return 40;
  if (s.includes("friendly")) return 20;
  return 30; // autres tournois officiels
}

// Multiplicateur d'ecart de buts (methode World Football Elo).
function goalMultiplier(diff) {
  const d = Math.abs(diff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

const HOME_ADV = 100; // points Elo d'avantage du terrain
const BASE = 1500;    // note de depart

const csv = readFileSync(join(ROOT, "data/intl-results.csv"), "utf8");
const rows = parseCsv(csv);

const elo = new Map();
const played = new Map();
const get = (t) => (elo.has(t) ? elo.get(t) : BASE);

// On suppose le CSV trie par date croissante (c'est le cas du dataset martj42).
for (const r of rows) {
  const home = r.home_team, away = r.away_team;
  const hs = parseInt(r.home_score), as = parseInt(r.away_score);
  if (!home || !away || Number.isNaN(hs) || Number.isNaN(as)) continue;

  const neutral = (r.neutral || "").toUpperCase() === "TRUE";
  const Rh = get(home) + (neutral ? 0 : HOME_ADV);
  const Ra = get(away);

  const We = 1 / (1 + Math.pow(10, (Ra - Rh) / 400)); // esperance de resultat pour home
  const W = hs > as ? 1 : hs === as ? 0.5 : 0;

  const K = tournamentWeight(r.tournament) * goalMultiplier(hs - as);
  const delta = K * (W - We);

  elo.set(home, get(home) + delta);
  elo.set(away, get(away) - delta);
  played.set(home, (played.get(home) || 0) + 1);
  played.set(away, (played.get(away) || 0) + 1);
}

const ratings = {};
const playedOut = {};
for (const [team, r] of [...elo.entries()].sort((a, b) => b[1] - a[1])) {
  ratings[team] = Math.round(r);
  playedOut[team] = played.get(team) || 0;
}

const out = {
  generated_at: new Date().toISOString().slice(0, 10),
  source: "martj42/international_results (CC0), Elo methode World Football Elo Ratings",
  count: Object.keys(ratings).length,
  ratings,
  played: playedOut,
};

writeFileSync(join(ROOT, "data/elo-ratings.json"), JSON.stringify(out, null, 0));

// Apercu console : top 15.
const top = Object.entries(ratings).slice(0, 15);
console.log(`${out.count} equipes notees a partir de ${rows.length} matchs.`);
console.log("Top 15 :");
for (const [t, r] of top) console.log(`  ${String(r).padStart(4)}  ${t}`);
