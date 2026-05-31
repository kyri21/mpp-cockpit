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

## Comment je l'utilise

Quand un PDF du jour est present, je le lis en session (commande `/revue`) et j'en extrais
le contexte par match (compositions probables, blessures, forme, enjeu, intuitions des
experts), traduit en ajustements sur les buts attendus. L'app deployee sur Vercel ne lit
pas ces fichiers locaux : c'est un input de session.
