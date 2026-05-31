// Moteur de calcul MPP — fonctions pures, sans dependance React.
// Porte fidelement depuis mpp-cockpit.jsx.

export const GAMMA = { prudent: 1.7, equilibre: 1.0, agressif: 0.5 };

const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));

export const poisson = (k, l) => (Math.exp(-l) * Math.pow(l, k)) / fact(k);

// Retire la marge du bookmaker et retourne les 3 probabilites reelles.
export function vigRemove(o1, oN, o2) {
  const inv = [1 / o1, 1 / oN, 1 / o2];
  const s = inv[0] + inv[1] + inv[2];
  return inv.map((x) => x / s);
}

// Repartition reelle de la foule MPP (champs c1/cN/c2 du formulaire), renormalisee.
// Accepte 82 (pourcentage) ou 0.82 (fraction). Retourne null si la donnee manque.
export function parseCrowd(m) {
  const raw = [m.c1, m.cN, m.c2].map((v) => parseFloat(v));
  if (!raw.every((x) => x > 0)) return null;
  const frac = raw.map((x) => (x > 1 ? x / 100 : x));
  const s = frac[0] + frac[1] + frac[2];
  if (!(s > 0)) return null;
  return frac.map((x) => x / s); // renormalise les arrondis MPP (99% ou 101%)
}

// Calcule le verdict complet pour un match.
// m : { a, b, o1, oN, o2, g1, gN, g2, c1?, cN?, c2? }
// mode : "prudent" | "equilibre" | "agressif"
// pOverride : triplet de proba a utiliser (le consensus). Sinon, proba du marche.
export function computeVerdict(m, mode, pOverride) {
  const g1 = parseFloat(m.g1), gN = parseFloat(m.gN), g2 = parseFloat(m.g2);
  if (![g1, gN, g2].every((x) => x > 0)) return null;

  let p;
  if (Array.isArray(pOverride) && pOverride.length === 3 && pOverride.every((x) => x > 0)) {
    p = pOverride;
  } else {
    const o1 = parseFloat(m.o1), oN = parseFloat(m.oN), o2 = parseFloat(m.o2);
    if (![o1, oN, o2].every((x) => x > 1)) return null;
    p = vigRemove(o1, oN, o2);
  }
  const G = [g1, gN, g2];
  const ev = p.map((pi, i) => pi * G[i]);

  // Pari recommande : modes gamma inchanges.
  const gamma = GAMMA[mode];
  const score = p.map((pi, i) => G[i] * Math.pow(pi, gamma));
  const recIdx = score.indexOf(Math.max(...score));

  const pr = p[recIdx];
  let risk = "Tres eleve";
  if (pr >= 0.5) risk = "Faible";
  else if (pr >= 0.33) risk = "Modere";
  else if (pr >= 0.18) risk = "Eleve";

  const names = [m.a || "Equipe 1", "Match nul", m.b || "Equipe 2"];

  // Couche foule : utilise la repartition reelle si disponible, sinon proxy 1/points.
  const crowd = parseCrowd(m);
  let edge, crowdIdx, separation = null, lev = null, levIdx = -1, trapIdx = -1;
  if (crowd) {
    // Valeur vs foule : marche plus confiant que la foule = issue sous-jouee, sur-payee.
    edge = p.map((pi, i) => pi / crowd[i]);
    crowdIdx = crowd.indexOf(Math.max(...crowd));
    // Separation : fraction du field prise de vitesse si l'issue passe.
    separation = crowd.map((ci) => 1 - ci);
    // Levier prudent : EV ponderee par la rarete adoucie (racine carree).
    lev = p.map((pi, i) => pi * G[i] * Math.sqrt(1 - crowd[i]));
    levIdx = lev.indexOf(Math.max(...lev));
    // Piege : la foule surjoue son favori de plus de 15 points vs le marche.
    trapIdx = crowd[crowdIdx] - p[crowdIdx] > 0.15 ? crowdIdx : -1;
  } else {
    const invG = G.map((g) => 1 / g);
    const sInvG = invG.reduce((a, b) => a + b, 0);
    const pMpp = invG.map((x) => x / sInvG);
    edge = p.map((pi, i) => pi / pMpp[i]);
    crowdIdx = p.indexOf(Math.max(...p));
  }

  return { p, G, ev, edge, recIdx, crowdIdx, risk, names, gamma, crowd, separation, lev, levIdx, trapIdx };
}

// Estime les buts attendus a partir des cotes (heuristique CdM : 2.6 buts/match).
export function estimateXg(o1, oN, o2) {
  const [p0, , p2] = vigRemove(parseFloat(o1), parseFloat(oN), parseFloat(o2));
  const total = 2.6;
  const lean = p0 - p2;
  let xa = total * (0.5 + 0.42 * lean);
  let xb = total - xa;
  return [Math.max(0.4, xa).toFixed(2), Math.max(0.4, xb).toFixed(2)];
}

