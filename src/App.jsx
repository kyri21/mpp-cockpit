import { useState, useEffect } from "react";
import { computeVerdict, topScores, estimateXg, pct, forceModel, fuseProb, vigRemove, poissonOutcome } from "./engine/calcul.js";
import { findMppMatch } from "./engine/teamMapping.js";
import mppData from "../data/mpp-points.json";
import eloData from "../data/elo-ratings.json";

const ELO = eloData.ratings;
// Poids des sources dans la fusion consensus.
const WEIGHTS = { marche: 0.6, force: 0.4 };

/* =========================================================================
   MPP COCKPIT — Coupe du Monde 2026
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
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-accent { background: var(--accent); color: #0a0f0d; }
.btn-accent:hover:not(:disabled) { filter: brightness(1.06); }
.btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--line2); }
.btn-ghost:hover:not(:disabled) { color: var(--ink); border-color: var(--accent-dim); }

.modes { display:grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.mode { text-align:center; padding: 12px 8px; border-radius: 10px; border:1px solid var(--line2); background:#0a100e; cursor:pointer; transition: all .15s; }
.mode b { font-family:'Anton',sans-serif; display:block; font-size: 15px; letter-spacing:.5px; text-transform:uppercase; }
.mode small { color: var(--muted); font-size: 11px; }
.mode.on { border-color: var(--accent); background: rgba(212,255,63,0.08); }
.mode.on b { color: var(--accent); }

.suggest { font-family:'JetBrains Mono',monospace; font-size: 12px; color: var(--amber); margin-top: 12px; }

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
.ai-reason { margin-top: 14px; font-size: 13px; line-height: 1.55; color: #c4d0c7; border-left: 2px solid var(--blue); padding-left: 12px; }

.scoregrid { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; margin-top: 10px; }
.scorecell { background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding:10px; text-align:center; }
.scorecell .s { font-family:'Anton',sans-serif; font-size: 22px; }
.scorecell .p { font-family:'JetBrains Mono',monospace; font-size: 11px; color: var(--muted); }
.scorecell.top { border-color: var(--accent); }
.scorecell.top .s { color: var(--accent); }

.saved { display:grid; gap:10px; margin-top: 6px; }
.srow { display:flex; align-items:center; justify-content:space-between; gap:10px; background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding: 10px 12px; }
.srow .m { font-weight:600; font-size:14px; }
.srow .p { font-family:'JetBrains Mono',monospace; font-size:12px; color: var(--accent); }
.del { background:none; border:none; color: var(--muted); cursor:pointer; font-size:18px; line-height:1; padding:2px 6px; border-radius:6px; }
.del:hover { color: var(--red); }

.match-row { cursor:pointer; transition: border-color .15s; }
.match-row:hover { border-color: var(--accent-dim); }
.match-row .m { font-weight:600; font-size:14px; }
.match-row .p { font-family:'JetBrains Mono',monospace; font-size:11px; color: var(--muted); margin-top: 2px; }

.quota { font-family:'JetBrains Mono',monospace; font-size:11px; color: var(--muted); }
.quota b { color: var(--amber); }

/* stats */
.stats-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.stat-team { background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding:12px; }
.stat-team .tname { font-family:'Anton',sans-serif; font-size:14px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
.form-dots { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px; }
.form-dot { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700; }
.form-dot.W { background:rgba(212,255,63,0.18); color:var(--accent); }
.form-dot.D { background:rgba(255,176,32,0.15); color:var(--amber); }
.form-dot.L { background:rgba(255,93,115,0.15); color:var(--red); }
.stat-line { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--muted); }
.stat-line b { color:var(--ink); }

