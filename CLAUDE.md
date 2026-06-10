# CLAUDE.md — MPP Cockpit (Coupe du Monde 2026)

## Le projet

Outil personnel et purement consultatif d'aide a la decision pour le jeu Mon Petit Prono (MPP) pendant la Coupe du Monde 2026.

Cadre : jeu gratuit, sans argent, sans enjeu entre les participants de la ligue. L'outil aide a choisir les pronos. Il ne predit pas les resultats et n'envoie jamais de prono a la place de l'utilisateur sans validation explicite.

Statut : petite application independante. Elle ne fait pas partie de yorgios-global et n'a aucune dependance avec ce projet.

## Ce que fait l'app

Objectif central : compiler toutes les donnees disponibles sur un match et deux equipes pour estimer la probabilite de chaque issue (victoire 1, nul N, victoire 2). Ce n'est pas un outil pour jouer a contre-pied de la foule, c'est un estimateur.

Pour chaque match, elle assemble plusieurs sources independantes en une probabilite consensus :
le marche (cotes The Odds API, marge retiree), un modele de force base sur l'Elo des selections, et un contexte qualitatif (blessures, turnover, enjeu) cherche par l'IA sur le web. Les sources sont fusionnees par log-opinion pool et affichees une par une pour rendre les divergences visibles.

Ensuite seulement vient la couche decision MPP : la probabilite consensus est croisee avec les points MPP pour calculer l'esperance de points, et la position dans la ligue suggere un mode de risque. Un module de score exact (Poisson) et un suivi des resultats completent l'ensemble.

L'app aide aussi au pronostic du meilleur buteur (Soulier d'Or), un pick unique verrouille avant le tournoi. Elle estime les buts attendus de chaque candidat sur tout le tournoi (force de sa poule + profondeur de parcours via l'Elo, multiplies par sa part de buts dans l'equipe) et les croise avec les points MPP. Voir la section dediee plus bas et la spec `docs/superpowers/specs/2026-06-01-meilleur-buteur-design.md`.

## Architecture retenue (decidee en session 1)

Tout en JavaScript. Frontend React avec Vite, une seule fonction serverless Vercel pour la collecte des cotes, persistance en localStorage cote browser.

Composant 1, collecte des cotes : une fonction Vercel serverless (`api/odds.js`) qui appelle The Odds API et retourne les cotes en JSON. La cle API est une variable d'environnement sur Vercel, elle ne touche jamais le code ni le browser.

