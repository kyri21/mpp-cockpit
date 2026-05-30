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

// Calcule le verdict complet pour un match.
// m : { a, b, o1, oN, o2, g1, gN, g2 }
// mode : "prudent" | "equilibre" | "agressif"
export function computeVerdict(m, mode) {
  const o1 = parseFloat(m.o1), oN = parseFloat(m.oN), o2 = parseFloat(m.o2);
  const g1 = parseFloat(m.g1), gN = parseFloat(m.gN), g2 = parseFloat(m.g2);
  const ok = [o1, oN, o2].every((x) => x > 1) && [g1, gN, g2].every((x) => x > 0);
  if (!ok) return null;

  const p = vigRemove(o1, oN, o2);
  const G = [g1, gN, g2];
  const ev = p.map((pi, i) => pi * G[i]);

  // Proba implicite MPP : proportionnelle a l'inverse des points.
  const invG = G.map((g) => 1 / g);
  const sInvG = invG.reduce((a, b) => a + b, 0);
  const pMpp = invG.map((x) => x / sInvG);
  const edge = p.map((pi, i) => pi / pMpp[i]);

  const gamma = GAMMA[mode];
  const score = p.map((pi, i) => G[i] * Math.pow(pi, gamma));
  const recIdx = score.indexOf(Math.max(...score));
  const crowdIdx = p.indexOf(Math.max(...p));

  const pr = p[recIdx];
  let risk = "Tres eleve";
  if (pr >= 0.5) risk = "Faible";
  else if (pr >= 0.33) risk = "Modere";
  else if (pr >= 0.18) risk = "Eleve";

  const names = [m.a || "Equipe 1", "Match nul", m.b || "Equipe 2"];
  return { p, G, ev, edge, recIdx, crowdIdx, risk, names, gamma };
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
