# Couche veille web (sites specialises) + recoupement avec le PDF L'Equipe

Date : 2026-06-10
Statut : design en attente de validation utilisateur avant plan.

## Probleme

Aujourd'hui le contexte qualitatif vient de deux endroits asymetriques :
- Le PDF L'Equipe est lu en local (Gemini) et STOCKE dans `data/presse-facts-*.json`.
- Les sites specialises sont consultes en DIRECT par `api/analyze.js` (recherche web
  Anthropic) a chaque appel : rien n'est stocke, rien n'est pre-interprete, et la
  recherche est repayee a chaque clic.

L'utilisateur veut que toute information utile soit STOCKEE, INTERPRETEE et UTILISEE, et
que les infos web soient RECOUPEES avec le PDF L'Equipe.

## Benchmark des sources (fait le 2026-06-10)

| Source | Atteignable en auto | Paywall | Decision |
|--------|---------------------|---------|----------|
| Foot Mercato (footmercato.net) | oui (fetch direct et recherche) | non | retenue |
| RMC et RMC pari sportif (rmcsport.bfmtv.com) | oui (crawler Anthropic autorise) | non | retenue |
| Marca (marca.com) | non, bloque le crawler Anthropic (HTTP 400) | partiel | ecartee de l'auto |
| L'Equipe web (lequipe.fr) | non, bloque le crawler Anthropic + paywall | oui | deja couvert par le PDF |

Sources web retenues pour la veille : Foot Mercato et RMC. Marca en backlog (necessiterait
un vrai navigateur stealth). L'Equipe reste sur la route PDF locale (Gemini).

## Architecture : trois couches stockees, une interpretation au runtime

### Couche A (existante) : PDF L'Equipe -> `data/presse-facts-AAAA-MM-JJ.json`
Inchangee. Script local `scripts/revue.mjs`, Gemini, faits par equipe.

### Couche B (nouvelle) : veille web -> `data/web-facts-AAAA-MM-JJ.json`
Script local `scripts/veille.mjs`, lance A LA DEMANDE de l'utilisateur (pas de cron).

Entree : une date (defaut aujourd'hui) et, en option, une liste d'equipes. Sans liste, le
script derive les equipes qui jouent dans les prochains jours depuis `data/mpp-points.json`.

Pour chaque equipe : un appel Anthropic avec recherche web restreinte aux domaines retenus
(`footmercato.net`, `rmcsport.bfmtv.com`). Le prompt fournit AUSSI les faits PDF du jour
pour cette equipe (couche A) et demande au modele de faire le recoupement en une seule
etape : confirmer, completer, ou signaler une contradiction. Anti-invention strict (ne
retenir que ce qui est ecrit sur les sites cites, pas de memoire).

Sortie par equipe (cle = nom canonique anglais) :
```json
{
  "source": "web (Foot Mercato, RMC)",
  "date": "2026-06-10",
  "generatedAt": "2026-06-10T12:00:00Z",
  "teams": {
    "Netherlands": {
      "facts": ["faits web concrets, confirmes ou nouveaux"],
      "sources": [{ "title": "...", "url": "..." }],
      "reconciliation": {
        "confirmedByBoth": ["fait dit par le PDF ET le web"],
        "webOnly": ["fait vu seulement sur le web"],
        "pdfOnly": ["fait du PDF non retrouve sur le web"],
        "contradictions": ["divergence entre PDF et web"]
      }
    }
  }
}
```

`facts` est ce que le runtime consomme (faits web confirmes plus web-only). Le bloc
`reconciliation` sert au briefing humain (affiche en session) et a l'audit. En cas d'echec
de lecture : `console.error` et equipe absente ou `facts: []` explicite, jamais d'erreur
avalee.

### Recoupement affiche en session
A la fin du run, le script imprime, equipe par equipe, l'etat du recoupement
(confirme par les deux, web seulement, PDF seulement, contradiction), pour que l'utilisateur
voie d'un coup d'oeil la fiabilite de chaque fait. Une info confirmee par deux sources
independantes pese plus ; une contradiction est un drapeau a arbitrer.

### Couche C : interpretation au runtime (`api/analyze.js`)
La fonction charge les DEUX couches stockees du jour (presse-facts et web-facts, avec le
meme repli sur le fichier le plus recent borne a 4 jours), fusionne les faits par equipe en
les etiquetant par provenance ("L'Equipe (presse)" et "Web (Foot Mercato, RMC)"), et les
injecte dans son prompt. Anthropic les reconcilie en UN SEUL couple de multiplicateurs
(anti-doublon : jamais une source de fusion separee).

Decision : la recherche web EN DIRECT est RETIREE de `api/analyze.js`. Elle ferait doublon
avec la couche B stockee et coute a chaque clic. Consequence assumee : le contexte web n'est
present que si l'utilisateur a lance `veille.mjs` ce jour-la (couche on demand voulue). Les
`sources` renvoyees a l'app viennent desormais des web-facts stockes. Revertible si besoin
(remettre l'outil web_search).

## Fonctions pures a ajouter (testables sans reseau)

Dans `src/engine/presse.js` (ou un module voisin) :
- Generaliser `loadPresseFacts` et `latestPresseDate` pour accepter un prefixe de fichier
  (`presse-facts-` ou `web-facts-`), afin de servir les deux couches sans dupliquer.
- `teamsPlayingSoon(fixtures, fromDate, days)` : noms canoniques des equipes qui jouent dans
  la fenetre, depuis `mpp-points.json`.
- `mergeFactLayers(presseTeam, webTeam)` : liste de faits fusionnee et dedupliquee pour une
  equipe, etiquetee par provenance, pour `buildContextBlock`.
- `buildContextBlock(home, away, presse, web)` : remplace ou etend `buildPresseBlock` en
  distinguant les deux provenances dans le texte injecte.

Le recoupement semantique (confirme/contradiction) est fait par Anthropic dans `veille.mjs`
(le texte libre ne se compare pas de maniere fiable par heuristique), pas par une fonction
pure.

## Ce qui ne change pas

Le moteur (`calcul.js`), la fusion consensus, les poids, l'UI. Les deux couches de contexte
ajustent les buts attendus via le meme canal unique (anti-doublon).

## Tests (TDD)

- `loadFacts`/`latestFactsDate` generalises : prefixe presse et web, present/absent/borne.
- `teamsPlayingSoon` : fenetre de dates, noms canoniques, doublons.
- `mergeFactLayers` : fusion, dedup, etiquetage de provenance, equipe absente d'une couche.
- `buildContextBlock` : bloc vide si rien, provenances distinctes si faits.
- Puis run reel de `veille.mjs` sur les matchs a venir et revue du recoupement avant de
  brancher la consommation.

## Conventions et garde-fous

Fonctions pures isolees de React. Code anglais, commentaires francais. Pas de tirets longs ni
de puces tiret. Nettoyage des fences ```json avant parsing. Backoff sur surcharge. Anti-
invention dans le prompt. Erreurs jamais avalees (fiches vides explicites). Recherche web
restreinte aux domaines retenus via `allowed_domains`. Aucun commit ni deploiement sans
accord explicite (un push sur main deploie).

## Anti-doublon (rappel)

PDF et web sont deux sources de CONTEXTE qui ajustent les buts attendus, jamais deux sources
de fusion separees. Elles passent par le meme prompt Anthropic qui produit un seul
multiplicateur. Le recoupement sert a ponderer la confiance, pas a compter deux fois.
