// Couche presse : fonctions pures, isolees de React et de Gemini.
// Les faits extraits de la presse ajustent les buts attendus via le prompt Anthropic
// existant (anti-doublon : un seul canal de contexte, jamais une source de fusion separee).
import { readFileSync } from "node:fs";
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

// Charge data/presse-facts-AAAA-MM-JJ.json. Renvoie toujours un objet { teams: {...} }.
// Fichier absent ou illisible = presse indisponible : degradation silencieuse, pas
// d'erreur propagee (mais pas d'invention non plus, les listes seront vides).
export function loadPresseFacts(date, dataDir) {
  if (!date || !dataDir) return { teams: {} };
  try {
    const raw = readFileSync(join(dataDir, `presse-facts-${date}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.teams ? parsed : { teams: {} };
  } catch {
    return { teams: {} };
  }
}
