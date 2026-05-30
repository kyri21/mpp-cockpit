import { useState, useEffect } from "react";

/* =========================================================================
   MPP COCKPIT — Coupe du Monde 2026
   Outil d'aide a la decision pour Mon Petit Prono.
   Coeur de calcul : cotes du marche (vig retiree) + points MPP + position de ligue.
   ========================================================================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  --bg: #0a0f0d;
  --panel: #111815;
  --panel2: #0d1311;
  --line: rgba(214,255,63,0.10);
  --line2: rgba(255,255,255,0.07);
  --ink: #eef3ec;
  --muted: #8a978f;
  --accent: #d4ff3f;
  --accent-dim: #97b62c;
  --amber: #ffb020;
  --red: #ff5d73;
  --blue: #57c7ff;
  min-height: 100vh;
  background:
    radial-gradient(900px 500px at 78% -8%, rgba(212,255,63,0.10), transparent 60%),
    radial-gradient(700px 600px at -5% 110%, rgba(87,199,255,0.06), transparent 55%),
    var(--bg);
  color: var(--ink);
  font-family: 'Archivo', sans-serif;
  padding: 28px 18px 60px;
  position: relative;
  overflow-x: hidden;
}
.app::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; opacity: 0.5;
  background-image:
    repeating-linear-gradient(0deg, transparent 0 78px, rgba(255,255,255,0.018) 78px 79px),
    repeating-linear-gradient(90deg, transparent 0 78px, rgba(255,255,255,0.018) 78px 79px);
}
.wrap { max-width: 920px; margin: 0 auto; position: relative; z-index: 1; }

.eyebrow { font-family:'JetBrains Mono',monospace; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent-dim); }
.h1 { font-family:'Anton',sans-serif; font-size: clamp(38px, 9vw, 72px); line-height: 0.92; letter-spacing: 0.5px; text-transform: uppercase; margin: 6px 0 4px; }
.h1 span { color: var(--accent); }
.sub { color: var(--muted); font-size: 14px; max-width: 560px; }

.card { background: linear-gradient(180deg, var(--panel), var(--panel2)); border: 1px solid var(--line2); border-radius: 16px; padding: 20px; margin-top: 18px; }
.card.glow { border-color: var(--line); box-shadow: 0 0 0 1px rgba(212,255,63,0.04), 0 24px 60px -30px rgba(212,255,63,0.25); }

.sec-title { font-family:'Anton',sans-serif; text-transform: uppercase; letter-spacing: 1px; font-size: 18px; display:flex; align-items:center; gap:10px; }
.sec-title .num { font-family:'JetBrains Mono',monospace; font-size: 12px; color: var(--bg); background: var(--accent); border-radius: 6px; padding: 2px 7px; font-weight: 700; }

.label { display:block; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted); margin: 0 0 6px 2px; font-family:'JetBrains Mono',monospace; }
.input, .select {
  width: 100%; background: #0a100e; border: 1px solid var(--line2); color: var(--ink);
  border-radius: 10px; padding: 11px 12px; font-family:'JetBrains Mono',monospace; font-size: 15px;
  transition: border-color .15s, box-shadow .15s;
}
.input:focus, .select:focus { outline: none; border-color: var(--accent-dim); box-shadow: 0 0 0 3px rgba(212,255,63,0.10); }
.input::placeholder { color: #4d5a52; }

.row { display:grid; gap: 12px; }
.g2 { grid-template-columns: 1fr 1fr; }
.g3 { grid-template-columns: 1fr 1fr 1fr; }
@media (max-width: 560px){ .g3 { grid-template-columns: 1fr 1fr 1fr; } .hide-sm{display:none;} }

.btn { font-family:'Archivo',sans-serif; font-weight: 700; border:none; border-radius: 10px; padding: 12px 16px; cursor:pointer; font-size: 14px; letter-spacing:.3px; transition: transform .08s, filter .15s; }
.btn:active { transform: translateY(1px); }
.btn-accent { background: var(--accent); color: #0a0f0d; }
.btn-accent:hover { filter: brightness(1.06); }
.btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--line2); }
.btn-ghost:hover { color: var(--ink); border-color: var(--accent-dim); }

.modes { display:grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.mode { text-align:center; padding: 12px 8px; border-radius: 10px; border:1px solid var(--line2); background:#0a100e; cursor:pointer; transition: all .15s; }
.mode b { font-family:'Anton',sans-serif; display:block; font-size: 15px; letter-spacing:.5px; text-transform:uppercase; }
.mode small { color: var(--muted); font-size: 11px; }
.mode.on { border-color: var(--accent); background: rgba(212,255,63,0.08); }
.mode.on b { color: var(--accent); }

.suggest { font-family:'JetBrains Mono',monospace; font-size: 12px; color: var(--amber); margin-top: 12px; }

/* verdict */
.verdict-empty { color: var(--muted); font-size: 14px; padding: 8px 2px; }
.pick-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  background: rgba(212,255,63,0.07); border:1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
.pick-banner .who { font-family:'Anton',sans-serif; font-size: 26px; text-transform:uppercase; color: var(--accent); line-height:1; }
.pick-banner .meta { font-family:'JetBrains Mono',monospace; font-size: 12px; color: var(--muted); }
.tag { font-family:'JetBrains Mono',monospace; font-size: 10px; letter-spacing:1px; text-transform:uppercase; padding: 4px 8px; border-radius: 999px; border:1px solid currentColor; }
.tag.diff { color: var(--amber); } .tag.crowd { color: var(--blue); }

