// Fonction serverless Vercel : analyse IA d'un match via Anthropic API.
// Recoit POST { home, away, o1, oN, o2 }, retourne { xgA, xgB, reasoning }.
// La cle ANTHROPIC_API_KEY reste cote serveur, jamais exposee au browser.

import Anthropic from "@anthropic-ai/sdk";

function vigRemove(o1, oN, o2) {
  const r1 = 1 / o1, rN = 1 / oN, r2 = 1 / o2;
  const total = r1 + rN + r2;
  return [r1 / total, rN / total, r2 / total];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Methode non autorisee." });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Cle API manquante. Configurer ANTHROPIC_API_KEY dans Vercel." });
  }

  const { home, away, o1, oN, o2 } = req.body || {};
  if (!home || !away || !o1 || !oN || !o2) {
    return res.status(400).json({ error: "Parametres manquants : home, away, o1, oN, o2 requis." });
  }

  const [p1, pN, p2] = vigRemove(parseFloat(o1), parseFloat(oN), parseFloat(o2));

  const prompt = `Tu es un analyste football expert en Coupe du Monde. Pour ce match de phase de groupes 2026 :
Equipe domicile : ${home}
Equipe exterieur : ${away}
Cotes Pinnacle : 1=${o1} N=${oN} 2=${o2}
Probabilites nettes : ${home} ${(p1 * 100).toFixed(1)}% / Nul ${(pN * 100).toFixed(1)}% / ${away} ${(p2 * 100).toFixed(1)}%

Estime les buts attendus (xG) en te basant sur le style de jeu et la puissance offensive/defensive de chaque equipe en CdM 2026.
Reponds UNIQUEMENT avec ce JSON (rien d'autre) : {"xgA": float, "xgB": float, "reasoning": "2 phrases max"}`;

  const client = new Anthropic({ apiKey: key });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    return res.status(502).json({ error: `Erreur Anthropic : ${e.message}` });
  }

  const text = message.content[0]?.text || "";

  // Claude peut entourer le JSON de backticks ou de texte parasite — on extrait le JSON.
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return res.status(502).json({ error: "Reponse IA non parseable.", raw: text });
  }

  if (typeof parsed.xgA !== "number" || typeof parsed.xgB !== "number") {
    return res.status(502).json({ error: "Reponse IA incomplete.", raw: text });
  }

  res.json({
    xgA: Math.round(parsed.xgA * 10) / 10,
    xgB: Math.round(parsed.xgB * 10) / 10,
    reasoning: parsed.reasoning || "",
  });
}
