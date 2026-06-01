// Tests d'invariants du modele buteur (Phase 1). Lance : node scripts/test-buteur.mjs
// Pas de framework : assertions Node simples, dans l'esprit de buildElo.js / calibrate.js.

import { resolveElo, isHostNation } from "../src/engine/calcul.js";
import {
  groupOpponents, expectedGroupGoals, expectedTournamentGoals,
  typicalOpponents, participatingElos, rankCandidates, KO_ROUNDS,
} from "../src/engine/buteur.js";
import elo from "../data/elo-ratings.json" with { type: "json" };
import mpp from "../data/mpp-points.json" with { type: "json" };

const ratings = elo.ratings;
const fixtures = mpp.matchs;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  FAIL:", msg); } };

// T1 : toutes les equipes des fixtures se resolvent sur l'Elo (mapping FR -> EN complet).
const teams = new Set();
for (const f of fixtures) { teams.add(f.domicile); teams.add(f.exterieur); }
const unresolved = [...teams].filter((t) => resolveElo(t, ratings) == null);
ok(unresolved.length === 0, `equipes non resolues: ${unresolved.join(", ")}`);
ok(teams.size === 48, `attendu 48 equipes, vu ${teams.size}`);

// T2 : chaque equipe a exactement 3 adversaires de poule.
const badGroups = [...teams].filter((t) => groupOpponents(t, fixtures).length !== 3);
ok(badGroups.length === 0, `equipes sans 3 adversaires: ${badGroups.join(", ")}`);

// Opponents types pour le reste.
const opponents = typicalOpponents(participatingElos(fixtures, ratings, resolveElo));
ok(KO_ROUNDS.every((r) => Number.isFinite(opponents[r])), "adversaires types non finis");
// Les adversaires montent en gamme tour apres tour (mediane top-k decroissant en k => Elo croissant).
ok(opponents.R32 <= opponents.R16 && opponents.R16 <= opponents.QF
   && opponents.QF <= opponents.SF && opponents.SF <= opponents.F, "adversaires types non croissants");

// T3 : structurel d'une equipe (France).
const tg = expectedTournamentGoals("France", fixtures, ratings, opponents, isHostNation);
ok(Number.isFinite(tg.total) && tg.total > 0, `total France non valide: ${tg.total}`);
ok(tg.total >= tg.groupGoals - 1e-9, "total < buts de poule (KO devrait ajouter du positif)");
ok(tg.expectedMatches >= 3 && tg.expectedMatches <= 8, `matchs attendus hors [3,8]: ${tg.expectedMatches}`);
// P(atteindre tour) decroissante.
let prev = 1, decroit = true;
for (const r of KO_ROUNDS) { if (tg.reach[r] > prev + 1e-9) decroit = false; prev = tg.reach[r]; }
ok(decroit, "P(atteindre tour) non decroissante");
ok(expectedGroupGoals("France", fixtures, ratings, isHostNation).total > 0, "buts poule France <= 0");

// T4 : classement de candidats.
const cands = [
  { joueur: "Joueur A", equipe: "France", points: 50, share: 0.30 },
  { joueur: "Joueur B", equipe: "Angleterre", points: 40, share: 0.30 },
  { joueur: "Joueur C", equipe: "Bresil", points: 45, share: 0.28 },
];
const { candidates } = rankCandidates(cands, fixtures, ratings, { resolveEloFn: resolveElo, isHost: isHostNation });
ok(candidates.every((c) => Number.isFinite(c.lambda) && c.lambda > 0), "lambda candidat non valide");
ok(candidates.every((c, i) => i === 0 || candidates[i - 1].lambda >= c.lambda), "candidats non tries par lambda");
const sumP = candidates.reduce((a, c) => a + (c.pApprox || 0), 0);
ok(Math.abs(sumP - 1) < 1e-6, `somme des probas approchees != 1: ${sumP}`);
ok(candidates.every((c) => Number.isFinite(c.expectedPoints)), "esperance de points non valide");

// T5 : la part du joueur scale lineairement le lambda. Meme equipe dans UN SEUL appel : le cache
// par equipe garantit un teamGoals identique (sinon le Monte Carlo de poule diffère a chaque appel).
const rScale = rankCandidates([
  { joueur: "X", equipe: "France", points: 10, share: 0.40 },
  { joueur: "Y", equipe: "France", points: 10, share: 0.20 },
], fixtures, ratings, { resolveEloFn: resolveElo, isHost: isHostNation });
const cx = rScale.candidates.find((c) => c.joueur === "X");
const cy = rScale.candidates.find((c) => c.joueur === "Y");
const ratio = cx.lambda / cy.lambda;
ok(Math.abs(ratio - 2) < 1e-9, `lambda devrait doubler quand share double, ratio = ${ratio}`);

// T6 : robustesse aux accents (le nom candidat peut differer de la graphie des fixtures).
const gAcc = expectedGroupGoals("Bresil", fixtures, ratings, isHostNation).total;     // sans accent
const gFix = expectedGroupGoals("Brésil", fixtures, ratings, isHostNation).total;     // graphie fixture
ok(gAcc > 0 && gFix > 0, `buts de poule Bresil invalides (sans accent=${gAcc}, accent=${gFix})`);

// Apercu informatif (l'intuition Kane/Mbappe : buts de poule selon la force du groupe).
console.log("\nApercu buts de poule attendus (force du groupe) :");
for (const t of ["France", "Angleterre", "Espagne", "Bresil", "Argentine"]) {
  const g = expectedGroupGoals(t, fixtures, ratings, isHostNation);
  const tgt = expectedTournamentGoals(t, fixtures, ratings, opponents, isHostNation);
  console.log(`  ${t.padEnd(12)} poule=${g.total.toFixed(2)}  tournoi=${tgt.total.toFixed(2)}  P(demies)=${(tgt.reach.SF * 100).toFixed(0)}%  matchs~${tgt.expectedMatches.toFixed(1)}`);
}

console.log(`\n${fail === 0 ? "OK" : "ECHEC"} : ${pass} assertions passees, ${fail} echouees.`);
process.exit(fail === 0 ? 0 : 1);
