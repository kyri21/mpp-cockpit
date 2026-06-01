// Modele structurel du pronostic Meilleur buteur (Soulier d'Or CdM 2026).
// Estime les buts attendus d'une equipe sur TOUT le tournoi (poule + parcours a elimination
// directe), puis, via la part de buts du joueur, ses buts attendus personnels. Fonctions pures,
// testables sans React, dans l'esprit de calcul.js.
//
// Reutilise le moteur Elo de calcul.js SANS le modifier. Pour faire jouer une equipe contre un
// adversaire d'un Elo donne (adversaire "type" d'un tour KO), on injecte un adversaire
// synthetique dans l'objet ratings : forceModel sait alors resoudre son Elo.
//
// Phase 1 : on classe les candidats par buts attendus (lambda) et on derive une probabilite
// approchee (normalisation) pour l'esperance de points MPP. La vraie P(meilleur buteur) par
// argmax de Poisson et la fusion des cotes sont reportees en Phase 2.

import { forceModel } from "./calcul.js";

const VIRT = "__BUTEUR_ADV_TYPE__"; // nom d'adversaire synthetique (Elo injecte dans ratings)
export const THIRD_QUALIFY_FACTOR = 0.6; // approx des 8 meilleurs 3es sur 12 (affine en Phase 2)
const GROUP_SIMS = 20000; // tirages Monte Carlo par poule
export const KO_ROUNDS = ["R32", "R16", "QF", "SF", "F"];

