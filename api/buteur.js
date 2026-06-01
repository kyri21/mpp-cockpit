// Fonction serverless Vercel : enrichissement des candidats au titre de meilleur buteur.
// Le modele structurel (buts attendus de l'equipe sur le tournoi) est calcule cote client dans
// src/engine/buteur.js. Cet endpoint ne fournit QUE la donnee joueur que l'Elo ne connait pas :
// la part de buts du joueur dans son equipe (penalty inclus), son statut, et, pour la Phase 2,
// la cote bookmaker "top buteur". La cle ANTHROPIC_API_KEY reste cote serveur.
//
// Recoit POST { candidates: [{ player, team }] }.
// Retourne { players: [{ player, team, share, penalty, form, odds, sources }] }.
// share dans [0.1, 0.6] = fraction des buts de l'equipe prise par le joueur.

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

  const list = Array.isArray(req.body?.candidates) ? req.body.candidates.slice(0, 30) : [];
  const candidates = list.filter((c) => c && c.player && c.team);
  if (!candidates.length) {
    return res.status(400).json({ error: "Parametre manquant : candidates [{ player, team }]." });
  }

  const today = new Date().toISOString().slice(0, 10);
  const lines = candidates.map((c, i) => `${i + 1}. ${c.player} (${c.team})`).join("\n");

  const prompt = `Nous sommes le ${today}, juste avant la Coupe du Monde 2026. Pour chaque joueur ci-dessous, cherche sur le web les informations recentes (deux dernieres annees en selection nationale) :

${lines}

Pour chaque joueur, estime :
- "share" : la fraction des buts de SA SELECTION qu'il marque, penalties inclus (ex. un grand buteur tireur de penalty est souvent autour de 0.30 a 0.45 ; un attaquant partage autour de 0.15 a 0.25). Entre 0.1 et 0.6.
- "penalty" : true s'il est le tireur de penalty attitre, sinon false.
- "form" : une phrase courte sur sa forme, ses blessures, son statut de titulaire.
- "odds" : sa cote decimale actuelle de meilleur buteur du tournoi chez un bookmaker si tu la trouves, sinon null.

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{"players": [{"player": "Nom", "team": "Equipe", "share": float, "penalty": bool, "form": "...", "odds": float ou null}]}`;

  const client = new Anthropic({ apiKey: key });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    return res.status(502).json({ error: `Erreur Anthropic : ${e.message}` });
  }

  const text = (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

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

  if (!Array.isArray(parsed.players)) {
    return res.status(502).json({ error: "Reponse IA incomplete.", raw: text });
  }

  const players = parsed.players.map((p) => ({
    player: p.player,
    team: p.team,
    share: typeof p.share === "number" ? clamp(p.share, 0.1, 0.6) : null,
    penalty: !!p.penalty,
    form: p.form || "",
    odds: typeof p.odds === "number" ? p.odds : null,
  }));

  res.json({ players, sources: sources.slice(0, 6) });
}