.outs { display:grid; gap: 10px; }
.out { background:#0a100e; border:1px solid var(--line2); border-radius: 10px; padding: 12px; }
.out.win { border-color: var(--accent-dim); }
.out-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 8px; }
.out-name { font-weight: 700; font-size: 15px; }
.out-ev { font-family:'JetBrains Mono',monospace; font-size: 13px; color: var(--accent); }
.barwrap { height: 8px; background:#1c2622; border-radius: 999px; overflow:hidden; }
.bar { height:100%; border-radius:999px; }
.statline { display:flex; gap:14px; margin-top:8px; font-family:'JetBrains Mono',monospace; font-size:11px; color: var(--muted); flex-wrap:wrap; }
.statline b { color: var(--ink); font-weight:500; }
.edge-up { color: var(--accent); } .edge-dn { color: var(--red); }

.reason { margin-top: 14px; font-size: 13px; line-height: 1.55; color: #c4d0c7; border-left: 2px solid var(--accent-dim); padding-left: 12px; }

/* scores */
.scoregrid { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; margin-top: 10px; }
.scorecell { background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding:10px; text-align:center; }
.scorecell .s { font-family:'Anton',sans-serif; font-size: 22px; }
.scorecell .p { font-family:'JetBrains Mono',monospace; font-size: 11px; color: var(--muted); }
.scorecell.top { border-color: var(--accent); }
.scorecell.top .s { color: var(--accent); }

/* saved */
.saved { display:grid; gap:10px; margin-top: 6px; }
.srow { display:flex; align-items:center; justify-content:space-between; gap:10px; background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding: 10px 12px; }
.srow .m { font-weight:600; font-size:14px; }
.srow .p { font-family:'JetBrains Mono',monospace; font-size:12px; color: var(--accent); }
.del { background:none; border:none; color: var(--muted); cursor:pointer; font-size:18px; line-height:1; padding:2px 6px; border-radius:6px; }
.del:hover { color: var(--red); }

.foot { color: var(--muted); font-size: 11.5px; line-height:1.6; margin-top: 26px; font-family:'JetBrains Mono',monospace; }
.divider { height:1px; background: var(--line2); margin: 18px 0; }
.mini { font-size: 11px; color: var(--muted); margin-top: 6px; }
`;

/* ---------- math ---------- */
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const poisson = (k, l) => (Math.exp(-l) * Math.pow(l, k)) / fact(k);

function vigRemove(o1, oN, o2) {
  const inv = [1 / o1, 1 / oN, 1 / o2];
  const s = inv[0] + inv[1] + inv[2];
  return inv.map((x) => x / s);
}

const GAMMA = { prudent: 1.7, equilibre: 1.0, agressif: 0.5 };
const LABELS = ["1 (victoire " , "Nul", "2 (victoire "];

function computeVerdict(m, mode) {
  const o1 = parseFloat(m.o1), oN = parseFloat(m.oN), o2 = parseFloat(m.o2);
  const g1 = parseFloat(m.g1), gN = parseFloat(m.gN), g2 = parseFloat(m.g2);
  const ok = [o1, oN, o2].every((x) => x > 1) && [g1, gN, g2].every((x) => x > 0);
  if (!ok) return null;

  const p = vigRemove(o1, oN, o2);            // proba marche
  const G = [g1, gN, g2];                       // points MPP
  const ev = p.map((pi, i) => pi * G[i]);       // esperance en points

  // proba implicite MPP (en supposant EV equilibree par MPP) : ~ 1/points
  const invG = G.map((g) => 1 / g);
  const sInvG = invG.reduce((a, b) => a + b, 0);
  const pMpp = invG.map((x) => x / sInvG);
  const edge = p.map((pi, i) => pi / pMpp[i]);  // >1 = valeur

  const gamma = GAMMA[mode];
  const score = p.map((pi, i) => G[i] * Math.pow(pi, gamma));
  const recIdx = score.indexOf(Math.max(...score));
  const crowdIdx = p.indexOf(Math.max(...p));   // la foule suit le favori

  const pr = p[recIdx];
  let risk = "Tres eleve";
  if (pr >= 0.5) risk = "Faible";
  else if (pr >= 0.33) risk = "Modere";
  else if (pr >= 0.18) risk = "Eleve";

  const names = [m.a || "Equipe 1", "Match nul", m.b || "Equipe 2"];

  return { p, G, ev, edge, recIdx, crowdIdx, risk, names, gamma };
}

function topScores(xgA, xgB) {
  const a = parseFloat(xgA), b = parseFloat(xgB);
  if (!(a > 0) || !(b > 0)) return null;
  const out = [];
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++)
      out.push({ i, j, pr: poisson(i, a) * poisson(j, b) });
  out.sort((x, y) => y.pr - x.pr);
  // proba 1X2 issue du modele
  let mH = 0, mD = 0, mA = 0;
  out.forEach((s) => { if (s.i > s.j) mH += s.pr; else if (s.i === s.j) mD += s.pr; else mA += s.pr; });
  return { list: out.slice(0, 6), model: [mH, mD, mA] };
}

const pct = (x) => (x * 100).toFixed(1) + "%";

/* ---------- component ---------- */
export default function App() {
  const [mode, setMode] = useState("equilibre");
  const [pos, setPos] = useState({ rank: "", players: "", left: "" });

  const blank = { a: "", b: "", o1: "", oN: "", o2: "", g1: "", gN: "", g2: "", xgA: "", xgB: "" };
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState([]);
  const hasStore = typeof window !== "undefined" && window.storage;

  useEffect(() => {
    (async () => {
      if (!hasStore) return;
      try {
        const r = await window.storage.get("mpp:matches", false);
        if (r && r.value) setSaved(JSON.parse(r.value));
        const rp = await window.storage.get("mpp:pos", false);
        if (rp && rp.value) { const d = JSON.parse(rp.value); setPos(d.pos); setMode(d.mode); }
      } catch (e) { /* premiere visite */ }
    })();
  }, []);

  const persist = async (matches, p = pos, md = mode) => {
    if (!hasStore) return;
    try {
      await window.storage.set("mpp:matches", JSON.stringify(matches), false);
      await window.storage.set("mpp:pos", JSON.stringify({ pos: p, mode: md }), false);
    } catch (e) { /* ignore */ }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const verdict = computeVerdict(form, mode);
  const scores = topScores(form.xgA, form.xgB);

  // suggestion de mode selon la position
  const rank = parseInt(pos.rank), players = parseInt(pos.players), left = parseInt(pos.left);
  let suggestion = null;
  if (rank > 0 && players > 0 && left > 0) {
    const frac = rank / players;
    if (frac <= 0.15 && left <= 12) suggestion = "prudent";
    else if (frac >= 0.45 && left >= 8) suggestion = "agressif";
    else suggestion = "equilibre";
  }

  const estimateXg = () => {
    const o1 = parseFloat(form.o1), oN = parseFloat(form.oN), o2 = parseFloat(form.o2);
    if (!([o1, oN, o2].every((x) => x > 1))) return;
    const p = vigRemove(o1, oN, o2);
    const total = 2.6; // total de buts typique en CDM
    const lean = (p[0] - p[2]); // -1..1
    let xa = total * (0.5 + 0.42 * lean);
    let xb = total - xa;
    xa = Math.max(0.4, xa); xb = Math.max(0.4, xb);
    set("xgA", xa.toFixed(2)); set("xgB", xb.toFixed(2));
  };

  const saveMatch = () => {
    if (!verdict) return;
    const v = verdict;
    const entry = {
      id: Date.now(),
      label: `${form.a || "Eq1"} - ${form.b || "Eq2"}`,
      pickName: v.names[v.recIdx],
      pickEv: v.ev[v.recIdx].toFixed(1),
      pickP: pct(v.p[v.recIdx]),
      diff: v.recIdx !== v.crowdIdx,
      form: { ...form },
    };
    const next = [entry, ...saved].slice(0, 60);
    setSaved(next); persist(next);
    setForm(blank);
  };

  const loadMatch = (e) => { setForm(e.form); window.scrollTo({ top: 320, behavior: "smooth" }); };
  const delMatch = (id) => { const n = saved.filter((s) => s.id !== id); setSaved(n); persist(n); };

  const modeCopy = {
    prudent: "Tu colles aux favoris. Variance basse. A utiliser quand tu es en tete et qu'il reste peu de matchs.",
    equilibre: "Tu maximises l'esperance de points brute. Le reglage par defaut.",
    agressif: "Tu privilegies les gros points encore credibles. A utiliser quand tu dois remonter au classement.",
  };

  return (
    <div className="app">
      <style>{CSS}</style>
      <div className="wrap">

        <div className="eyebrow">Mon Petit Prono // Coupe du Monde 2026</div>
        <div className="h1">MPP <span>Cockpit</span></div>
        <p className="sub">
          Entre les cotes du marche et les points MPP de chaque match. L'outil retire la marge des bookmakers,
          calcule ton esperance de points et te designe le pari optimal selon ta position dans la ligue.
        </p>

        {/* POSITION */}
        <div className="card">
          <div className="sec-title"><span className="num">01</span> Ma position dans la ligue</div>
          <div className="row g3" style={{ marginTop: 16 }}>
            <div>
              <label className="label">Mon rang</label>
              <input className="input" inputMode="numeric" placeholder="ex. 14"
                value={pos.rank} onChange={(e) => { const np = { ...pos, rank: e.target.value }; setPos(np); persist(saved, np); }} />
            </div>
            <div>
              <label className="label">Joueurs</label>
              <input className="input" inputMode="numeric" placeholder="ex. 60"
                value={pos.players} onChange={(e) => { const np = { ...pos, players: e.target.value }; setPos(np); persist(saved, np); }} />
            </div>
            <div>
              <label className="label">Matchs restants</label>
              <input className="input" inputMode="numeric" placeholder="ex. 20"
                value={pos.left} onChange={(e) => { const np = { ...pos, left: e.target.value }; setPos(np); persist(saved, np); }} />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label className="label">Strategie active</label>
            <div className="modes">
              {["prudent", "equilibre", "agressif"].map((mk) => (
                <div key={mk} className={"mode" + (mode === mk ? " on" : "")}
                  onClick={() => { setMode(mk); persist(saved, pos, mk); }}>
                  <b>{mk === "equilibre" ? "Equilibre" : mk.charAt(0).toUpperCase() + mk.slice(1)}</b>
                  <small>{mk === "prudent" ? "variance basse" : mk === "equilibre" ? "max esperance" : "remontada"}</small>
                </div>
              ))}
            </div>
            <p className="mini">{modeCopy[mode]}</p>
            {suggestion && suggestion !== mode && (
              <div className="suggest">
                Vu ta position ({rank}/{players}, {left} matchs restants), le mode conseille serait : {suggestion === "equilibre" ? "Equilibre" : suggestion}.
              </div>
            )}
          </div>
        </div>

        {/* MATCH */}
        <div className="card glow">
          <div className="sec-title"><span className="num">02</span> Analyser un match</div>

          <div className="row g2" style={{ marginTop: 16 }}>
            <div>
              <label className="label">Equipe 1 (domicile / 1)</label>
              <input className="input" placeholder="France" value={form.a} onChange={(e) => set("a", e.target.value)} />
            </div>
            <div>
              <label className="label">Equipe 2 (2)</label>
              <input className="input" placeholder="Senegal" value={form.b} onChange={(e) => set("b", e.target.value)} />
            </div>
          </div>

          <div className="divider" />
          <label className="label">Cotes decimales du marche (1 / N / 2)</label>
          <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>Prends une cote sharp ou une moyenne (Pinnacle est la reference).</p>
          <div className="row g3">
            <input className="input" inputMode="decimal" placeholder="1.55" value={form.o1} onChange={(e) => set("o1", e.target.value)} />
            <input className="input" inputMode="decimal" placeholder="3.80" value={form.oN} onChange={(e) => set("oN", e.target.value)} />
            <input className="input" inputMode="decimal" placeholder="6.50" value={form.o2} onChange={(e) => set("o2", e.target.value)} />
          </div>

          <div className="divider" />
          <label className="label">Points MPP par issue (1 / N / 2)</label>
          <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>Les points affiches dans l'appli avant le match.</p>
          <div className="row g3">
            <input className="input" inputMode="numeric" placeholder="46" value={form.g1} onChange={(e) => set("g1", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="95" value={form.gN} onChange={(e) => set("gN", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="153" value={form.g2} onChange={(e) => set("g2", e.target.value)} />
          </div>

          {/* VERDICT */}
          <div className="divider" />
          {!verdict && <div className="verdict-empty">Remplis les 3 cotes et les 3 points pour obtenir le verdict.</div>}

          {verdict && (
            <>
              <div className="pick-banner">
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase" }}>Pari recommande</div>
                  <div className="who">{verdict.names[verdict.recIdx]}</div>
                  <div className="meta">esperance {verdict.ev[verdict.recIdx].toFixed(1)} pts · proba {pct(verdict.p[verdict.recIdx])} · risque {verdict.risk}</div>
                </div>
                <span className={"tag " + (verdict.recIdx !== verdict.crowdIdx ? "diff" : "crowd")}>
                  {verdict.recIdx !== verdict.crowdIdx ? "Pari differenciant" : "Pari de la foule"}
                </span>
              </div>

              <div className="outs">
                {verdict.names.map((nm, i) => {
                  const win = i === verdict.recIdx;
                  const col = i === 0 ? "var(--accent)" : i === 1 ? "var(--amber)" : "var(--blue)";
                  return (
                    <div key={i} className={"out" + (win ? " win" : "")}>
                      <div className="out-head">
                        <span className="out-name">{nm}</span>
                        <span className="out-ev">EV {verdict.ev[i].toFixed(1)} pts</span>
                      </div>
                      <div className="barwrap"><div className="bar" style={{ width: pct(verdict.p[i]), background: col }} /></div>
                      <div className="statline">
                        <span>proba marche <b>{pct(verdict.p[i])}</b></span>
                        <span>points MPP <b>{verdict.G[i]}</b></span>
                        <span>valeur vs MPP <b className={verdict.edge[i] >= 1 ? "edge-up" : "edge-dn"}>{verdict.edge[i].toFixed(2)}x</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="reason">
                {(() => {
                  const v = verdict;
                  const best = v.edge.indexOf(Math.max(...v.edge));
                  let txt = `En mode ${mode}, l'issue retenue est "${v.names[v.recIdx]}". `;
                  if (v.recIdx !== v.crowdIdx)
                    txt += `Ce n'est pas le favori : si ca passe, tu gagnes beaucoup de places sur la foule qui suit "${v.names[v.crowdIdx]}". `;
                  else
                    txt += `C'est aussi le choix de la foule, donc peu differenciant mais solide. `;
                  if (v.edge[best] > 1.05)
                    txt += `Le meilleur rapport valeur se trouve sur "${v.names[best]}" (${v.edge[best].toFixed(2)}x) : le marche le juge plus probable que ce que les points MPP suggerent.`;
                  else
                    txt += `Aucune issue n'est nettement sous-cotee par MPP ici : match equilibre, ne force pas.`;
                  return txt;
                })()}
              </div>

              <div className="row g2" style={{ marginTop: 16 }}>
                <button className="btn btn-accent" onClick={saveMatch}>Enregistrer ce match</button>
                <button className="btn btn-ghost" onClick={() => setForm(blank)}>Reinitialiser</button>
              </div>
            </>
          )}

          {/* SCORE EXACT */}
          <div className="divider" />
          <div className="sec-title" style={{ fontSize: 15 }}><span className="num">+</span> Score exact (bonus)</div>
          <p className="mini" style={{ marginTop: 6 }}>Buts attendus de chaque equipe. C'est ici que les compos et L'Equipe servent : un buteur absent fait baisser le chiffre.</p>
          <div className="row g3" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr auto" }}>
            <div>
              <label className="label">Buts att. {form.a || "Eq1"}</label>
              <input className="input" inputMode="decimal" placeholder="1.6" value={form.xgA} onChange={(e) => set("xgA", e.target.value)} />
            </div>
            <div>
              <label className="label">Buts att. {form.b || "Eq2"}</label>
              <input className="input" inputMode="decimal" placeholder="0.9" value={form.xgB} onChange={(e) => set("xgB", e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-ghost" onClick={estimateXg}>Estimer depuis les cotes</button>
            </div>
          </div>

          {scores && (
            <>
              <div className="scoregrid">
                {scores.list.map((s, k) => (
                  <div key={k} className={"scorecell" + (k === 0 ? " top" : "")}>
                    <div className="s">{s.i}-{s.j}</div>
                    <div className="p">{pct(s.pr)}</div>
                  </div>
                ))}
              </div>
              <p className="mini">
                Modele de buts : victoire 1 {pct(scores.model[0])} · nul {pct(scores.model[1])} · victoire 2 {pct(scores.model[2])}.
                Compare avec les probas du marche ci dessus pour reperer les incoherences.
              </p>
            </>
          )}
        </div>

        {/* SAVED */}
        <div className="card">
          <div className="sec-title"><span className="num">03</span> Mes matchs enregistres</div>
          {saved.length === 0 && <p className="mini" style={{ marginTop: 12 }}>Rien encore. Enregistre tes analyses pour suivre tes choix sur le tournoi.</p>}
          <div className="saved">
            {saved.map((s) => (
              <div key={s.id} className="srow">
                <div onClick={() => loadMatch(s)} style={{ cursor: "pointer", flex: 1 }}>
                  <div className="m">{s.label}</div>
                  <div className="p">{s.pickName} · {s.pickEv} pts · {s.pickP}{s.diff ? " · differenciant" : ""}</div>
                </div>
                <button className="del" onClick={() => delMatch(s.id)} title="Supprimer">×</button>
              </div>
            ))}
          </div>
        </div>

        <p className="foot">
          Methode : cote decimale converti en proba, marge bookmaker retiree, esperance = proba x points MPP.
          Le mode ajuste la prise de risque (prudent suit le favori, agressif favorise les gros points).
          La valeur vs MPP compare la proba du marche a la proba implicite des points MPP : au dessus de 1, l'issue est sous cotee par le jeu.
          Aucun argent reel. L'outil aide la decision, il ne predit pas les resultats.
          {hasStore ? " Tes donnees sont sauvegardees localement entre tes sessions." : ""}
        </p>
      </div>
    </div>
  );
}
