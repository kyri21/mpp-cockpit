// Fonction serverless Vercel : relai entre le browser et The Odds API.
// La cle API (ODDS_API_KEY) reste cote serveur, jamais exposee au browser.
//
// Parametres attendus en query string :
//   sport    : identifiant du sport (ex. "soccer_fifa_world_cup")
//   regions  : marches geographiques (ex. "eu" pour cotes europeennes)
//   markets  : type de cote demandee (ex. "h2h" pour 1/N/2)
//
// Reponse : JSON brut de The Odds API, transmis tel quel au frontend.
//
// A implementer en phase 1.

export default async function handler(req, res) {
  // TODO phase 1 : construire l'URL The Odds API, faire le fetch, retourner le JSON.
  res.status(501).json({ message: "Non implemente" });
}
