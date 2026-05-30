# Memoire du projet MPP Cockpit

Ce fichier est relu au debut de chaque session pour reprendre le fil sans re-expliquer le contexte.

## Etat du projet

Phase : squelette cree, architecture decidee, aucune logique metier codee.
Prochaine etape : installer les dependances, porter le moteur de calcul dans `src/engine/calcul.js`, connecter l'appel API dans `api/odds.js`, porter le cockpit dans `src/App.jsx`.

## Decisions d'architecture et leur justification

**Langage : JavaScript (Node.js + React)**
Raison : coherence avec le cockpit React deja prototype dans mpp-cockpit.jsx. Un seul langage, un seul package.json, pas de changement de contexte.

**Hebergement : Vercel**
Raison : l'utilisateur veut acceder a l'outil depuis son telephone partout, pas seulement depuis chez lui. Vercel fournit une URL fixe, le deploiement se fait par git push, le plan gratuit suffit largement.

**Backend : une seule fonction serverless Vercel (`api/odds.js`)**
Raison : il faut proteger la cle The Odds API. Elle ne doit jamais etre exposee dans le frontend. La fonction serverless fait le relais entre le browser et l'API externe.

**Stockage : localStorage uniquement**
Raison : 64 matchs sur un mois ne necessitent pas de base de donnees. Le cockpit original utilisait deja window.storage (equivalent localStorage). Pas d'infrastructure a maintenir.

**Declenchement des cotes : bouton dans l'interface**
Raison : les cotes bougent peu dans les 24-48h avant un match. Un fetch manuel suffit, c'est plus simple qu'un cron et ca consomme moins de requetes API (quota 500/mois, largement suffisant pour 64 matchs).

**Source de cotes : The Odds API**
Raison : API propre, plan gratuit suffisant pour la CdM (500 requetes/mois vs 64 matchs max), cotes Pinnacle disponibles (reference sharp), documentation claire.

**Points MPP : saisie manuelle en phase 1, MobAI en phase 2**
Raison : la saisie manuelle prend 10 secondes et ne necessite aucune infrastructure. MobAI sera ajoute quand le cockpit de base fonctionnera.

## Ce que fait le moteur (ne pas changer sans discussion)

Le moteur transforme des cotes de bookmaker en recommandation optimale pour le systeme de points MPP. Il ne predit pas les resultats : il trouve quelle issue maximise l'esperance de points compte tenu du mode de risque choisi.

Les cotes du marche sont le signal central. Elles integrent deja tout ce que les professionnels savent (forme, blessures publiees, historique). L'ajustement manuel des buts attendus (xG) sert uniquement pour les informations de derniere minute pas encore dans le marche.

## Roadmap par phases

**Phase 1 : cockpit de base fonctionnel (priorite)**
Installer les dependances Vite + React.
Porter `src/engine/calcul.js` (fonctions pures : vigRemove, computeVerdict, topScores, poisson).
Porter `src/App.jsx` depuis mpp-cockpit.jsx, en branchant les donnees sur de vraies cotes.
Ecrire `api/odds.js` pour relayer The Odds API.
Configurer la variable d'environnement ODDS_API_KEY.
Deployer sur Vercel et tester depuis le telephone.

**Phase 2 : integration MobAI pour les points MPP**
Ecrire le script MobAI qui lit l'ecran du telephone et extrait les points 1/N/2.
Exposer une route dans l'app ou un endpoint local pour recevoir ce JSON.
Brancher l'interface sur ces donnees plutot que la saisie manuelle.

**Phase 3 : ameliorations optionnelles**
Notification push avant chaque match (Web Push API ou simple rappel calendrier).
Historique des pronos avec suivi des resultats.
Import du calendrier CdM 2026 pour pré-afficher les matchs du jour.

## Ce qui reste a faire avant de commencer a coder

Creer un compte sur the-odds-api.com et recuperer la cle API gratuite.
Configurer le depot git et le projet Vercel.
Executer `npm install` pour installer les dependances.

## Sources d'information

**Programmatiques (integrees a l'outil) :**
The Odds API (the-odds-api.com) : cotes en temps reel, reference principale.
football-data.org : calendrier des matchs, donnees d'equipes (plan gratuit disponible, utile pour importer les matchs de la CdM automatiquement en phase 3).

**Editoriales pour le contexte (lecture humaine avant d'ajuster le xG) :**
lequipe.fr : compositions officielles, blessures, actualite des equipes. Seule source vraiment utile pour le module de score exact.
rmcsport.bfmtv.com : analyses pre-match, avis des consultants (anciens joueurs).
sofascore.com ou flashscore.com : statistiques recentes de chaque equipe, forme sur les derniers matchs.

**Stats avancees (pour calibrer les buts attendus) :**
fbref.com : xG par equipe et par match en competition internationale, profondeur d'analyse elevee.
understat.com : xG par equipe et par joueur, interface simple.

**Pronostics de professionnels (lecture humaine, aucune integration automatique) :**
Les sites de paris (Winamax, Betclic, Unibet) publient des pronostics editoriaux gratuits. Utile pour croiser avec le moteur, pas pour remplacer le calcul.

**Important :** ces sources servent uniquement a l'utilisateur pour enrichir son jugement avant d'ajuster manuellement les buts attendus. Le moteur lui-meme n'a besoin que des cotes (The Odds API) et des points MPP.
