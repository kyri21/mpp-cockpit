// Correspondance noms d'equipes : noms API The Odds API (anglais) ↔ noms MPP (francais).
// Utilise pour le pre-remplissage automatique des points g1/gN/g2.

// Normalise un nom : minuscules, sans accents, sans ponctuation.
function normalize(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Noms API anglais normalisees → noms MPP francais exacts.
// Les equipes dont le nom est identique apres normalisation n'ont pas besoin d'etre listees
// (Canada, Panama, Qatar, Ghana, Iran, Portugal, Uruguay, Paraguay...).
const API_TO_MPP = {
  "south africa": "Afrique du Sud",
  "algeria": "Algérie",
  "germany": "Allemagne",
  "england": "Angleterre",
  "saudi arabia": "Arabie saoudite",
  "argentina": "Argentine",
  "australia": "Australie",
  "austria": "Autriche",
  "belgium": "Belgique",
  "bosnia and herzegovina": "Bosnie",
  "bosnia herzegovina": "Bosnie",
  "brazil": "Brésil",
  "cape verde": "Cap-Vert",
  "colombia": "Colombie",
  "south korea": "Corée du Sud",
  "korea republic": "Corée du Sud",
  "republic of korea": "Corée du Sud",
  "croatia": "Croatie",
  "ivory coast": "Côte d'Ivoire",
  "cote d ivoire": "Côte d'Ivoire",
  "spain": "Espagne",
  "haiti": "Haïti",
  "iraq": "Irak",
  "japan": "Japon",
  "jordan": "Jordanie",
  "morocco": "Maroc",
  "mexico": "Mexique",
  "norway": "Norvège",
  "new zealand": "Nouvelle-Zélande",
  "uzbekistan": "Ouzbékistan",
  "netherlands": "Pays-Bas",
  "dr congo": "RD Congo",
  "congo dr": "RD Congo",
  "democratic republic of congo": "RD Congo",
  "switzerland": "Suisse",
  "sweden": "Suède",
  "senegal": "Sénégal",
  "czech republic": "Tchéquie",
  "czechia": "Tchéquie",
  "tunisia": "Tunisie",
  "turkey": "Turquie",
  "scotland": "Écosse",
  "egypt": "Égypte",
  "ecuador": "Équateur",
  "united states": "États-Unis",
  "usa": "États-Unis",
};

// Resout un nom API vers la forme normalisee MPP.
function resolveToMppNorm(apiName) {
  const normed = normalize(apiName);
  const frenchName = API_TO_MPP[normed];
  return frenchName ? normalize(frenchName) : normed;
}

// Construit un index { domicile normalise → { exterieur normalise → match } }.
function buildIndex(matchs) {
  const idx = {};
  for (const m of matchs) {
    const domKey = normalize(m.domicile);
    const extKey = normalize(m.exterieur);
    if (!idx[domKey]) idx[domKey] = {};
    idx[domKey][extKey] = m;
  }
  return idx;
}

// Retourne le match MPP correspondant aux equipes API, ou null si introuvable.
export function findMppMatch(apiHome, apiAway, matchs) {
  const idx = buildIndex(matchs);
  const domKey = resolveToMppNorm(apiHome);
  const extKey = resolveToMppNorm(apiAway);
  return idx[domKey]?.[extKey] ?? null;
}
