// Fonction serverless Vercel : contexte qualitatif d'un match via Anthropic API.
// L'IA ne devine pas un xG. Elle cherche le contexte reel (recherche web) et le
// traduit en multiplicateurs explicites sur les buts attendus de chaque equipe.
//
// Recoit POST { home, away, date? }.
// Retourne { multHome, multAway, reasoning, factors:[...], sources:[...] }.
// multHome/multAway dans [0.6, 1.4], 1.0 = aucun facteur notable.
// La cle ANTHROPIC_API_KEY reste cote serveur, jamais exposee au browser.

import Anthropic from "@anthropic-ai/sdk";

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

  const prompt = `Nous sommes le ${today}, Coupe du Monde 2026. Match : ${home} contre ${away}.
Cherche sur le web le contexte recent de ces deux selections : blessures et suspensions de joueurs cles, joueurs menages, etat de forme tres recent, enjeu du match (equipe deja qualifiee qui fait tourner, match decisif), meteo extreme.

Consulte aussi les avis d'experts sur ce match, notamment ceux des anciens pros et journalistes de RMC Sport pari sportif (rmcsport.bfmtv.com/pari-sportif). Ces avis sont des opinions, pas des faits : retiens seulement les elements concrets et verifiables (compositions probables, etat de forme, dynamique), pas le pronostic brut, et ne les laisse pas dominer le contexte factuel.

Tu ne predis pas le resultat. Tu traduis ce contexte en deux multiplicateurs sur les buts attendus de chaque equipe :
- 1.0 = rien de notable.
- en dessous de 1.0 = l'equipe devrait marquer moins que sa norme (absences offensives, turnover, sans enjeu).
- au dessus de 1.0 = l'equipe devrait marquer plus (adversaire diminue en defense, forme exceptionnelle).
Reste mesure : la plupart des multiplicateurs sont entre 0.85 et 1.15. Maximum 0.6 a 1.4.

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"multHome": float, "multAway": float, "reasoning": "2 phrases max en francais", "factors": ["fait court", "..."]}`;

  const client = new Anthropic({ apiKey: key });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    return res.status(502).json({ error: `Erreur Anthropic : ${e.message}` });
  }

  // Concatene tous les blocs texte de la reponse (le reste = recherches web).
  const text = (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Collecte les URLs citees comme sources.
  const sources = [];
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
