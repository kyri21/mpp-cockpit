// Fonction serverless Vercel : contexte qualitatif d'un match via Anthropic API.
// L'IA ne devine pas un xG. Elle interprete le contexte stocke (presse PDF + veille web,
// fichiers data/*-facts-*.json) en multiplicateurs sur les buts attendus de chaque equipe.
//
// Recoit POST { home, away, date? }.
// Retourne { multHome, multAway, reasoning, factors:[...], sources:[...] }.
// multHome/multAway dans [0.6, 1.4], 1.0 = aucun facteur notable.
// La cle ANTHROPIC_API_KEY reste cote serveur, jamais exposee au browser.

import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { loadPresseFacts, loadWebFacts, factsForTeams, buildContextBlock, latestPresseDate, latestWebDate } from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Methode non autorisee." });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Cle API manquante. Configurer ANTHROPIC_API_KEY dans Vercel." });
  }

  const { home, away, date } = req.body || {};
  if (!home || !away) {
    return res.status(400).json({ error: "Parametres manquants : home et away requis." });
  }

  const today = date || new Date().toISOString().slice(0, 10);

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

  // Si la veille web a deja stocke du contexte pour ces equipes, on l'interprete tel quel
  // (pas de recherche en direct, moins cher). Sinon, repli sur une recherche web en direct
  // pour ne pas perdre la couche web tant que la veille n'a pas tourne (pas de regression).
  const hasStoredWeb = webFor.home.length > 0 || webFor.away.length > 0;
  const searchClause = hasStoredWeb
    ? ""
    : `\nSi le contexte ci-dessus manque d'elements sur une equipe, cherche sur le web (RMC, Foot Mercato, sites de foot specialises) ses blessures, absences, turnover et forme recente. Retiens les faits concrets, pas les pronostics.`;

  const prompt = `Nous sommes le ${today}, Coupe du Monde 2026. Match : ${home} contre ${away}.
Tu ne predis pas le resultat. A partir du contexte connu ci-dessous et de ta connaissance des deux selections, traduis le contexte en deux multiplicateurs sur les buts attendus de chaque equipe :
- 1.0 = rien de notable.
- en dessous de 1.0 = l'equipe devrait marquer moins que sa norme (absences offensives, turnover, sans enjeu).
- au dessus de 1.0 = l'equipe devrait marquer plus (adversaire diminue en defense, forme exceptionnelle).
Reste mesure : la plupart des multiplicateurs sont entre 0.85 et 1.15. Maximum 0.6 a 1.4. Si le contexte est vide, renvoie 1.0 et 1.0.${contextBlock}${searchClause}

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"multHome": float, "multAway": float, "reasoning": "2 phrases max en francais", "factors": ["fait court", "..."]}`;

  const client = new Anthropic({ apiKey: key });
  const createParams = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  };
  // Outil de recherche web active seulement en repli (aucun contexte web stocke).
  if (!hasStoredWeb) {
    createParams.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
  }

  let message;
  try {
    message = await client.messages.create(createParams);
  } catch (e) {
    return res.status(502).json({ error: `Erreur Anthropic : ${e.message}` });
  }

  // Concatene tous les blocs texte de la reponse.
  const text = (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Sources : celles stockees par la veille, plus celles d'une eventuelle recherche en direct.
  const sources = [...webSources];
  for (const b of message.content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    }
  }

  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return res.status(502).json({ error: "Reponse IA non parseable.", raw: text });
  }

  if (typeof parsed.multHome !== "number" || typeof parsed.multAway !== "number") {
    return res.status(502).json({ error: "Reponse IA incomplete.", raw: text });
  }

  res.json({
    multHome: clamp(parsed.multHome, 0.6, 1.4),
    multAway: clamp(parsed.multAway, 0.6, 1.4),
    reasoning: parsed.reasoning || "",
    factors: Array.isArray(parsed.factors) ? parsed.factors.slice(0, 6) : [],
    sources: sources.slice(0, 5),
  });
}
