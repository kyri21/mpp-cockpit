# Couche presse PDF via Gemini (lecture locale, contexte runtime)

Date : 2026-06-06
Statut : design valide, en attente de relecture utilisateur avant plan.

## Probleme

L'Equipe arrive chaque jour en PDF dans `presse/`. Ces PDF sont image only (aucune
couche texte), 20 a 60 Mo, 33 pages. Ils depassent la limite PDF d'Anthropic (32 Mo)
et le plafond de body d'une fonction serverless Vercel (4,5 Mo). La decision du
2026-05-31 (ne pas lire le PDF dans l'app) est levee : Gemini lit nativement les PDF
image only par vision, et l'app soeur Rugby Prono a valide cette approche sur de vrais
matchs.

Objectif : rendre la presse quotidienne exploitable comme contexte qualitatif, sans
jamais en faire une source de fusion separee (principe anti-doublon du moteur).

## Decision produit

Les faits extraits de la presse nourrissent l'analyse IA EN SILENCE : ils sont injectes
dans le prompt Anthropic existant (`api/analyze.js`), qui continue de produire UN seul
couple de multiplicateurs `multHome` / `multAway`. Pas de nouvelle source, pas de nouvel
affichage. Choix valide par l'utilisateur le 2026-06-06.

## Architecture : deux moities etanches

### Moitie 1, extraction locale : `scripts/revue.mjs`

Tourne en session Claude Code, la ou `presse/*.pdf` existe (le dossier est gitignore et
absent du runtime Vercel). Travail lourd, une fois par jour.

Etapes :
1. Copier le PDF du jour sous un nom ASCII neutre (les noms accentues, ex.
   `L'Equipe du Jeudi 4 Juin 2026.PDF`, peuvent casser le televersement).
2. Televerser via la Gemini Files API (`ai.files.upload`), qui accepte jusqu'a 2 Go et
   ~1000 pages, evitant les limites inline (20 Mo Gemini, 4,5 Mo Vercel). Attendre
   l'etat `ACTIVE` avant de lire.
3. Un seul appel `gemini-2.5-flash` : lecture + structuration + rapprochement des noms
   en une etape. Le prompt fournit la liste exacte des noms canoniques anglais (depuis
   `data/elo-ratings.json`) comme vocabulaire impose, des exemples de correspondance
   (l'Espagne vers Spain), et une consigne anti-invention stricte.
4. Nettoyer la reponse avant `JSON.parse` : retirer les balises ```json, sinon isoler
   du premier `{` au dernier `}`. Reessayer sur erreur 503 (overloaded) avec backoff,
   distinct du quota 429.
5. Ecrire `data/presse-facts-AAAA-MM-JJ.json`.

Modele de cle Gemini : variable `GEMINI_API_KEY` (locale dans `.env.local`, et deja sur
Vercel). Modele `gemini-2.5-flash` (le 2.0 renvoie 429 limit:0 sur ce compte, le 1.5 est
en 404). La cle commence par `AQ.` (jeton possiblement ephemere : premier suspect si un
appel echoue en 401/403).

### Schema de sortie

```json
{
  "source": "L'Equipe",
  "paperDate": "2026-05-29",
  "generatedAt": "2026-06-06T12:00:00Z",
  "teams": {
    "Spain":  { "facts": ["Carvajal forfait (genou)", "compo type attendue"] },
    "France": { "facts": ["Mbappe menage, deja qualifie"] }
  }
}
```

`facts` : liste de faits concrets et courts, en francais, tels qu'ecrits dans la presse.
En cas d'echec de lecture : `console.error` explicite et `teams: {}` (distinguer presse
indisponible de presse neutre). Jamais d'erreur avalee en silence.

### Moitie 2, consommation runtime : `api/analyze.js`

La fonction recoit deja `{ home, away, date }`.
1. Charger `data/presse-facts-${date}.json` s'il existe, via une fonction pure
   `loadPresseFacts(date, dataDir)` (testable hors Vercel).
2. Recuperer les `facts` de `home` et `away` (noms deja canoniques, correspondance
   directe).
3. S'il y en a, injecter un bloc "Presse du jour (L'Equipe)" dans le prompt Anthropic
   existant, avec la meme prudence que RMC : faits concrets seulement, pas de pronostic.
4. Anthropic renvoie UN seul couple `multHome` / `multAway`, mieux informe. Anti-doublon
   respecte : un seul canal d'ajustement des buts attendus.
5. Fichier ou equipe absents : aucun bloc presse, comportement identique a aujourd'hui
   (degradation silencieuse, zero erreur).

Nommage et correspondance des dates : le fichier est nomme par la date du journal
(`paperDate`), et le runtime cherche `presse-facts-${date}.json` ou `date` est la date du
match. Les deux coincident dans l'usage normal (on analyse les matchs du jour avec le
journal du jour). Si elles different, la presse est simplement ignoree pour ce match
(degradation silencieuse), ce qui est le comportement voulu.

### Piege Vercel : inclusion du fichier

Une fonction serverless ne lit pas un fichier non importe statiquement (le file tracing
ne le suit pas). Ajouter dans `vercel.json` :

```json
{
  "framework": "vite",
  "functions": { "api/analyze.js": { "includeFiles": "data/presse-facts-*.json" } }
}
```

Verifie en local ; la confirmation prod se fait au moment ou l'utilisateur autorise un
deploiement.

## Ce qui ne change pas

Le moteur (`src/engine/calcul.js`), la fusion consensus, les poids (marche 0.65, force
0.35), l'interface : rien. Les faits presse n'ajoutent aucune source, ils affinent le
multiplicateur de contexte deja existant.

## Tests (TDD)

Fonctions pures isolees, testees en Node sans framework (modele `scripts/test-buteur.mjs`) :
- `loadPresseFacts(date, dataDir)` : fichier present, absent, equipe manquante.
- Nettoyage JSON : reponse entouree de ```json, texte parasite autour, JSON nu.
- Copie sous nom ASCII : nom accentue vers nom neutre.

Puis run reel de `scripts/revue.mjs` sur `presse/Lquipe Du Vendredi 29 Mai 2026.pdf` et
revue des faits extraits par equipe AVANT de brancher la consommation.

## Conventions respectees

Fonctions pures isolees de React. Code en anglais, commentaires en francais. Pas de
tirets longs ni de puces tiret dans les textes. Aucun commit ni deploiement sans accord
explicite de l'utilisateur (un push sur main declenche un deploiement Vercel).

## Anti-doublon (rappel du principe a ne pas violer)

Le contexte presse ajuste les buts attendus du modele de force, exactement comme le
contexte IA web. Il n'est jamais une source de fusion separee : sinon la force compterait
deux fois. C'est pourquoi les faits passent par le prompt Anthropic existant et non par
un multiplicateur additionnel applique a part.