Composant 2, collecte des points MPP (phase 2) : pilotee par MobAI (serveur MCP qui lit l'ecran du telephone deja connecte a MPP) et produit un JSON des points par match. Les identifiants ne quittent jamais l'appareil.

Composant 3, interface : le cockpit React (`src/App.jsx`), porte depuis `mpp-cockpit.jsx`, servi par Vite et deploye sur Vercel. La liste des matchs charges (section 00) est groupee par jour en accordeon (le prochain jour ouvert, un seul a la fois) avec un filtre par equipe, triee du plus proche au plus loin.

Composant 3 bis, contexte qualitatif : une fonction Vercel serverless (`api/analyze.js`) qui appelle l'API Anthropic avec recherche web et renvoie des multiplicateurs sur les buts attendus de chaque equipe, plus les sources. La cle ANTHROPIC_API_KEY est une variable d'environnement Vercel.

Composant 4, moteur de calcul : fonctions pures isolees dans `src/engine/calcul.js`, sans aucune dependance a React. Importees par l'interface. Couvre le marche, le modele de force Elo, la fusion consensus et la couche decision MPP.

Composant 5, modele de force hors ligne : `data/elo-ratings.json` (Elo precalcule des selections) est embarque dans le bundle, genere par `scripts/buildElo.js` depuis un historique de matchs internationaux, et calibre par `scripts/calibrate.js`. Aucune cle, aucune API au runtime : ce modele produit une estimation meme sans cotes.

Composant 6, module meilleur buteur : `src/engine/buteur.js` (fonctions pures) estime les buts attendus d'une equipe sur tout le tournoi (poule via l'Elo des adversaires lus dans `mpp-points.json`, plus parcours KO : proba d'avancer x buts attendus contre un adversaire type par tour) puis, via la part de buts du joueur, son lambda. Il reutilise `forceModel` sans modifier `calcul.js` (adversaire synthetique injecte dans les ratings). La donnee joueur (part de buts, tireur de penalty, forme, cote) vient de `api/buteur.js` (Anthropic, recherche web). La liste des candidats et leurs points MPP vivent dans `data/buteur-candidates.json` (collecte MobAI, pick unique fige avant le tournoi). Tests : `scripts/test-buteur.mjs`. Statut : Phase 1 livree ; Phase 2 (fusion des cotes, vraie P(meilleur buteur) par argmax de Poisson, valeur vs foule) a venir.

Stockage : localStorage dans le browser pour la position dans la ligue et les matchs enregistres (avec leur issue reelle pour le suivi). Pas de base de donnees, pas de fichiers serveur.

Declenchement : bouton "Rafraichir les cotes" dans l'interface. Manuel, controle par l'utilisateur.

Hebergement : Vercel. URL fixe, accessible depuis le telephone partout, sans que l'ordinateur soit allume.

## Decisions rejetees et leur raison

Python pour la couche donnees : rejete pour garder un seul langage (JavaScript) dans le projet, coherent avec le cockpit React.

Local WiFi uniquement : rejete car l'ordinateur doit etre allume et l'utilisateur doit etre chez lui. Vercel est plus pratique pour une utilisation pendant les matchs.

Integration dans yorgios-global : rejete, aucune dependance souhaitee.

Base de donnees : inutile pour 64 matchs sur un mois, localStorage suffit.

Lire le PDF L'Equipe dans l'app via Anthropic : rejete (tranche le 2026-05-31). Le PDF est image only (aucune couche texte, `pdftotext` rend ~33 caracteres), 20 a 60 Mo / 33 pages, donc au dela du plafond de body d'une fonction serverless Vercel (~4,5 Mo) et de la limite PDF d'Anthropic (32 Mo). Une option captures d'ecran a ete prototypee puis retiree (friction inutile cote utilisateur). CONTOURNE depuis le 2026-06-06 : Gemini lit nativement les PDF image only. La lecture se fait en local (script `scripts/revue.mjs`) et produit un petit JSON de faits que le runtime consomme. Voir la section "Couche presse PDF via Gemini (livree)" plus bas. Anthropic reste pour la recherche web ; Gemini ne sert qu'a la lecture locale du PDF.

## Le moteur de calcul (a respecter fidelement)

Toutes les fonctions sont pures, isolees dans `src/engine/calcul.js`, sans dependance a React.

Etape 1, estimation des probabilites (le coeur). Trois estimateurs independants, chacun produisant un triplet (p1, pN, p2) :

  Marche (`vigRemove`) : inverse de chaque cote decimale, normalise pour retirer la marge du bookmaker.

  Force Elo (`forceModel`) : ecart d'Elo entre les deux selections (`resolveElo` sur `data/elo-ratings.json`) converti en suprematie de buts (constante ELO_PER_GOAL), d'ou les buts attendus de chaque equipe, passes dans une loi de Poisson corrigee Dixon-Coles (`poissonOutcome`) pour obtenir 1/N/2. Avantage du terrain (HOST_ELO_ADV) reserve aux pays hotes a domicile via `isHostNation` (USA, Canada, Mexique), jamais en match neutre.

  Contexte qualitatif (`api/analyze.js`, cote serveur) : multiplicateurs sur les buts attendus issus de la recherche web (blessures, turnover, enjeu).

Fusion (`fuseProb`) : moyenne geometrique ponderee (log-opinion pool) des triplets, renormalisee. Poids par defaut : marche 0.65, force 0.35. Le resultat est la proba consensus.

Constantes calibrees (ne pas remettre des valeurs arbitraires) : ELO_PER_GOAL = 195, TOTAL_GOALS = 2.75, DC_RHO = -0.10. Issues de `scripts/calibrate.js` sur 6702 matchs neutres reels (maximisation de vraisemblance). Pour recalibrer, relancer le script, pas a la main.

Etape 2, decision MPP (vient apres l'estimation, jamais avant).

  Esperance en points d'une issue : proba consensus multipliee par les points MPP. `computeVerdict` prend la proba consensus en parametre (pOverride) : l'esperance repart du consensus, pas du seul marche.

  Modes de risque : exposant gamma sur la proba (prudent = 1.7, equilibre = 1.0, agressif = 0.5). Issue recommandee = maximum de (points x proba puissance gamma).

  Valeur vs foule et levier : utilisent la repartition reelle de la foule (`prono_foule`, champs c1/cN/c2) quand elle est disponible, sinon repli sur la proba implicite des points (1/points). Valeur = proba consensus / part de foule (au dessus de 1, issue sous-jouee donc sur-payee). Levier prudent = proba x points x racine(1 - part de foule).

Score exact : loi de Poisson a partir des buts attendus (`topScores`). Buts attendus estimes depuis les cotes (`estimateXg`) ou ajustes manuellement.

Suggestion de mode : fonction de la position de ligue (rang, joueurs, matchs restants). En tete et tournoi avance, tendre vers prudent. A la traine avec assez de matchs restants, tendre vers agressif.

## Principe anti-doublon du moteur (important)

Aucune source ne doit compter deux fois la meme information, sinon l'estimation se degrade. Regles a respecter :

Le contexte IA ajuste les buts attendus du modele de force, il n'est PAS une source de fusion separee (sinon la force compterait deux fois). Quand le contexte existe, la source affichee devient "Force + contexte".

Ne pas ajouter de source "forme recente" via football-data : l'Elo encode deja la forme (sa mise a jour match apres match), et cette source serait vide en debut de tournoi. La fiche match (`api/stats.js`) sert l'affichage humain, pas l'estimation.

La proba implicite des points MPP (1/points) n'est qu'un repli quand la vraie repartition de foule manque. Des que `prono_foule` est la, c'est elle qui fait foi.

## Sources de donnees

Cotes : The Odds API (the-odds-api.com), plan gratuit 500 requetes par mois. Cotes decimales, reference Pinnacle (sharp) ou consensus multi-bookmakers.

Elo des selections : `data/elo-ratings.json`, precalcule hors ligne depuis l'historique des matchs internationaux (dataset martj42/international_results, CC0, refetch dans `scripts/buildElo.js` si besoin). Aucune cle, embarque dans le bundle.

Contexte qualitatif : API Anthropic avec recherche web (`api/analyze.js`). Blessures, suspensions, turnover, enjeu, meteo. Renvoie des multiplicateurs et des sources cliquables. La recherche consulte aussi les avis d'experts (anciens pros, journalistes) de RMC Sport pari sportif (rmcsport.bfmtv.com/pari-sportif), retenus comme contexte et non comme pronostic.

Presse quotidienne (L'Equipe PDF, via Gemini en local) : le PDF recu chaque jour par WhatsApp se depose dans `presse/` (n'importe quel nom, gitignore, contenu payant jamais commit). En local, `node scripts/revue.mjs` le lit avec Gemini et ecrit `data/presse-facts-AAAA-MM-JJ.json` (faits par equipe, lui commitable). Le runtime `api/analyze.js` charge ce JSON et injecte les faits dans son prompt Anthropic. Comme RMC, c'est du contexte qualitatif qui ajuste les buts attendus, pas une source de fusion separee (principe anti-doublon). Voir la section "Couche presse PDF via Gemini (livree)" plus bas.

Points MPP : pas d'API publique. Saisie manuelle dans l'interface, ou auto-remplissage depuis `data/mpp-points.json` (collecte MobAI) quand le match y figure. Le fichier contient aussi `prono_foule` (repartition reelle de la foule), utilise par la couche valeur.

Stats d'equipes (fiche match, affichage humain seulement) : football-data.org. Ne nourrit pas l'estimation.

## Commandes

Installation : `npm install`
Developpement local : `npm run dev` puis ouvrir localhost:3000
Build : `npm run build`
Deploy : `git push` sur main (Vercel deploie automatiquement)
Regenerer l'Elo : `node scripts/buildElo.js` (refetch le CSV si absent). Recalibrer : `node scripts/calibrate.js` puis reporter les constantes dans `calcul.js`.
Tester le module buteur : `node scripts/test-buteur.mjs` (assertions d'invariants, sans framework).
Revue de presse du jour (Gemini, local) : `node scripts/revue.mjs` (prend le PDF le plus recent de `presse/` et le date du jour) ou `node scripts/revue.mjs "presse/<fichier>.pdf" AAAA-MM-JJ`. Ensuite committer `data/presse-facts-AAAA-MM-JJ.json` et pousser pour que la prod en beneficie.
Tester la cle Gemini : `node scripts/test-gemini.mjs`
Variable d'environnement Gemini : `GEMINI_API_KEY` dans `.env.local` (local) et sur Vercel.
Variables d'environnement locales : copier `.env.local.example` en `.env.local` et renseigner `ODDS_API_KEY`

## Etat de deploiement (au 2026-05-30)

App en production : mpp-cockpit.vercel.app
Repo : github.com/kyri21/mpp-cockpit
Variables Vercel configurees : ODDS_API_KEY, FOOTBALL_DATA_API_KEY, ANTHROPIC_API_KEY (les trois actives et testees en prod, recherche web Anthropic incluse).

## MobAI

Device ID : 00008110-000E44E814DB801E (iPhone Demis, iOS 26.5)
Demarrer le bridge avant toute interaction : mcp__mobai__start_bridge
Navigation arriere sur iOS : swipe depuis le bord gauche (pas de bouton back).
Points MPP dans l'UI tree : element match contient "domicile, journee, date, heure, pts1, ptsN, pts2, exterieur".
Donnees collectees : data/mpp-points.json (1 match sur 64 au 2026-05-30).

## Conventions

Langue : code commente et echanges en francais.

Style des textes destines a l'utilisateur (docs, messages, commentaires) : jamais de tirets longs, ni de tirets comme puces ou separateurs. Utiliser des phrases, des deux points, des parentheses ou des retours a la ligne.

Code : moteur de calcul (`src/engine/calcul.js`) totalement isole de la presentation. Fonctions pures, testables sans React.

Nommage : camelCase pour les fonctions, MAJUSCULES pour les constantes (GAMMA, LABELS), noms en anglais dans le code, commentaires en francais.

## Garde-fous

Respecter les conditions d'utilisation de MPP. Usage strictement limite au compte et aux donnees de l'utilisateur.

Aucun envoi de prono automatique sans validation explicite de l'utilisateur.

L'outil est une aide a la decision, pas un predicteur. Ne jamais presenter une recommandation comme une certitude.

La cle API The Odds API ne doit jamais apparaitre dans le code commit, uniquement dans les variables d'environnement.

## Memoire du projet

Relire `docs/memoire.md` au debut de chaque session pour reprendre le fil.

## Couche presse PDF via Gemini (livree 2026-06-06, deployee et verifiee en prod)

Etat : LIVREE et active en production. Architecture : (1) local, `scripts/revue.mjs` lit `presse/*.pdf` via la Gemini Files API (`@google/genai`, `gemini-2.5-flash`), en UNE etape (lecture + structuration + rapprochement des noms vers les cles canoniques anglaises de `elo-ratings.json`), et ecrit `data/presse-facts-AAAA-MM-JJ.json`. (2) Runtime, `api/analyze.js` charge ce JSON (jour courant, sinon journal le plus recent via `latestPresseDate`, borne a 4 jours), canonise home/away via `canonicalTeam` (calcul.js), et injecte les faits dans le prompt Anthropic existant. Fonctions pures dans `src/engine/presse.js`, tests `scripts/test-presse.mjs`. `vercel.json` : `includeFiles: data/presse-facts-*.json`. Anti-doublon : un seul multiplicateur, jamais une source de fusion separee. Verifie en prod le 2026-06-06 (France contre Cote d'Ivoire : les faits du 5 juin ressortent dans les `factors`, multHome 0.9 / multAway 1.1). Garde-fous codes : compression ghostscript `/ebook` si PDF > 40 Mo, nom ASCII avant upload (`fileURLToPath` pour les chemins a espace), nettoyage des fences ```json, backoff 503, anti-invention dans le prompt, fiches vides explicites. Spec/plan : `docs/superpowers/{specs,plans}/2026-06-06-presse-pdf-gemini*`.

Routine quotidienne pendant le tournoi : deposer le PDF du jour dans `presse/`, lancer `node scripts/revue.mjs`, committer `data/presse-facts-<jour>.json` et pousser (le push deploie). La presse n'est active pour un match que si un fichier de faits a moins de 4 jours existe.

Contexte historique (lecons de Rugby Prono, app soeur, qui a corrige une cascade de bugs avant cette implementation) : Cela MET A JOUR la decision du 2026-05-31 ("lire le PDF L'Equipe dans l'app : rejete") : la raison du rejet (PDF image-only 59 Mo, au dela de la limite Anthropic 32 Mo et du body serverless Vercel ~4,5 Mo) est contournee par Gemini. Le PDF redevient exploitable.

### 1. Ajouter Gemini a cote de Claude (pour lire les PDF image-only)
Anthropic ne lit pas un PDF scanne de 59 Mo (limite 32 Mo, pas d'OCR fiable). Gemini lit nativement les PDF image-only par vision. Ajouter le SDK `@google/genai` et une variable `GEMINI_API_KEY` (locale et Vercel). Modele : `gemini-2.5-flash`. Pieges constates sur le compte de l'utilisateur : `gemini-2.0-flash` renvoie 429 avec `limit: 0` (free tier non alloue a ce compte, ce n'est PAS un epuisement par usage) ; `gemini-1.5-flash` renvoie 404 (deprecie). La cle Gemini fournie commence par `AQ.` (probable jeton ephemere, peut expirer ; sinon regenerer une vraie cle AI Studio format `AIza...`). Anthropic reste pour la recherche web et l'analyse ; Gemini sert la lecture de PDF.

### 2. Lire les gros PDF par la Files API, jamais en inline
L'envoi du PDF directement dans la requete plafonne a 20 Mo cote Gemini, et au body serverless Vercel (~4,5 Mo). La Files API (televersement) accepte jusqu'a 2 Go / ~1000 pages et evite les deux limites. En JS : `ai.files.upload({ file })` puis passer le fichier televerse dans `generateContent`. Attendre l'etat ACTIF avant de lire.

### 3. Faire l'extraction PDF EN LOCAL, pas dans une fonction Vercel
Le dossier `presse/` est gitignore (contenu payant) et trop lourd : il n'existe pas au runtime sur Vercel. Architecture recommandee : un script Node local (ex. `scripts/revue.mjs`, lance en session Claude Code, la ou le PDF existe) lit `presse/*.pdf` via Gemini Files API et ECRIT un petit JSON de faits par equipe (ex. `data/presse-facts-AAAA-MM-JJ.json`), lui commitable et deploye. Le runtime (`api/analyze.js` ou le moteur) ne consomme que ce petit JSON. On separe le travail lourd (local, Gemini, une fois par jour) du runtime (serverless, leger). Anti-doublon respecte : ces faits ajustent les buts attendus comme le contexte IA, ils ne sont JAMAIS une source de fusion separee.

### 4. Pieges qui cassent la couche en silence (a corriger d'emblee)
1. Reponse JSON entouree de balises ```json : un `JSON.parse` brut echoue et l'ajustement tombe a zero SANS erreur visible (sur tous les matchs). Toujours nettoyer avant de parser : retirer les fences ```json, sinon isoler du premier `{` au dernier `}`. C'est le bug le plus sournois rencontre (il a annule toute la couche IA de Rugby Prono sans le moindre message).
2. Erreur 503 "overloaded" tres frequente chez Gemini : reessayer avec backoff (distinct du quota 429).
3. Noms de fichiers accentues (ex. "L'Equipe.pdf") : le televersement peut planter sur l'encodage du nom. Copier le fichier sous un nom ASCII neutre avant d'envoyer.
4. Compression PDF : ghostscript `-dPDFSETTINGS=/ebook` reduit certains PDF mais PAS les journaux deja optimises (un Midi Olympique restait a 38 Mo). Ne pas compter sur la compression ; la Files API (point 2) evite d'avoir a compresser. Si vraiment necessaire, re-rasteriser via `pdftoppm` basse definition puis recombiner (img2pdf ou Pillow), au prix de la lisibilite.
5. Rapprochement des noms : la presse ecrit les equipes autrement que le code (en foot : formes longues ou courtes, langues, surnoms). Donner au modele la liste EXACTE de tes noms plus des exemples de correspondance, et lui faire produire la fiche par equipe DIRECTEMENT (lecture plus structuration en UNE seule etape Gemini), au lieu de passer par un second modele plus faible qui reperd tout (erreur faite dans Rugby Prono : le maillon local perdait les faits a cause des noms officiels).
6. Anti-invention : exiger "n'extrais que ce qui est ecrit dans la presse, n'invente aucun nom ni information". Les modeles completent volontiers avec une memoire perimee (joueurs partis, vieux effectifs) ; se mefier des details nominatifs et les traiter comme indicatifs.
7. Ne pas avaler les erreurs en silence : en cas d'echec de lecture, logguer (console.error) et renvoyer des fiches vides explicites, pour distinguer "presse indisponible" de "presse neutre".

### 5. Recherche web sites specialises
La recherche web Anthropic (`api/analyze.js`) couvre deja RMC. Pour elargir (L'Equipe, sites de foot specialises), garder ces sources comme contexte qualitatif qui ajuste les buts attendus, jamais comme pronostic ni source de fusion separee (principe anti-doublon deja en place).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **mpp-cockpit** (675 symbols, 864 relationships, 17 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/mpp-cockpit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/mpp-cockpit/clusters` | All functional areas |
| `gitnexus://repo/mpp-cockpit/processes` | All execution flows |
| `gitnexus://repo/mpp-cockpit/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