/* sources */
.sources { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.src-link { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.5px; text-transform:uppercase;
  padding:6px 10px; border-radius:8px; border:1px solid var(--line2); color:var(--muted);
  text-decoration:none; transition: border-color .15s, color .15s; }
.src-link:hover { border-color:var(--accent-dim); color:var(--ink); }

/* estimation */
.est-head { display:grid; grid-template-columns: repeat(3,1fr); gap:10px; margin-top:14px; }
.est-cell { background:#0a100e; border:1px solid var(--line2); border-radius:10px; padding:14px 10px; text-align:center; }
.est-cell.top { border-color: var(--accent); background: rgba(212,255,63,0.06); }
.est-cell .pn { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); }
.est-cell .pv { font-family:'Anton',sans-serif; font-size:30px; line-height:1; margin-top:4px; }
.est-cell.top .pv { color: var(--accent); }
.est-table { margin-top:14px; }
.est-srow { display:grid; grid-template-columns: 1fr auto auto auto; gap:10px; align-items:center;
  font-family:'JetBrains Mono',monospace; font-size:12px; padding:7px 0; border-top:1px solid var(--line2); }
.est-srow .sname { color: var(--muted); text-transform:uppercase; letter-spacing:.5px; }
.est-srow.cons .sname { color: var(--accent); }
.est-srow b { color: var(--ink); font-weight:500; }
.est-note { font-family:'JetBrains Mono',monospace; font-size:11px; color: var(--amber); margin-top:12px; line-height:1.5; }

.foot { color: var(--muted); font-size: 11.5px; line-height:1.6; margin-top: 26px; font-family:'JetBrains Mono',monospace; }
.divider { height:1px; background: var(--line2); margin: 18px 0; }
.mini { font-size: 11px; color: var(--muted); margin-top: 6px; }
.error { font-family:'JetBrains Mono',monospace; font-size: 12px; color: var(--red); margin-top: 8px; }
`;

// Persistance locale simple (remplace window.storage du prototype).
const ls = {
  get: (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota depassé */ }
  },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function App() {
  const [mode, setMode] = useState("equilibre");
  const [pos, setPos] = useState({ rank: "", players: "", left: "" });

  const blank = { a: "", b: "", o1: "", oN: "", o2: "", g1: "", gN: "", g2: "", c1: "", cN: "", c2: "", xgA: "", xgB: "" };
  const [form, setForm] = useState(blank);
  const [mppFilled, setMppFilled] = useState(false);
  const [saved, setSaved] = useState([]);

  // Etat des cotes en direct depuis The Odds API.
  const [apiMatches, setApiMatches] = useState([]);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [oddsError, setOddsError] = useState(null);
  const [quotaRemaining, setQuotaRemaining] = useState(null);

  // Etat des stats d'equipes depuis football-data.org.
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Etat du contexte qualitatif IA (multiplicateurs sur les buts attendus).
  const [context, setContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  useEffect(() => {
    setSaved(ls.get("mpp:matches", []));
    const saved = ls.get("mpp:pos", null);
    if (saved) { setPos(saved.pos); setMode(saved.mode); }
  }, []);

  const persist = (matches, p = pos, md = mode) => {
    ls.set("mpp:matches", matches);
    ls.set("mpp:pos", { pos: p, mode: md });
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Charge les cotes depuis l'API serverless.
  const fetchOdds = async () => {
    setLoadingOdds(true);
    setOddsError(null);
    try {
      const res = await fetch("/api/odds?sport=soccer_fifa_world_cup&regions=eu");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
      setApiMatches(data.matches || []);
      setQuotaRemaining(data.quotaRemaining);
      if ((data.matches || []).length === 0) {
        setOddsError("Aucun match disponible pour l'instant. Les cotes apparaissent en general 48h avant le coup d'envoi.");
      }
    } catch (e) {
      setOddsError(e.message);
    } finally {
      setLoadingOdds(false);
    }
  };

  // Pre-remplit le formulaire depuis un match de l'API et charge les stats.
  // Les points MPP (g1/gN/g2) sont auto-remplis si le match figure dans mpp-points.json.
  const selectMatch = (m) => {
    const mppMatch = findMppMatch(m.home, m.away, mppData.matchs);
    setMppFilled(!!mppMatch);
    // prono_foule : valeurs type "82%" converties en nombre ("82").
    const pf = mppMatch?.prono_foule || null;
    const pct2num = (s) => (s == null ? "" : String(parseFloat(s)));
    setForm((f) => ({
      ...f,
      a: m.home,
      b: m.away,
      o1: String(m.o1),
      oN: String(m.oN),
      o2: String(m.o2),
      g1: mppMatch ? String(mppMatch.points["1"]) : "",
      gN: mppMatch ? String(mppMatch.points["N"]) : "",
      g2: mppMatch ? String(mppMatch.points["2"]) : "",
      c1: pf ? pct2num(pf["1"]) : "",
      cN: pf ? pct2num(pf["N"]) : "",
      c2: pf ? pct2num(pf["2"]) : "",
    }));
    setStats(null);
    setContext(null);
    fetchStats(m.home, m.away);
    window.scrollTo({ top: 600, behavior: "smooth" });
  };

  // Charge les stats d'equipes depuis football-data.org.
  const fetchStats = async (home, away) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/stats?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      setStats(data);
    } catch {
      // Stats optionnelles : echec silencieux, la cle n'est peut-etre pas configuree.
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  // Genere les liens sources pour un match donne.
  function sourceLinks(home, away) {
    if (!home || !away) return [];
    const q = `${home} ${away}`;
    const qUrl = encodeURIComponent(q);
    return [
      { label: "L'Equipe", href: `https://www.lequipe.fr/recherche?q=${qUrl}` },
      { label: "RMC Sport", href: `https://rmcsport.bfmtv.com/football/` },
      { label: "BBC Sport", href: `https://www.bbc.com/sport/football` },
      { label: "Goal.com", href: `https://www.goal.com/fr/recherche?q=${qUrl}` },
      { label: "FBref", href: `https://fbref.com/en/comps/1/schedule/World-Cup-Scores-and-Fixtures` },
      { label: "Sofascore", href: `https://www.sofascore.com/fr/` },
    ];
  }

  // Estimation 1/N/2 : compilation des sources puis fusion consensus.
  const oddsOk = [form.o1, form.oN, form.o2].every((v) => parseFloat(v) > 1);
  const market = oddsOk ? vigRemove(parseFloat(form.o1), parseFloat(form.oN), parseFloat(form.o2)) : null;
  const force = form.a && form.b ? forceModel(form.a, form.b, ELO) : null;

  // Le contexte IA ajuste les buts attendus du modele de force (pas de double comptage).
  const ctxOk = context && !context.error && force;
  const forceP = ctxOk
    ? poissonOutcome(force.lambda[0] * context.multHome, force.lambda[1] * context.multAway)
    : force?.p;
  const forceLabel = ctxOk ? "Force + contexte" : "Force Elo";

  const estSources = [
    market && { key: "marche", label: "Marche", p: market, weight: WEIGHTS.marche },
    force && { key: "force", label: forceLabel, p: forceP, weight: WEIGHTS.force },
  ].filter(Boolean);
  const consensus = fuseProb(estSources);

  const verdict = computeVerdict(form, mode, consensus?.p);
  const scores = topScores(form.xgA, form.xgB);

  const rank = parseInt(pos.rank), players = parseInt(pos.players), left = parseInt(pos.left);
  let suggestion = null;
  if (rank > 0 && players > 0 && left > 0) {
    const frac = rank / players;
    if (frac <= 0.15 && left <= 12) suggestion = "prudent";
    else if (frac >= 0.45 && left >= 8) suggestion = "agressif";
    else suggestion = "equilibre";
  }

  const runEstimateXg = () => {
    const ok = [form.o1, form.oN, form.o2].every((v) => parseFloat(v) > 1);
    if (!ok) return;
    const [xa, xb] = estimateXg(form.o1, form.oN, form.o2);
    setForm((f) => ({ ...f, xgA: xa, xgB: xb }));
  };

  // Cherche le contexte qualitatif (blessures, turnover, enjeu) via l'IA.
  const fetchContext = async () => {
    if (!form.a || !form.b) return;
    setLoadingContext(true);
    setContext(null);
    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: form.a, away: form.b }),
      });
      const data = await resp.json();
      setContext(resp.ok ? data : { error: data.error || "Erreur inconnue." });
    } catch {
      setContext({ error: "Impossible de joindre /api/analyze." });
    } finally {
      setLoadingContext(false);
    }
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
    setSaved(next);
    persist(next);
    setMppFilled(false);
    setContext(null);
    setForm(blank);
  };

  const loadMatch = (e) => { setForm(e.form); window.scrollTo({ top: 600, behavior: "smooth" }); };
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
          Cotes du marche + points MPP. La marge du bookmaker est retiree, l'esperance de points calculee,
          le prono optimal suggere selon ta position dans la ligue.
        </p>

        {/* 00 : COTES EN DIRECT */}
        <div className="card">
          <div className="sec-title"><span className="num">00</span> Matchs disponibles</div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-accent" onClick={fetchOdds} disabled={loadingOdds}>
              {loadingOdds ? "Chargement..." : "Rafraichir les cotes"}
            </button>
            {quotaRemaining !== null && (
              <span className="quota">requetes restantes ce mois : <b>{quotaRemaining}</b></span>
            )}
          </div>
          {oddsError && <p className="error">{oddsError}</p>}
          {apiMatches.length > 0 && (
            <div className="saved" style={{ marginTop: 14 }}>
              {apiMatches.map((m) => (
                <div key={m.id} className="srow match-row" onClick={() => selectMatch(m)}>
                  <div style={{ flex: 1 }}>
                    <div className="m">{m.home} vs {m.away}</div>
                    <div className="p">
                      {formatDate(m.commence)}
                      {" · "}cotes {m.o1} / {m.oN} / {m.o2}
                      {" · "}{m.bookmaker}
                    </div>
                  </div>
                  <span className="tag crowd">Charger</span>
                </div>
              ))}
            </div>
          )}
          {apiMatches.length === 0 && !loadingOdds && !oddsError && (
            <p className="mini">Clique sur Rafraichir pour charger les matchs. Les cotes apparaissent en general 48h avant le coup d'envoi.</p>
          )}
        </div>

        {/* 01 : POSITION */}
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

        {/* 01b : FICHE MATCH (stats + sources, visible si un match est charge) */}
        {(form.a || form.b) && (
          <div className="card">
            <div className="sec-title"><span className="num">01b</span> Fiche match</div>

            {/* Stats d'equipes */}
            {loadingStats && <p className="mini" style={{ marginTop: 12 }}>Chargement des stats...</p>}
            {stats && (
              <div className="stats-grid">
                {[stats.home, stats.away].map((team, ti) => (
                  <div key={ti} className="stat-team">
                    <div className="tname">{team.name}</div>
                    {team.form.length > 0 && (
                      <div className="form-dots">
                        {team.form.map((f, i) => (
                          <div key={i} className={`form-dot ${f.result}`}>{f.result}</div>
                        ))}
                      </div>
                    )}
                    {team.played !== null && (
                      <div className="stat-line">
                        <b>{team.points} pts</b> · {team.won}V {team.drawn}N {team.lost}D · {team.goalsFor} buts / {team.goalsAgainst} concedes
                      </div>
                    )}
                    {team.played === null && team.form.length === 0 && (
                      <p className="mini">Pas encore de donnees pour ce tournoi.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!loadingStats && !stats && (
              <p className="mini" style={{ marginTop: 10 }}>
                Stats indisponibles. Ajouter FOOTBALL_DATA_API_KEY dans Vercel pour activer.
              </p>
            )}

            {/* H2H */}
            {stats?.h2h?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <label className="label">Confrontations directes dans ce tournoi</label>
                {stats.h2h.map((m, i) => {
                  const sc = m.score?.fullTime;
                  return (
                    <div key={i} className="srow" style={{ marginTop: 6, cursor: "default" }}>
                      <div>
                        <div className="m">{m.homeTeam.name} {sc ? `${sc.home}-${sc.away}` : "?"} {m.awayTeam.name}</div>
                        <div className="p">{m.stage?.replace(/_/g, " ")} · {new Date(m.utcDate).toLocaleDateString("fr-FR")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sources rapides */}
            <div className="divider" />
            <label className="label">Sources rapides</label>
            <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>
              Ouvre ces liens pour la revue de presse avant d'ajuster le xG.
            </p>
            <div className="sources">
              {sourceLinks(form.a, form.b).map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="src-link">
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* E : ESTIMATION 1/N/2 (compilation des sources) */}
        {(market || force) && (
          <div className="card glow">
            <div className="sec-title"><span className="num">E</span> Estimation 1 / N / 2</div>
            <p className="mini" style={{ marginTop: 6 }}>
              Compilation de toutes les sources disponibles en une probabilite consensus. Plus une source diverge, plus l'info est interessante.
            </p>

            {consensus && (() => {
              const names = [form.a || "Eq1", "Nul", form.b || "Eq2"];
              const top = consensus.p.indexOf(Math.max(...consensus.p));
              return (
                <div className="est-head">
                  {consensus.p.map((pi, i) => (
                    <div key={i} className={"est-cell" + (i === top ? " top" : "")}>
                      <div className="pn">{names[i]}</div>
                      <div className="pv">{(pi * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="est-table">
              {estSources.map((s) => (
                <div key={s.key} className="est-srow">
                  <span className="sname">{s.label}</span>
                  <b>{pct(s.p[0])}</b><b>{pct(s.p[1])}</b><b>{pct(s.p[2])}</b>
                </div>
              ))}
              {consensus && (
                <div className="est-srow cons">
                  <span className="sname">Consensus (poids {estSources.map((s) => s.weight).join("/")})</span>
                  <b>{pct(consensus.p[0])}</b><b>{pct(consensus.p[1])}</b><b>{pct(consensus.p[2])}</b>
                </div>
              )}
            </div>

            {market && force && (() => {
              const gap = Math.max(...market.map((mp, i) => Math.abs(mp - forceP[i])));
              const gi = market.map((mp, i) => Math.abs(mp - forceP[i])).indexOf(gap);
              const names = [form.a || "Eq1", "le nul", form.b || "Eq2"];
              if (gap < 0.08) return <p className="est-note" style={{ color: "var(--muted)" }}>Marche et modele de force sont d'accord. Estimation solide.</p>;
              return (
                <p className="est-note">
                  Divergence sur {names[gi]} : le marche dit {pct(market[gi])}, le modele de force {pct(forceP[gi])}.
                  {forceP[gi] > market[gi]
                    ? " Le modele est plus optimiste que le marche : verifie s'il manque une info recente (blessure, forme) au modele."
                    : " Le marche est plus optimiste que le modele : il price peut-etre une info que les resultats passes ne capturent pas."}
                </p>
              );
            })()}

            {force && (
              <p className="mini" style={{ marginTop: 10 }}>
                Force Elo : {force.elo[0]} vs {force.elo[1]} (buts attendus {force.lambda[0].toFixed(2)} - {force.lambda[1].toFixed(2)}).
                {!market && " Cotes pas encore chargees : estimation basee sur le seul modele de force."}
              </p>
            )}

            {/* Contexte qualitatif IA */}
            <div className="divider" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={fetchContext} disabled={loadingContext || !form.a || !form.b}
                style={{ color: "var(--blue)", borderColor: "rgba(87,199,255,0.25)" }}>
                {loadingContext ? "Recherche en cours..." : "Analyser le contexte (IA)"}
              </button>
              <span className="mini" style={{ margin: 0 }}>Blessures, turnover, enjeu. Ajuste les buts attendus du modele de force.</span>
            </div>

            {context && context.error && <p className="error">{context.error}</p>}
            {context && !context.error && (
              <div className="ai-reason">
                {context.reasoning}
                <div className="stat-line" style={{ marginTop: 8 }}>
                  buts attendus x <b>{context.multHome?.toFixed(2)}</b> pour {form.a || "Eq1"},
                  x <b>{context.multAway?.toFixed(2)}</b> pour {form.b || "Eq2"}.
                </div>
                {context.factors?.length > 0 && (
                  <div className="stat-line" style={{ marginTop: 6 }}>{context.factors.join(" · ")}</div>
                )}
                {context.sources?.length > 0 && (
                  <div className="sources" style={{ marginTop: 8 }}>
                    {context.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="src-link">{s.title?.slice(0, 28) || "source"}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 02 : ANALYSER UN MATCH */}
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
          <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>Chargees depuis la section 00, ou saisies manuellement (reference : Pinnacle).</p>
          <div className="row g3">
            <input className="input" inputMode="decimal" placeholder="1.55" value={form.o1} onChange={(e) => set("o1", e.target.value)} />
            <input className="input" inputMode="decimal" placeholder="3.80" value={form.oN} onChange={(e) => set("oN", e.target.value)} />
            <input className="input" inputMode="decimal" placeholder="6.50" value={form.o2} onChange={(e) => set("o2", e.target.value)} />
          </div>

          <div className="divider" />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <label className="label" style={{ margin: 0 }}>Points MPP par issue (1 / N / 2)</label>
            {mppFilled && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "2px 7px" }}>
                MPP auto
              </span>
            )}
          </div>
          <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>Les points affiches dans l'appli MPP avant le match.</p>
          <div className="row g3">
            <input className="input" inputMode="numeric" placeholder="46" value={form.g1} onChange={(e) => set("g1", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="95" value={form.gN} onChange={(e) => set("gN", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="153" value={form.g2} onChange={(e) => set("g2", e.target.value)} />
          </div>

          <div className="divider" />
          <label className="label">Repartition de la foule MPP en % (1 / N / 2)</label>
          <p className="mini" style={{ marginTop: 0, marginBottom: 8 }}>
            Pourcentage des joueurs sur chaque issue. Auto-rempli depuis MPP. C'est ce qui mesure ta differenciation au classement.
          </p>
          <div className="row g3">
            <input className="input" inputMode="numeric" placeholder="82" value={form.c1} onChange={(e) => set("c1", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="10" value={form.cN} onChange={(e) => set("cN", e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="8" value={form.c2} onChange={(e) => set("c2", e.target.value)} />
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
                        {verdict.crowd && <span>foule <b>{pct(verdict.crowd[i])}</b></span>}
                        <span>points MPP <b>{verdict.G[i]}</b></span>
                        <span>valeur vs {verdict.crowd ? "foule" : "MPP"} <b className={verdict.edge[i] >= 1 ? "edge-up" : "edge-dn"}>{verdict.edge[i].toFixed(2)}x</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {verdict.crowd && verdict.levIdx >= 0 && (
                <div className="reason" style={{ borderLeftColor: "var(--amber)", marginTop: 14 }}>
                  Meilleur pari differenciant (levier prudent) : <b>{verdict.names[verdict.levIdx]}</b>.
                  S'il passe, tu prends de vitesse {pct(verdict.separation[verdict.levIdx])} du field
                  (seuls {pct(verdict.crowd[verdict.levIdx])} des joueurs l'ont coche).
                  {verdict.trapIdx >= 0 && (
                    <> Piege a eviter : la foule surjoue "{verdict.names[verdict.trapIdx]}" ({pct(verdict.crowd[verdict.trapIdx])})
                    alors que le marche ne lui donne que {pct(verdict.p[verdict.trapIdx])}. Peu de points a gagner, gros risque si elle se trompe.</>
                  )}
                </div>
              )}

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
                <button className="btn btn-ghost" onClick={() => { setForm(blank); setMppFilled(false); setContext(null); }}>Reinitialiser</button>
              </div>
            </>
          )}

          {/* SCORE EXACT */}
          <div className="divider" />
          <div className="sec-title" style={{ fontSize: 15 }}><span className="num">+</span> Score exact (bonus)</div>
          <p className="mini" style={{ marginTop: 6 }}>Buts attendus de chaque equipe. Ajuste si tu as une info de derniere minute (blessure, joueur menage) pas encore dans les cotes.</p>
          <div className="row g3" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr auto" }}>
            <div>
              <label className="label">Buts att. {form.a || "Eq1"}</label>
              <input className="input" inputMode="decimal" placeholder="1.6" value={form.xgA} onChange={(e) => set("xgA", e.target.value)} />
            </div>
            <div>
              <label className="label">Buts att. {form.b || "Eq2"}</label>
              <input className="input" inputMode="decimal" placeholder="0.9" value={form.xgB} onChange={(e) => set("xgB", e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={runEstimateXg}>Estimer</button>
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
                Modele Poisson : victoire 1 {pct(scores.model[0])} · nul {pct(scores.model[1])} · victoire 2 {pct(scores.model[2])}.
                Compare avec les probas du marche pour reperer les incoherences.
              </p>
            </>
          )}
        </div>

        {/* 03 : MATCHS ENREGISTRES */}
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
          Methode : estimation 1/N/2 par compilation des sources (marche sans marge bookmaker + modele de force Elo calibre sur les resultats reels), fusionnees en consensus. Esperance = proba consensus x points MPP.
          Le mode ajuste la prise de risque via un exposant gamma (prudent = 1.7, equilibre = 1.0, agressif = 0.5).
          La valeur vs foule compare la proba du marche a la part reelle de joueurs sur l'issue : au dessus de 1, l'issue est sous-jouee donc sur-payee.
          Le pari differenciant maximise un levier prudent (proba x points x racine de la rarete dans la foule).
          Aucun argent reel. L'outil aide la decision, il ne predit pas les resultats.
        </p>
      </div>
    </div>
  );
}
