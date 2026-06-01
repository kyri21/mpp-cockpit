# Spec : module Meilleur buteur (Soulier d'Or) MPP Cockpit

Date : 2026-06-01
Statut : design valide, implementation Phase 1 en cours (hors collecte MobAI)

## Probleme

MPP demande, en plus de l'equipe gagnante, de designer le meilleur buteur du tournoi.
C'est un pronostic unique, verrouille avant le coup d'envoi (2026-06-11), avec une liste de
favoris proposee et la possibilite de choisir hors liste (souvent mieux paye).

Le nombre de buts d'un attaquant depend de deux facteurs structurels :
1. La force de sa poule (poule faible : beaucoup de buts vite ; poule relevee : moins).
2. La profondeur de parcours de son equipe (un elimine en poule joue 3 matchs, un finaliste 7 a 8).
Historiquement le Soulier d'Or sort presque toujours d'une equipe demi-finaliste ou plus.

## Objectif Phase 1

Classer les candidats par buts attendus sur tout le tournoi (lambda) et croiser avec les
points MPP pour donner une esperance de points et un pick recommande.

Hors Phase 1 (reporte Phase 2) : fusion des cotes bookmaker, vraie P(meilleur buteur) par
argmax de Poisson entre candidats, valeur vs foule. En Phase 1 on classe par lambda et on
derive une probabilite approchee (normalisation) juste pour l'esperance de points.

## Approche : hybride par phases (option B validee)

Probabilite fondee sur trois briques, dans l'esprit du moteur 1/N/2 :
- Structurel (local, deterministe) : Elo + fixtures. C'est le coeur de la Phase 1.
- Marche (cotes top buteur) : collecte par l'IA. Reservee Phase 2 (champ `odds` deja recupere).
- Contexte IA : part de buts du joueur, tireur de penalty, forme. Necessaire des la Phase 1
  pour la part du joueur.

## Modele structurel (src/engine/buteur.js, fonctions pures)

Reutilise `forceModel`, `resolveElo`, `poissonOutcome`, `isHostNation`, `HOST_ELO_ADV` de
`calcul.js`. Aucune modification de `calcul.js`. Pour evaluer un match contre un adversaire
d'un Elo donne, on injecte un adversaire synthetique dans les ratings :
`forceModel(team, "__TYPIQUE__", { ...ratings, __TYPIQUE__: eloCible }, { homeAdvantage })`.

a) Buts attendus en poule
- `groupOpponents(team, fixtures)` : les 3 adversaires de `team` lus dans `mpp-points.json`.
- Pour chaque fixture de `team`, buts attendus de `team` via `forceModel` (avantage hote
  `HOST_ELO_ADV` si le domicile est un pays hote). Somme = `expectedGroupGoals`.

b) Qualification de poule
- `groupQualifyProb(team, fixtures, ratings)` : mini Monte Carlo du groupe (les 4 equipes, 6
  matchs, scores echantillonnes en Poisson depuis les lambdas de `forceModel`, classement par
  points puis difference de buts). Donne P(1er), P(2e), P(3e).
- Avance = P(top2) + P(3e) x THIRD_QUALIFY_FACTOR (defaut 0.6, approximation des 8 meilleurs
  3es sur 12 ; affine en Phase 2 par un Monte Carlo global).

c) Profondeur de parcours (tours a elimination directe)
- Format 48 : apres les poules, 32 equipes. Tours = R32, R16, QF, SF, Finale (5 matchs max).
- Adversaire typique par tour = mediane de l'Elo des meilleures equipes encore en lice :
  R32 = mediane top 32, R16 = top 16, QF = top 8, SF = top 4, Finale = top 2 (Elos des 48
  participants lus dans les fixtures). Les adversaires montent en gamme tour apres tour.
- P(atteindre R32) = Avance. P(atteindre tour suivant) = P(atteindre tour) x P(gagner ce
  match), avec P(gagner) = pWin + 0.5 x pNul (le nul part en prolongation/penalty).
- Buts KO = somme sur les tours de P(atteindre le tour) x buts attendus contre l'adversaire
  typique de ce tour.

d) Total et joueur
- `expectedTournamentGoals(team)` = buts poule + buts KO. Renvoie aussi `expectedMatches` et
  les P(atteindre chaque tour) pour l'affichage (indicateur de profondeur).
- `playerLambda(player)` = `share` x `expectedTournamentGoals(team)`.
- `rankCandidates(candidates, fixtures, ratings)` : calcule lambda par candidat (cache par
  equipe), proba approchee `P = lambda / somme(lambda)`, esperance `P x points`, tri par lambda.

## Donnees

- Liste des candidats + points MPP : collectee via MobAI sur la section buteurs de l'app MPP,
  ecrite dans `data/buteur-candidates.json` (liste figee, car pick unique avant tournoi).
  Schema : `{ source, collecte_le, verrou, candidats: [{ joueur, equipe, points, prono_foule? }] }`.
  L'equipe doit se resoudre sur l'Elo via `resolveElo`. A confirmer a la lecture de l'ecran :
  presence d'un % foule et/ou d'une cote/bonus hors-liste pour les buteurs (champs optionnels).
- Enrichissement IA : `api/buteur.js` (serverless, recherche web facon `analyze.js`). Entree
  `{ candidates: [{ player, team }] }`. Sortie par joueur : `share` (fraction des buts de
  l'equipe, penalty inclus, bornee 0.1 a 0.6), `penalty` (bool), `form` (note), `odds` (cote top
  buteur, pour Phase 2), `sources`. `share` surchargeable a la main dans l'UI.

## UI (src/App.jsx)

Nouvelle section "03 / Meilleur buteur" : lit `data/buteur-candidates.json`, bouton "Estimer
les buteurs" qui lance le modele structurel en local et appelle `api/buteur.js` pour les parts,
puis affiche un tableau trie par lambda : joueur, equipe, buts poule, P(atteindre les demies),
lambda tournoi, points MPP, esperance de points, et un pick recommande.

## Fichiers

- `src/engine/buteur.js` : modele structurel (fonctions pures).
- `api/buteur.js` : enrichissement IA.
- `data/buteur-candidates.json` : liste collectee (placeholder jusqu'a MobAI).
- `src/App.jsx` : section UI.
- `scripts/test-buteur.mjs` : assertions Node (invariants : adversaire plus faible => plus de
  buts ; P(atteindre tour) decroissante ; coherence share x buts ; pas de NaN).

## Anti-doublon

Le module reutilise le modele de force Elo (meme source) ; c'est un pronostic distinct (Soulier
d'Or), pas une fusion dans le 1/N/2, donc aucun double comptage.

## Verification

`npm run build`, `node scripts/test-buteur.mjs`, et test live de `api/buteur.js` une fois
deploye. La collecte MobAI et le remplissage de `data/buteur-candidates.json` se font dans une
session avec le pont MobAI actif.

## Decoupage de l'implementation

Faisable sans MobAI (cette session) : buteur.js, test-buteur.mjs, api/buteur.js, UI, placeholder
de donnees, build et tests.
Necessite MobAI (session suivante) : collecte reelle des candidats et points dans
`data/buteur-candidates.json`, puis test end to end.
