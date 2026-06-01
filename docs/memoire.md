# Memoire du projet MPP Cockpit

Journal d'etat lu au debut de chaque session pour reprendre le fil. L'architecture, la spec du moteur, les sources et les conventions ne sont PAS ici : elles vivent dans `CLAUDE.md`. Ce fichier ne garde que l'etat courant, la roadmap et les notes de session. On ne duplique pas CLAUDE.md.

## Etat (mis a jour le 2026-05-31)

App deployee et fonctionnelle sur mpp-cockpit.vercel.app, en prod sur la branche main.

Bascule majeure de cette session : l'app n'est plus un simple relais du marche, c'est un moteur d'estimation qui compile plusieurs sources en une probabilite consensus 1/N/2. Voir CLAUDE.md, sections "Ce que fait l'app" et "Le moteur de calcul".

Ce qui a ete livre et teste en prod :
1. Modele de force Elo calibre (`data/elo-ratings.json`, `scripts/buildElo.js`, `scripts/calibrate.js`).
2. Fusion consensus marche + force, affichage par source avec divergence.
3. Contexte qualitatif IA via recherche web (`api/analyze.js`), teste en prod, sources reelles renvoyees.
4. Avantage hote (+80 Elo) pour USA, Canada, Mexique a domicile.
5. Couche valeur sur la vraie repartition de foule (`prono_foule`).
6. Suivi des resultats : saisie de l'issue reelle par match, bilan (reussite, points pris, delta vs suivre la foule, score Brier).

Tout est commite et pousse sur main.

## Prochaines etapes possibles

1. Laisser tourner le suivi des resultats sur une dizaine de matchs, puis lire le score Brier et le delta vs foule pour juger si le consensus bat le reflexe de suivre la foule.
2. Affiner les poids de fusion (0.65 / 0.35) si les resultats le justifient.
3. Verifier le mapping des noms d'equipes pour les phases finales (equipes "Vainqueur groupe X", barragistes) qui ne mappent sur rien aujourd'hui.

Ne pas faire (decisions tranchees, voir "Principe anti-doublon" dans CLAUDE.md) :
ajouter une source "forme live" (redondante avec l'Elo), ou faire du contexte IA une source de fusion separee (double comptage de la force).

## Session 2026-05-31 (suite) : sources qualitatives expertes

Deux sources expertes ajoutees a la couche qualitative (elles ajustent les buts attendus via `api/analyze.js`, ce ne sont PAS des sources de fusion : anti-doublon).
1. RMC Sport pari sportif (rmcsport.bfmtv.com/pari-sportif) : avis d'anciens pros et journalistes, cable dans le prompt de `api/analyze.js`. Retenu comme contexte concret, jamais comme pronostic. Couvre le quotidien sur iPhone (l'app est accessible depuis le tel).
2. PDF L'Equipe quotidien (recu par WhatsApp) : depose dans `presse/lequipe-AAAA-MM-JJ.pdf` (gitignore, contenu payant jamais commit). Lu en SESSION sur l'ordi via `/revue`, pour les matchs decisifs.

Tranche, ne pas re-tenter : NE PAS lire le PDF L'Equipe dans l'app. Le PDF est image only (0 couche texte, `pdftotext` rend ~33 caracteres), 59 Mo / 33 pages, donc au dela du plafond body Vercel (~4,5 Mo) et de la limite PDF Anthropic (32 Mo). L'option captures d'ecran a ete prototypee puis retiree (friction inutile). L'Equipe reste donc une lecture de session ; RMC + web couvrent l'iPhone.

Objectif "le plus possible sur iPhone" : atteint. Tout le cockpit et la couche experts RMC tournent sur le tel. Seule la lecture approfondie du PDF L'Equipe reste sur l'ordi (matchs decisifs).

## Module meilleur buteur (Soulier d'Or) - Phase 1 (session 2026-06-01)

Spec : `docs/superpowers/specs/2026-06-01-meilleur-buteur-design.md`. Pronostic unique verrouille
avant le tournoi. Hybride par phases (option B).

