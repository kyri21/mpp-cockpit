# Memoire du projet MPP Cockpit

Ce fichier est relu au debut de chaque session pour reprendre le fil sans re-expliquer le contexte.

## Etat du projet (mis a jour le 2026-05-30)

Phase 1 complete. L'app est deployee et fonctionnelle sur mpp-cockpit.vercel.app.
Phase en cours : collecte MobAI TERMINEE. 72 matchs collectes (pas 64 comme estime : la CdM 2026 a 48 equipes, 12 groupes de 4, soit 72 matchs de poules).
Prochaine etape immediate : Phase 2 — brancher data/mpp-points.json dans l'app (pre-remplissage auto des points g1/gN/g2).

## Ce qui est en place et fonctionne

**App deployee : mpp-cockpit.vercel.app**

Section 00 : cotes en direct via The Odds API (bouton Rafraichir, cache 5 min Vercel).
Section 01 : position dans la ligue + suggestion de mode de risque.
Section 01b : fiche match (stats football-data.org + liens sources L'Equipe / RMC / BBC / FBref / Sofascore). Apparait quand un match est charge.
Section 02 : analyse du match (verdict, espérance, valeur vs MPP, score exact Poisson).
Section 03 : matchs enregistres (localStorage, persistant entre sessions).

**Moteur de calcul : src/engine/calcul.js**

Fonctions pures exportees : vigRemove, computeVerdict, topScores, estimateXg, poisson, pct.
Constante GAMMA : prudent = 1.7, equilibre = 1.0, agressif = 0.5.

**Fonctions serverless Vercel :**

api/odds.js : appelle The Odds API, priorite bookmakers sharp (Pinnacle), retourne les matchs avec o1/oN/o2.
api/stats.js : appelle football-data.org, retourne forme + bilan + H2H pour un match.

**Commande /revue (Claude Code) :**

Fichier : .claude/commands/revue.md
Usage : taper /revue dans Claude Code le jour d'un match.
Comportement : fetchs les matchs du jour depuis l'API Vercel, browse les sources presse (L'Equipe, RMC Sport, BBC Sport, Goal.com, Marca, FBref), produit un briefing structure avec xG suggere et ordre de priorite.

**Donnees collectees via MobAI : data/mpp-points.json**

72 matchs collectes (J.1 a J.3, 11 juin au 28 juin 2026). Points MPP + pronos foule pour chaque match. Fichier : data/mpp-points.json.

**Variables d'environnement Vercel configurees :**

ODDS_API_KEY : cle The Odds API (plan gratuit 500 req/mois, largement suffisant).
FOOTBALL_DATA_API_KEY : cle football-data.org (stats equipes, forme, H2H).

## Decisions d'architecture prises (ne pas revenir dessus)

Langage : JavaScript uniquement (Node.js + React + Vite). Coherent avec le cockpit prototype.
Hebergement : Vercel. URL fixe, accessible depuis le telephone partout.
Stockage : localStorage cote browser pour position et matchs. JSON local pour les points MPP collectes via MobAI.
Declenchement des cotes : bouton dans l'app (manuel, controle).
Revue de presse : faite par Claude Code en session (commande /revue), pas dans l'app.
MobAI : utilise pour lire les points MPP sur le telephone (bridge connecte, fonctionne).
Points MPP : saisie manuelle en fallback si MobAI non disponible (champ g1/gN/g2 dans section 02).

## Repo GitHub

github.com/kyri21/mpp-cockpit (branche main, deploiement automatique Vercel sur push).

## Roadmap par phases

Phase 1 (complete) : app deployee, moteur de calcul, API cotes, fiche match, commande /revue.
Phase en cours : collecte complete des 63 matchs MPP restants via MobAI.
Phase 2 : brancher data/mpp-points.json dans l'app (pre-remplissage auto des points g1/gN/g2 quand un match est charge depuis la section 00).
Phase 3 : suivi des resultats (marquer l'issue reelle apres chaque match, bilan des recommandations).
Phase 4 (optionnelle) : bouton "Analyse IA" dans l'app qui appelle Claude API pour une synthese sans ouvrir Claude Code.

## Sources d'information

Cotes : The Odds API (the-odds-api.com), plan gratuit.
Stats equipes : football-data.org, plan gratuit.
Points MPP : collecte MobAI via lecture ecran telephone, fichier data/mpp-points.json.
Revue de presse : lequipe.fr, rmcsport.bfmtv.com, bbc.com/sport/football, goal.com, marca.com, fbref.com, sofascore.com.

## MobAI

Device ID : 00008110-000E44E814DB801E (iPhone de Demis, iOS 26.5).
Bridge : demarrer avec mcp__mobai__start_bridge avant toute interaction.
Pour naviguer dans MPP : swipe depuis le bord gauche pour revenir (iOS, pas de bouton back).
L'UI tree expose les points MPP directement dans le texte de l'element match (format : "domicile, J.x, date, heure, pts1, ptsN, pts2, exterieur").
