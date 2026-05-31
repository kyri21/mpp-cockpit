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

## Architecture retenue (decidee en session 1)

Tout en JavaScript. Frontend React avec Vite, une seule fonction serverless Vercel pour la collecte des cotes, persistance en localStorage cote browser.

Composant 1, collecte des cotes : une fonction Vercel serverless (`api/odds.js`) qui appelle The Odds API et retourne les cotes en JSON. La cle API est une variable d'environnement sur Vercel, elle ne touche jamais le code ni le browser.

Composant 2, collecte des points MPP (phase 2) : pilotee par MobAI (serveur MCP qui lit l'ecran du telephone deja connecte a MPP) et produit un JSON des points par match. Les identifiants ne quittent jamais l'appareil.

Composant 3, interface : le cockpit React (`src/App.jsx`), porte depuis `mpp-cockpit.jsx`, servi par Vite et deploye sur Vercel.

Composant 3 bis, contexte qualitatif : une fonction Vercel serverless (`api/analyze.js`) qui appelle l'API Anthropic avec recherche web et renvoie des multiplicateurs sur les buts attendus de chaque equipe, plus les sources. La cle ANTHROPIC_API_KEY est une variable d'environnement Vercel.

Composant 4, moteur de calcul : fonctions pures isolees dans `src/engine/calcul.js`, sans aucune dependance a React. Importees par l'interface. Couvre le marche, le modele de force Elo, la fusion consensus et la couche decision MPP.

Composant 5, modele de force hors ligne : `data/elo-ratings.json` (Elo precalcule des selections) est embarque dans le bundle, genere par `scripts/buildElo.js` depuis un historique de matchs internationaux, et calibre par `scripts/calibrate.js`. Aucune cle, aucune API au runtime : ce modele produit une estimation meme sans cotes.

Stockage : localStorage dans le browser pour la position dans la ligue et les matchs enregistres (avec leur issue reelle pour le suivi). Pas de base de donnees, pas de fichiers serveur.

Declenchement : bouton "Rafraichir les cotes" dans l'interface. Manuel, controle par l'utilisateur.

Hebergement : Vercel. URL fixe, accessible depuis le telephone partout, sans que l'ordinateur soit allume.

## Decisions rejetees et leur raison

Python pour la couche donnees : rejete pour garder un seul langage (JavaScript) dans le projet, coherent avec le cockpit React.

Local WiFi uniquement : rejete car l'ordinateur doit etre allume et l'utilisateur doit etre chez lui. Vercel est plus pratique pour une utilisation pendant les matchs.

Integration dans yorgios-global : rejete, aucune dependance souhaitee.

Base de donnees : inutile pour 64 matchs sur un mois, localStorage suffit.

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

Contexte qualitatif : API Anthropic avec recherche web (`api/analyze.js`). Blessures, suspensions, turnover, enjeu, meteo. Renvoie des multiplicateurs et des sources cliquables.

Points MPP : pas d'API publique. Saisie manuelle dans l'interface, ou auto-remplissage depuis `data/mpp-points.json` (collecte MobAI) quand le match y figure. Le fichier contient aussi `prono_foule` (repartition reelle de la foule), utilise par la couche valeur.

Stats d'equipes (fiche match, affichage humain seulement) : football-data.org. Ne nourrit pas l'estimation.

## Commandes

Installation : `npm install`
Developpement local : `npm run dev` puis ouvrir localhost:3000
Build : `npm run build`
Deploy : `git push` sur main (Vercel deploie automatiquement)
Regenerer l'Elo : `node scripts/buildElo.js` (refetch le CSV si absent). Recalibrer : `node scripts/calibrate.js` puis reporter les constantes dans `calcul.js`.
Revue de presse des matchs du jour : `/revue` dans Claude Code
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
