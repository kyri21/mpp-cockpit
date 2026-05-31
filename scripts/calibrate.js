// Calibre le modele de force sur la verite terrain (resultats reels historiques).
// Rejoue l'Elo chronologiquement, collecte pour chaque match NEUTRE recent
// l'ecart d'Elo d'avant-match et l'issue reelle, puis cherche les constantes
// (ELO_PER_GOAL, TOTAL_GOALS) qui minimisent la log-vraisemblance negative
// du modele Poisson/Dixon-Coles.
//
// Lancement : node scripts/calibrate.js

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { poissonOutcome } from "../src/engine/calcul.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row = {}; header.forEach((h, i) => { row[h] = cells[i]; }); return row;
  });
}
const tournamentWeight = (t) => {
  const s = (t || "").toLowerCase();
  if (s.includes("world cup") && !s.includes("qualification")) return 60;
  if (s.includes("uefa euro") && !s.includes("qualification")) return 50;
  if (s.includes("copa am") || s.includes("nations league") || s.includes("confederations")) return 50;
  if (s.includes("qualification")) return 40;
  if (s.includes("friendly")) return 20;
  return 30;
};
const goalMultiplier = (d) => { d = Math.abs(d); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };
const HOME_ADV = 100, BASE = 1500;

const rows = parseCsv(readFileSync(join(ROOT, "data/intl-results.csv"), "utf8"));
const elo = new Map();
const get = (t) => (elo.has(t) ? elo.get(t) : BASE);

// Echantillon de calibration : matchs neutres depuis 2002 (pertinence moderne).
const samples = []; // { dr, outcome: 0|1|2 }
for (const r of rows) {
  const home = r.home_team, away = r.away_team;
  const hs = parseInt(r.home_score), as = parseInt(r.away_score);
  if (!home || !away || Number.isNaN(hs) || Number.isNaN(as)) continue;
  const neutral = (r.neutral || "").toUpperCase() === "TRUE";
  const year = parseInt((r.date || "").slice(0, 4));

  const drRaw = get(home) - get(away);
  if (neutral && year >= 2002) {
    const outcome = hs > as ? 0 : hs === as ? 1 : 2;
    samples.push({ dr: drRaw, outcome });
  }

  const Rh = get(home) + (neutral ? 0 : HOME_ADV), Ra = get(away);
  const We = 1 / (1 + Math.pow(10, (Ra - Rh) / 400));
  const W = hs > as ? 1 : hs === as ? 0.5 : 0;
  const delta = tournamentWeight(r.tournament) * goalMultiplier(hs - as) * (W - We);
  elo.set(home, get(home) + delta);
  elo.set(away, get(away) - delta);
}

console.log(`Echantillon de calibration : ${samples.length} matchs neutres depuis 2002.`);

// Recherche en grille : minimise la NLL moyenne.
function nll(eloPerGoal, total) {
  let s = 0;
  for (const { dr, outcome } of samples) {
    const sup = dr / eloPerGoal;
    const lh = Math.max(0.25, (total + sup) / 2);
    const la = Math.max(0.25, (total - sup) / 2);
    const p = poissonOutcome(lh, la);
    s += -Math.log(Math.max(p[outcome], 1e-9));
  }
  return s / samples.length;
}

let best = { nll: Infinity, eloPerGoal: null, total: null };
for (let k = 90; k <= 260; k += 5) {
  for (let t = 2.2; t <= 3.0; t += 0.05) {
    const v = nll(k, t);
    if (v < best.nll) best = { nll: v, eloPerGoal: k, total: Math.round(t * 100) / 100 };
  }
}

console.log("Constantes actuelles  : ELO_PER_GOAL=130, TOTAL_GOALS=2.6  -> NLL", nll(130, 2.6).toFixed(4));
console.log("Constantes calibrees  : ELO_PER_GOAL=" + best.eloPerGoal, "TOTAL_GOALS=" + best.total, "-> NLL", best.nll.toFixed(4));
console.log("\nMettre ces valeurs dans src/engine/calcul.js (ELO_PER_GOAL, TOTAL_GOALS).");
