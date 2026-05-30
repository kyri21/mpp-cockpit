// Fonction serverless Vercel : relai securise vers The Odds API.
// La cle ODDS_API_KEY reste cote serveur, jamais exposee au browser.
//
// Parametres query string :
//   sport   : cle du sport (defaut : soccer_fifa_world_cup)
//   regions : marches geographiques (defaut : eu)
//
// Reponse : tableau de matchs simplifies { id, home, away, commence, o1, oN, o2, bookmaker }

const PREFERRED_BOOKMAKERS = ["pinnacle", "betfair_ex_eu", "sport888", "unibet"];

function extractOdds(event) {
  // Priorite aux bookmakers sharp, sinon premier disponible.
  let source = null;
  for (const key of PREFERRED_BOOKMAKERS) {
    source = event.bookmakers.find((b) => b.key === key);
    if (source) break;
  }
  if (!source) source = event.bookmakers[0];
  if (!source) return null;

  const h2h = source.markets.find((m) => m.key === "h2h");
  if (!h2h) return null;

  const home = h2h.outcomes.find((o) => o.name === event.home_team);
  const draw = h2h.outcomes.find((o) => o.name === "Draw");
  const away = h2h.outcomes.find((o) => o.name === event.away_team);
  if (!home || !draw || !away) return null;

  return {
    id: event.id,
    home: event.home_team,
    away: event.away_team,
    commence: event.commence_time,
    o1: home.price,
    oN: draw.price,
    o2: away.price,
    bookmaker: source.title,
  };
}

export default async function handler(req, res) {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Cle API manquante. Configurer ODDS_API_KEY dans Vercel." });
  }

  const sport = req.query.sport || "soccer_fifa_world_cup";
  const regions = req.query.regions || "eu";
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${key}&regions=${regions}&markets=h2h&oddsFormat=decimal`;

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    return res.status(502).json({ error: "Impossible de joindre The Odds API." });
  }

  if (response.status === 401) {
    return res.status(401).json({ error: "Cle API invalide ou expiree." });
  }
  if (response.status === 422) {
    return res.status(422).json({ error: `Sport "${sport}" non disponible ou pas encore en ligne.` });
  }
  if (!response.ok) {
    return res.status(response.status).json({ error: `Erreur The Odds API : ${response.status}` });
  }

  const data = await response.json();

  // Quota restant transmis au frontend pour info.
  const quotaRemaining = response.headers.get("x-requests-remaining");
  const matches = data.map(extractOdds).filter(Boolean);

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
  res.json({ matches, quotaRemaining });
}
