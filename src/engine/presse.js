// Couche presse : fonctions pures, isolees de React et de Gemini.
// Les faits extraits de la presse ajustent les buts attendus via le prompt Anthropic
// existant (anti-doublon : un seul canal de contexte, jamais une source de fusion separee).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Retire un eventuel bloc ```json ... ``` puis isole du premier { au dernier }.
// Bug le plus sournois rencontre sur Rugby Prono : un JSON.parse brut sur une reponse
// entouree de fences echoue en silence et annule tout l'ajustement.
export function cleanJsonText(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s.trim();
}

// Normalise un nom de fichier accentue en ASCII neutre avant televersement Gemini
// (les noms accentues peuvent casser l'upload).
export function asciiSlug(str) {
  return (str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "_")
    .replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// Recupere les faits des deux equipes d'un match depuis le JSON de presse.
export function factsForTeams(presse, homeKey, awayKey) {
  const teams = (presse && presse.teams) || {};
  const pick = (k) => (k && teams[k] && Array.isArray(teams[k].facts)) ? teams[k].facts : [];
  return { home: pick(homeKey), away: pick(awayKey) };
}

// Construit le bloc de prompt injecte dans la requete Anthropic. Vide si aucun fait,
// pour ne rien changer au comportement quand la presse est absente.
export function buildPresseBlock(homeName, awayName, homeFacts, awayFacts) {
  const lines = [];
  if (homeFacts.length) lines.push(`${homeName} : ${homeFacts.join(" ; ")}`);
  if (awayFacts.length) lines.push(`${awayName} : ${awayFacts.join(" ; ")}`);
  if (!lines.length) return "";
  return `\n\nPresse du jour (L'Equipe), faits concrets a integrer comme contexte (ce n'est pas un pronostic, n'invente rien au dela de ces faits) :\n${lines.join("\n")}`;
}

// Charge data/<prefix><date>.json. Renvoie toujours { teams: {...} }. Fichier absent ou
// illisible = couche indisponible : degradation silencieuse, jamais d'erreur propagee.
export function loadFacts(prefix, date, dataDir) {
  if (!prefix || !date || !dataDir) return { teams: {} };
  try {
    const raw = readFileSync(join(dataDir, `${prefix}${date}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.teams ? parsed : { teams: {} };
  } catch {
    return { teams: {} };
  }
}

export function loadPresseFacts(date, dataDir) {
  return loadFacts("presse-facts-", date, dataDir);
}

export function loadWebFacts(date, dataDir) {
  return loadFacts("web-facts-", date, dataDir);
}

// Date du fichier <prefix>AAAA-MM-JJ.json le plus recent, a moins de maxAgeDays de refDate.
// Repli quand l'app n'envoie pas de date ; borne temporelle pour ne pas ressortir du
// contexte perime. Renvoie null si rien d'exploitable.
export function latestFactsDate(prefix, dataDir, refDate, maxAgeDays = 4) {
  if (!prefix || !dataDir) return null;
  try {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}(\\d{4}-\\d{2}-\\d{2})\\.json$`);
    const dates = readdirSync(dataDir)
      .map((f) => f.match(re))
      .filter(Boolean)
      .map((m) => m[1])
      .sort();
    if (!dates.length) return null;
    const latest = dates[dates.length - 1];
    if (refDate) {
      const ageDays = Math.abs(Date.parse(refDate) - Date.parse(latest)) / 86400000;
      if (ageDays > maxAgeDays) return null;
    }
    return latest;
  } catch {
    return null;
  }
}

export function latestPresseDate(dataDir, refDate, maxAgeDays = 4) {
  return latestFactsDate("presse-facts-", dataDir, refDate, maxAgeDays);
}

export function latestWebDate(dataDir, refDate, maxAgeDays = 4) {
  return latestFactsDate("web-facts-", dataDir, refDate, maxAgeDays);
}

// Equipes (noms canoniques) qui jouent entre fromDate et fromDate+days inclus, depuis les
// fixtures mpp-points.json. canonical est une fonction nom -> nom canonique (ou null).
export function teamsPlayingSoon(fixtures, fromDate, days, canonical) {
  if (!Array.isArray(fixtures) || !fromDate) return [];
  const from = Date.parse(fromDate);
  const to = from + days * 86400000;
  const out = [];
  const seen = new Set();
  for (const f of fixtures) {
    const t = Date.parse(f.date);
    if (Number.isNaN(t) || t < from || t > to) continue;
    for (const name of [f.domicile, f.exterieur]) {
      const key = canonical(name);
      if (key && !seen.has(key)) { seen.add(key); out.push(key); }
    }
  }
  return out;
}

// Lignes de contexte d'une equipe, etiquetees par provenance (presse L'Equipe, web).
function teamContextLines(name, presseFacts, webFacts) {
  const parts = [];
  if (presseFacts.length) parts.push(`  L'Equipe : ${presseFacts.join(" ; ")}`);
  if (webFacts.length) parts.push(`  Web (Foot Mercato, RMC) : ${webFacts.join(" ; ")}`);
  return parts.length ? [`${name} :`, ...parts] : [];
}

// Bloc de contexte injecte dans le prompt Anthropic, fusionnant presse et web par equipe.
// presseFor et webFor sont les sorties de factsForTeams ({ home: [...], away: [...] }).
// Vide si aucun fait : le prompt reste alors inchange.
export function buildContextBlock(homeName, awayName, presseFor, webFor) {
  const lines = [
    ...teamContextLines(homeName, presseFor.home, webFor.home),
    ...teamContextLines(awayName, presseFor.away, webFor.away),
  ];
  if (!lines.length) return "";
  return `\n\nContexte du jour, faits concrets a integrer comme contexte (ce n'est pas un pronostic, n'invente rien au dela de ces faits ; un fait confirme par les deux sources est plus sur) :\n${lines.join("\n")}`;
}