Livre (Phase 1, hors MobAI) : `src/engine/buteur.js` (modele structurel pur : buts attendus de
l'equipe sur le tournoi = poule via Elo + profondeur de parcours, x part du joueur), tests
`scripts/test-buteur.mjs` (16 assertions OK), endpoint IA `api/buteur.js` (part de buts, penalty,
forme, cote), section UI "04 / Meilleur buteur" dans App.jsx, placeholder `data/buteur-candidates.json`.
Mapping FR->EN ajoute a ELO_ALIASES dans calcul.js (les 48 equipes des fixtures se resolvent
desormais sur l'Elo). Build et tests verts.

Collecte MobAI faite (session 2026-06-01) : la vraie liste de la section "Meilleur buteur" de
l'app MPP est dans `data/buteur-candidates.json`. 20 candidats nommes (Mbappé 80 pts, Messi 80,
Yamal 100, Kane 100, Vinícius 120, Haaland 150, Ronaldo 200, Depay 250, Lukaku 250, Woltemade 300,
Brahim Díaz 400, Balogun 500, Kramaric 500, Salah 600, Mahrez 700, Mané 800, Luis Díaz 900,
Núñez 900, Gyökeres 1000, McTominay 1000) + option hors-liste "Un autre" a 150 pts
(`hors_liste_bonus`). Les "points" sont les points MPP du pick (plus c'est haut, plus le buteur est
juge improbable). Pas de % foule ni de cote affiches dans cette section : `prono_foule` absent.
Les 20 equipes se resolvent sur l'Elo (graphie des fixtures de mpp-points.json) ; tests 16/16 OK,
build vert, classement end-to-end coherent (Yamal/Espagne en tete par buts d'equipe attendus).

Fix `api/buteur.js` (2026-06-01) : "Estimer les buteurs" renvoyait "Reponse IA non parseable"
(colonnes Part/Buts joueur/Esperance vides). Cause : max_tokens 2048 trop petit pour 20 joueurs,
JSON tronque donc JSON.parse echouait sur tout. Corrige : max_tokens 8192, phrase de forme limitee
a 15 mots, et parsing resilient (salvage objet par objet si troncature). Teste en prod : 20 joueurs,
shares dans [0.1,0.6], penos/cotes/sources OK.

RESTE Phase 2 : fusion des cotes bookmaker, vraie P(top buteur) par argmax de Poisson, valeur vs
foule. (En Phase 1 la proba est approchee par normalisation des lambda, et la part de buts du
joueur vient de `api/buteur.js` au clic sur "Estimer les buteurs", teste en prod uniquement.)

## Donnees collectees via MobAI : data/mpp-points.json

72 matchs (J.1 a J.3, 11 au 28 juin 2026), points MPP + `prono_foule` par match. Auto-remplissage dans l'app quand le match est charge.

## Repo et deploiement

github.com/kyri21/mpp-cockpit, branche main, deploiement automatique Vercel sur push.
Variables Vercel actives : ODDS_API_KEY, FOOTBALL_DATA_API_KEY, ANTHROPIC_API_KEY.

## MobAI (pour reprendre une collecte)

Device ID : 00008110-000E44E814DB801E (iPhone de Demis, iOS 26.5).
Bridge : demarrer avec mcp__mobai__start_bridge avant toute interaction.
Navigation : swipe depuis le bord gauche pour revenir (iOS, pas de bouton back).
UI tree : points MPP dans le texte de l'element match ("domicile, J.x, date, heure, pts1, ptsN, pts2, exterieur").

## Sources de revue de presse (lecture humaine, commande /revue)

PDF L'Equipe du jour si present dans `presse/lequipe-AAAA-MM-JJ.pdf` (voir `presse/README.md`), puis web : lequipe.fr, rmcsport.bfmtv.com, bbc.com/sport/football, goal.com, marca.com, fbref.com, sofascore.com.
