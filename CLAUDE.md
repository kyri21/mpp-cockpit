# CLAUDE.md — MPP Cockpit (Coupe du Monde 2026)

## Le projet

Outil personnel et purement consultatif d'aide a la decision pour le jeu Mon Petit Prono (MPP) pendant la Coupe du Monde 2026.

Cadre : jeu gratuit, sans argent, sans enjeu entre les participants de la ligue. L'outil aide a choisir les pronos. Il ne predit pas les resultats et n'envoie jamais de prono a la place de l'utilisateur sans validation explicite.

Statut : petite application independante. Elle ne fait pas partie de yorgios-global et n'a aucune dependance avec ce projet.

## Ce que fait l'app

Pour chaque match, elle recupere les cotes du marche via The Odds API, retire la marge des bookmakers, croise ces probabilites avec les points attribues par MPP, calcule l'esperance de points de chaque issue, et recommande un prono selon la position dans la ligue. Un module de score exact (Poisson) complete l'analyse.

## Architecture retenue (decidee en session 1)

Tout en JavaScript. Frontend React avec Vite, une seule fonction serverless Vercel pour la collecte des cotes, persistance en localStorage cote browser.

Composant 1, collecte des cotes : une fonction Vercel serverless (`api/odds.js`) qui appelle The Odds API et retourne les cotes en JSON. La cle API est une variable d'environnement sur Vercel, elle ne touche jamais le code ni le browser.

Composant 2, collecte des points MPP (phase 2) : pilotee par MobAI (serveur MCP qui lit l'ecran du telephone deja connecte a MPP) et produit un JSON des points par match. Les identifiants ne quittent jamais l'appareil.

Composant 3, interface : le cockpit React (`src/App.jsx`), porte depuis `mpp-cockpit.jsx`, servi par Vite et deploye sur Vercel.

Composant 4, moteur de calcul : fonctions pures isolees dans `src/engine/calcul.js`, sans aucune dependance a React. Importees par l'interface.

Stockage : localStorage dans le browser pour la position dans la ligue et les matchs enregistres. Pas de base de donnees, pas de fichiers serveur.

Declenchement : bouton "Rafraichir les cotes" dans l'interface. Manuel, controle par l'utilisateur.

Hebergement : Vercel. URL fixe, accessible depuis le telephone partout, sans que l'ordinateur soit allume.

## Decisions rejetees et leur raison

Python pour la couche donnees : rejete pour garder un seul langage (JavaScript) dans le projet, coherent avec le cockpit React.

Local WiFi uniquement : rejete car l'ordinateur doit etre allume et l'utilisateur doit etre chez lui. Vercel est plus pratique pour une utilisation pendant les matchs.

Integration dans yorgios-global : rejete, aucune dependance souhaitee.

Base de donnees : inutile pour 64 matchs sur un mois, localStorage suffit.

## Le moteur de calcul (a respecter fidelement)

Reference d'implementation : `mpp-cockpit.jsx` (fichier original fourni). Les fonctions sont isolees dans `src/engine/calcul.js`.

Probabilite marche : inverse de chaque cote decimale (1/cote), puis normalisation des trois valeurs pour retirer la marge du bookmaker (vig).

Esperance en points d'une issue : proba marche multipliee par les points MPP de cette issue.

Modes de risque : un exposant gamma applique a la proba avant multiplication (prudent = 1.7, equilibre = 1.0, agressif = 0.5). Issue recommandee egale au maximum de (points x proba puissance gamma).

Valeur vs MPP : proba marche divisee par la proba implicite MPP. La proba implicite MPP est proportionnelle a l'inverse des points (1/points), normalisee sur les trois issues. Au dessus de 1, l'issue est sous cotee par le jeu.

Score exact : loi de Poisson a partir des buts attendus de chaque equipe. Les buts attendus sont estimes depuis les cotes (fonction estimateXg existante), ou ajustes manuellement.

Suggestion de mode : fonction de la position de ligue (rang/nombre de joueurs, matchs restants). En tete et tournoi avance, tendre vers prudent. A la traine avec assez de matchs restants, tendre vers agressif.

## Sources de donnees

Cotes : The Odds API (the-odds-api.com), plan gratuit 500 requetes par mois. Cotes decimales, reference Pinnacle (sharp) ou consensus multi-bookmakers. 64 matchs = 64 requetes maximum.

Points MPP : pas d'API publique. Phase 1 : saisie manuelle dans l'interface (10 secondes par match). Phase 2 : MobAI lit l'ecran du telephone.

xG pour le module de score exact : estime automatiquement depuis les cotes (fonction estimateXg). Ajustable manuellement apres lecture de l'Equipe si une info de derniere minute n'est pas encore dans les cotes (blessure, joueur menage).

Sources editoriales pour le contexte (lecture humaine, pas automatisee) : voir `docs/memoire.md`, section "Sources d'information".

## Commandes

Installation : `npm install`
Developpement local : `npm run dev` puis ouvrir localhost:5173
Build : `npm run build`
Deploy : `git push` sur la branche principale (Vercel deploie automatiquement)
Variables d'environnement locales : copier `.env.local.example` en `.env.local` et renseigner `ODDS_API_KEY`

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