// Retourne les 6 scores les plus probables selon le modele de Poisson.
export function topScores(xgA, xgB) {
  const a = parseFloat(xgA), b = parseFloat(xgB);
  if (!(a > 0) || !(b > 0)) return null;
  const out = [];
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++)
      out.push({ i, j, pr: poisson(i, a) * poisson(j, b) });
  out.sort((x, y) => y.pr - x.pr);
  let mH = 0, mD = 0, mA = 0;
  out.forEach((s) => {
    if (s.i > s.j) mH += s.pr;
    else if (s.i === s.j) mD += s.pr;
    else mA += s.pr;
  });
  return { list: out.slice(0, 6), model: [mH, mD, mA] };
}

export const pct = (x) => (x * 100).toFixed(1) + "%";

/* =========================================================================
   MODELE DE FORCE (Elo -> buts attendus -> Poisson/Dixon-Coles -> 1/N/2)
   ========================================================================= */

// Constantes calibrees sur 6702 matchs neutres depuis 2002 (scripts/calibrate.js).
export const ELO_PER_GOAL = 195; // ecart Elo correspondant a 1 but d'ecart attendu
export const TOTAL_GOALS = 2.75; // total de buts moyen attendu
export const DC_RHO = -0.10;     // correction Dixon-Coles des petits scores

function normalizeName(s) {
  return (s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Alias noms cotes/MPP -> noms du dataset Elo (anglais).
const ELO_ALIASES = {
  "usa": "united states", "korea republic": "south korea",
  "republic of korea": "south korea", "ir iran": "iran",
  "czechia": "czech republic", "china pr": "china",
  "cote d ivoire": "ivory coast", "bosnia and herzegovina": "bosnia and herzegovina",
};

// Retrouve la note Elo d'une equipe, robuste aux variantes de nom.
export function resolveElo(name, ratings) {
  if (!ratings) return null;
  if (ratings[name] != null) return ratings[name];
  const norm = normalizeName(name);
  const aliased = ELO_ALIASES[norm] || norm;
  for (const key of Object.keys(ratings)) {
    if (normalizeName(key) === aliased) return ratings[key];
  }
  return null;
}

// Correction Dixon-Coles sur les quatre petits scores.
function dcTau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// 1/N/2 a partir des buts attendus, via grille Poisson corrigee Dixon-Coles.
export function poissonOutcome(lh, la, rho = DC_RHO) {
  let p1 = 0, pN = 0, p2 = 0, norm = 0;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const pr = poisson(i, lh) * poisson(j, la) * dcTau(i, j, lh, la, rho);
      norm += pr;
      if (i > j) p1 += pr; else if (i === j) pN += pr; else p2 += pr;
    }
  }
  return [p1 / norm, pN / norm, p2 / norm];
}

// Modele de force complet pour un match. Tournoi neutre par defaut (CdM).
// Retourne { p:[1,N,2], lambda:[lh,la], elo:[Rh,Ra] } ou null si une equipe est inconnue.
export function forceModel(home, away, ratings, { homeAdvantage = 0 } = {}) {
  const Rh = resolveElo(home, ratings);
  const Ra = resolveElo(away, ratings);
  if (Rh == null || Ra == null) return null;

  const dr = Rh - Ra + homeAdvantage;
  const supremacy = dr / ELO_PER_GOAL;
  const lh = Math.max(0.25, (TOTAL_GOALS + supremacy) / 2);
  const la = Math.max(0.25, (TOTAL_GOALS - supremacy) / 2);
  const p = poissonOutcome(lh, la);
  return { p, lambda: [lh, la], elo: [Rh, Ra] };
}

/* =========================================================================
   FUSION (log-opinion pool pondere)
   ========================================================================= */

// Fusionne plusieurs triplets de probabilites en un consensus.
// sources : [{ key, label, p:[1,N,2], weight }]. Les sources sans p sont ignorees.
// Methode : moyenne geometrique ponderee, renormalisee.
export function fuseProb(sources) {
  const active = sources.filter((s) => s && Array.isArray(s.p) && s.weight > 0);
  if (active.length === 0) return null;
  const wsum = active.reduce((a, s) => a + s.weight, 0);
  const log = [0, 0, 0];
  for (const s of active) {
    for (let i = 0; i < 3; i++) {
      log[i] += (s.weight / wsum) * Math.log(Math.max(s.p[i], 1e-9));
    }
  }
  const ex = log.map((x) => Math.exp(x));
  const z = ex[0] + ex[1] + ex[2];
  return { p: ex.map((x) => x / z), sources: active.map((s) => s.key) };
}
