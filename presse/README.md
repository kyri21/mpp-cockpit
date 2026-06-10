# Presse quotidienne

Sources qualitatives expertes pour nourrir le contexte du moteur (couche `api/analyze.js`,
multiplicateurs sur les buts attendus). Ce ne sont PAS des sources de fusion separees :
elles ajustent la force, elles ne comptent pas une nouvelle fois (principe anti-doublon).

## L'Equipe (PDF quotidien)

Recu par WhatsApp chaque jour. Le sauvegarder ici en nommant par date :

```
presse/lequipe-AAAA-MM-JJ.pdf
```

Exemple : `presse/lequipe-2026-06-14.pdf`

Contenu payant : ces PDF sont gitignores, jamais commits ni pousses sur GitHub.
Usage strictement personnel, lecture en session pour la revue de presse des matchs du jour.

## RMC Sport pari sportif

Avis d'anciens pros et de journalistes sur les matchs a venir :
https://rmcsport.bfmtv.com/pari-sportif/

A consulter pendant la Coupe du Monde. Source web (pas de fichier a stocker).

## Comment je l'utilise (depuis le 2026-06-06 : automatise via Gemini)

Le PDF est lu en local par Gemini, qui en extrait un petit JSON de faits par equipe.

```
node scripts/revue.mjs                                      # PDF le plus recent de presse/
node scripts/revue.mjs "presse/<fichier>.pdf" AAAA-MM-JJ    # PDF et date explicites
```

Le script ecrit `data/presse-facts-AAAA-MM-JJ.json` (faits concrets par equipe : blessures,
turnover, forme, enjeu). Ce JSON, lui, est commitable. Une fois committe et pousse,
`api/analyze.js` deployee sur Vercel le lit et injecte ces faits dans son contexte Anthropic
(ajustement des buts attendus, principe anti-doublon). Le gros PDF reste local et gitignore ;
seul le petit JSON de faits part en prod.

Routine quotidienne pendant le tournoi : deposer le PDF du jour ici, lancer `revue.mjs`,
committer le JSON de faits, pousser. La presse n'est active pour un match que si un fichier
de faits date de moins de quatre jours.
