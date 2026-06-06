// Tests d'invariants de la couche presse. Lance : node scripts/test-presse.mjs
// Pas de framework : assertions Node simples, dans l'esprit de test-buteur.mjs.
import {
  cleanJsonText, asciiSlug, factsForTeams, buildPresseBlock, loadPresseFacts, latestPresseDate,
} from "../src/engine/presse.js";
import { canonicalTeam } from "../src/engine/calcul.js";
import elo from "../data/elo-ratings.json" with { type: "json" };
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  FAIL:", msg); } };

// cleanJsonText : retire les fences ```json (le bug le plus sournois).
ok(cleanJsonText('```json\n{"a":1}\n```') === '{"a":1}', "fences json retirees");
ok(cleanJsonText('```\n{"a":1}\n```') === '{"a":1}', "fences nues retirees");
ok(cleanJsonText('bla bla {"a":1} fin') === '{"a":1}', "texte parasite retire");
ok(cleanJsonText('{"a":1}') === '{"a":1}', "json nu inchange");
ok(cleanJsonText(null) === "", "entree non chaine -> chaine vide");

// asciiSlug : noms accentues -> ASCII neutre (piege du televersement).
ok(asciiSlug("L'Équipe du Jeudi 4 Juin 2026.PDF") === "L_Equipe_du_Jeudi_4_Juin_2026.PDF", "accents et apostrophe normalises");
ok(/^[\x00-\x7F]+$/.test(asciiSlug("L'Équipe Du Vendredi 5 Juin.pdf")), "resultat purement ASCII");

// factsForTeams : extraction robuste par cle d'equipe.
const presse = { teams: { Spain: { facts: ["a", "b"] }, France: { facts: ["c"] } } };
ok(JSON.stringify(factsForTeams(presse, "Spain", "France")) === JSON.stringify({ home: ["a", "b"], away: ["c"] }), "facts des deux equipes");
ok(JSON.stringify(factsForTeams(presse, "Spain", "Brazil")) === JSON.stringify({ home: ["a", "b"], away: [] }), "equipe absente -> liste vide");
ok(JSON.stringify(factsForTeams({ teams: {} }, "Spain", "France")) === JSON.stringify({ home: [], away: [] }), "presse vide -> listes vides");

// buildPresseBlock : bloc de prompt, vide si aucun fait.
ok(buildPresseBlock("Espagne", "France", [], []) === "", "aucun fait -> bloc vide");
const block = buildPresseBlock("Espagne", "France", ["Carvajal forfait"], ["Mbappe menage"]);
ok(block.includes("Espagne : Carvajal forfait") && block.includes("France : Mbappe menage"), "bloc contient les faits par equipe");
ok(block.includes("pas un pronostic"), "bloc rappelle la prudence anti-invention");

// loadPresseFacts : fichier present, absent, malforme.
const dir = mkdtempSync(join(tmpdir(), "presse-"));
writeFileSync(join(dir, "presse-facts-2026-05-29.json"), JSON.stringify({ teams: { Spain: { facts: ["x"] } } }));
ok(loadPresseFacts("2026-05-29", dir).teams.Spain.facts[0] === "x", "fichier present lu");
ok(JSON.stringify(loadPresseFacts("2026-01-01", dir)) === JSON.stringify({ teams: {} }), "fichier absent -> teams vide");
writeFileSync(join(dir, "presse-facts-2026-05-30.json"), "{ pas du json");
ok(JSON.stringify(loadPresseFacts("2026-05-30", dir)) === JSON.stringify({ teams: {} }), "json malforme -> teams vide");
ok(JSON.stringify(loadPresseFacts(null, dir)) === JSON.stringify({ teams: {} }), "date nulle -> teams vide");
rmSync(dir, { recursive: true, force: true });

// latestPresseDate : repli sur le journal le plus recent, borne dans le temps.
const dir2 = mkdtempSync(join(tmpdir(), "latest-"));
writeFileSync(join(dir2, "presse-facts-2026-06-04.json"), "{}");
writeFileSync(join(dir2, "presse-facts-2026-06-05.json"), "{}");
writeFileSync(join(dir2, "autre.json"), "{}");
ok(latestPresseDate(dir2, "2026-06-06") === "2026-06-05", "prend le plus recent dans la fenetre");
ok(latestPresseDate(dir2, "2026-06-20") === null, "trop ancien -> null (hors fenetre)");
ok(latestPresseDate(dir2, "2026-06-05") === "2026-06-05", "meme jour accepte");
ok(latestPresseDate("/dossier/inexistant", "2026-06-06") === null, "dossier absent -> null");
const dir3 = mkdtempSync(join(tmpdir(), "empty-"));
ok(latestPresseDate(dir3, "2026-06-06") === null, "aucun fichier -> null");
rmSync(dir2, { recursive: true, force: true });
rmSync(dir3, { recursive: true, force: true });

// canonicalTeam : nom FR ou EN -> cle canonique du dataset Elo.
const R = elo.ratings;
ok(canonicalTeam("Espagne", R) === "Spain", "FR Espagne -> Spain");
ok(canonicalTeam("Spain", R) === "Spain", "EN Spain inchange");
ok(canonicalTeam("Etats-Unis", R) === "United States", "Etats-Unis -> United States via alias");
ok(canonicalTeam("Pays-Bas", R) === "Netherlands", "Pays-Bas -> Netherlands");
ok(canonicalTeam("Equipe Inexistante", R) === null, "inconnu -> null");

console.log(`\npresse: ${pass} OK, ${fail} KO`);
if (fail) process.exit(1);
