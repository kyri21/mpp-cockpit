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

lequipe.fr, rmcsport.bfmtv.com, bbc.com/sport/football, goal.com, marca.com, fbref.com, sofascore.com.