const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Normalisation des noms d'equipe (minuscules, sans accents) pour comparer un nom candidat aux
// noms des fixtures sans souffrir des accents ("Bresil" vs "Bresil" accentue).
const norm = (s) => (s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Ramene un nom d'equipe a sa graphie exacte dans les fixtures (pour les comparaisons ===).
function canonicalTeam(team, fixtures) {
  const n = norm(team);
  for (const f of fixtures) {
    if (norm(f.domicile) === n) return f.domicile;
    if (norm(f.exterieur) === n) return f.exterieur;
  }
  return team;
}

// Tirage Poisson (algorithme de Knuth) pour echantillonner les scores de poule.
function samplePoisson(lambda, rng = Math.random) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// Buts attendus de `team` contre un adversaire d'Elo `oppElo` (neutre par defaut).
function goalsVsElo(team, oppElo, ratings, homeAdvantage = 0) {
  const fm = forceModel(team, VIRT, { ...ratings, [VIRT]: oppElo }, { homeAdvantage });
  return fm ? fm.lambda[0] : null;
}

// P(team gagne) contre un adversaire d'Elo `oppElo`. En KO, le nul part en prolongation /
// penalty : on le repartit 50/50.
function winProbVsElo(team, oppElo, ratings) {
  const fm = forceModel(team, VIRT, { ...ratings, [VIRT]: oppElo }, { homeAdvantage: 0 });
  if (!fm) return null;
  const [p1, pN] = fm.p;
  return p1 + 0.5 * pN;
}

// Adversaires "type" par tour KO : mediane de l'Elo des meilleures equipes encore en lice.
// R32 = mediane top 32, R16 = top 16, QF = top 8, SF = top 4, Finale = top 2.
export function typicalOpponents(participatingElos) {
  const sorted = [...participatingElos].filter((x) => x != null).sort((a, b) => b - a);
  const topMedian = (n) => median(sorted.slice(0, Math.min(n, sorted.length)));
  return { R32: topMedian(32), R16: topMedian(16), QF: topMedian(8), SF: topMedian(4), F: topMedian(2) };
}

// Les adversaires de poule de `team`, lus dans les fixtures { domicile, exterieur }.
export function groupOpponents(team, fixtures) {
  const t = canonicalTeam(team, fixtures);
  const opp = [];
  for (const f of fixtures) {
    if (f.domicile === t) opp.push(f.exterieur);
    else if (f.exterieur === t) opp.push(f.domicile);
  }
  return [...new Set(opp)];
}

// Les 6 fixtures de la poule de `team` (matchs entre les 4 equipes du groupe).
function groupFixtures(team, fixtures) {
  const t = canonicalTeam(team, fixtures);
  const group = new Set([t, ...groupOpponents(t, fixtures)]);
  return fixtures.filter((f) => group.has(f.domicile) && group.has(f.exterieur));
}

// Avantage du terrain : seul un pays hote jouant a domicile en beneficie. isHostNation est gere
// en amont (on passe l'info via le flag host des fixtures preparees).
function homeAdvFor(domicile, isHost) {
  return isHost(domicile) ? 80 : 0; // HOST_ELO_ADV
}

// Buts attendus de `team` en phase de poule (somme de ses 3 matchs).
export function expectedGroupGoals(team, fixtures, ratings, isHost = () => false) {
  const t = canonicalTeam(team, fixtures);
  let total = 0;
  const perMatch = [];
  for (const f of groupFixtures(t, fixtures)) {
    const isDom = f.domicile === t;
    const opp = isDom ? f.exterieur : f.domicile;
    if (f.domicile !== t && f.exterieur !== t) continue;
    const adv = homeAdvFor(f.domicile, isHost);
    const fm = forceModel(f.domicile, f.exterieur, ratings, { homeAdvantage: adv });
    if (!fm) { perMatch.push({ opp, goals: null }); continue; }
    const g = isDom ? fm.lambda[0] : fm.lambda[1];
    total += g;
    perMatch.push({ opp, goals: g });
  }
  return { total, perMatch };
}

// Mini Monte Carlo de la poule : P(1er), P(2e), P(3e) pour `team`.
export function groupQualifyProb(team, fixtures, ratings, isHost = () => false, sims = GROUP_SIMS) {
  const t = canonicalTeam(team, fixtures);
  const gf = groupFixtures(t, fixtures);
  const teams = [...new Set([t, ...groupOpponents(t, fixtures)])];
  // Pre-calcule les lambdas de chaque match (domicile, exterieur).
  const matches = gf.map((f) => {
    const fm = forceModel(f.domicile, f.exterieur, ratings, { homeAdvantage: homeAdvFor(f.domicile, isHost) });
    return { h: f.domicile, a: f.exterieur, lh: fm ? fm.lambda[0] : 1, la: fm ? fm.lambda[1] : 1 };
  });
  const place = { p1: 0, p2: 0, p3: 0 };
  for (let s = 0; s < sims; s++) {
    const pts = {}, gd = {}, gf_ = {};
    for (const t of teams) { pts[t] = 0; gd[t] = 0; gf_[t] = 0; }
    for (const m of matches) {
      const gh = samplePoisson(m.lh), ga = samplePoisson(m.la);
      gf_[m.h] += gh; gf_[m.a] += ga; gd[m.h] += gh - ga; gd[m.a] += ga - gh;
      if (gh > ga) pts[m.h] += 3; else if (gh < ga) pts[m.a] += 3; else { pts[m.h] += 1; pts[m.a] += 1; }
    }
    // Classement : points, puis difference de buts, puis buts marques, puis aleatoire stable.
    const ranking = [...teams].sort((x, y) =>
      pts[y] - pts[x] || gd[y] - gd[x] || gf_[y] - gf_[x] || (Math.random() - 0.5));
    const pos = ranking.indexOf(t);
    if (pos === 0) place.p1++; else if (pos === 1) place.p2++; else if (pos === 2) place.p3++;
  }
  return { p1: place.p1 / sims, p2: place.p2 / sims, p3: place.p3 / sims };
}

// Buts attendus de `team` sur tout le tournoi : poule + parcours KO pondere par la proba
// d'atteindre chaque tour. Renvoie aussi les P(atteindre tour) et le nombre de matchs attendus.
export function expectedTournamentGoals(team, fixtures, ratings, opponents, isHost = () => false) {
  const t = canonicalTeam(team, fixtures);
  const group = expectedGroupGoals(t, fixtures, ratings, isHost);
  const q = groupQualifyProb(t, fixtures, ratings, isHost);
  const advance = q.p1 + q.p2 + q.p3 * THIRD_QUALIFY_FACTOR; // P(atteindre les KO / R32)

  const reach = {};
  let pReach = advance;
  let koGoals = 0;
  let expectedKoMatches = 0;
  for (const r of KO_ROUNDS) {
    reach[r] = pReach;
    const g = goalsVsElo(t, opponents[r], ratings);
    if (g != null) koGoals += pReach * g;
    expectedKoMatches += pReach;
    const win = winProbVsElo(t, opponents[r], ratings);
    pReach = win != null ? pReach * win : 0;
  }
  return {
    groupGoals: group.total,
    koGoals,
    total: group.total + koGoals,
    reach,                                  // P(atteindre R32, R16, QF, SF, F)
    expectedMatches: 3 + expectedKoMatches, // 3 matchs de poule + esperance de matchs KO
    perGroupMatch: group.perMatch,
  };
}

// Liste des Elos des equipes participantes (pour calibrer les adversaires types).
export function participatingElos(fixtures, ratings, resolveEloFn) {
  const teams = new Set();
  for (const f of fixtures) { teams.add(f.domicile); teams.add(f.exterieur); }
  return [...teams].map((t) => resolveEloFn(t, ratings)).filter((x) => x != null);
}

// Classe les candidats par buts attendus. candidates : [{ joueur, equipe, points?, share?, ... }].
// share = part des buts de l'equipe prise par le joueur (penalty inclus), fournie par l'IA.
// Renvoie chaque candidat enrichi (lambda, proba approchee, esperance de points), trie par lambda.
export function rankCandidates(candidates, fixtures, ratings, { resolveEloFn, isHost = () => false } = {}) {
  const opponents = typicalOpponents(participatingElos(fixtures, ratings, resolveEloFn));
  const teamCache = new Map();
  const teamGoals = (team) => {
    if (!teamCache.has(team)) teamCache.set(team, expectedTournamentGoals(team, fixtures, ratings, opponents, isHost));
    return teamCache.get(team);
  };

  const enriched = candidates.map((c) => {
    const tg = teamGoals(c.equipe);
    const share = typeof c.share === "number" ? c.share : null;
    const lambda = share != null ? share * tg.total : null;
    return {
      ...c,
      teamGoals: tg.total,
      reachSF: tg.reach.SF ?? 0,
      expectedMatches: tg.expectedMatches,
      lambda,
      eloKnown: Number.isFinite(tg.total) && tg.total > 0,
    };
  });

  // Probabilite approchee = part de lambda dans le pool (Phase 1). Esperance = P x points.
  const sumLambda = enriched.reduce((a, e) => a + (e.lambda || 0), 0);
  for (const e of enriched) {
    e.pApprox = sumLambda > 0 && e.lambda != null ? e.lambda / sumLambda : null;
    e.expectedPoints = e.pApprox != null && typeof e.points === "number" ? e.pApprox * e.points : null;
  }
  enriched.sort((a, b) => (b.lambda || 0) - (a.lambda || 0));
  return { opponents, candidates: enriched };
}
