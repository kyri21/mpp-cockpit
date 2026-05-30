// Moteur de calcul MPP Cockpit.
// Toutes les fonctions sont pures : entrees => sortie, sans effet de bord, sans React.
// Reference d'implementation : mpp-cockpit.jsx (fichier original a la racine du projet).
//
// Fonctions a porter depuis mpp-cockpit.jsx en phase 1 :
//   fact(n)                          : factorielle recursive
//   poisson(k, lambda)               : probabilite de Poisson
//   vigRemove(o1, oN, o2)            : retire la marge bookmaker, retourne les 3 probas normalisees
//   computeVerdict(match, mode)      : verdict complet (proba, esperance, edge, recommandation)
//   topScores(xgA, xgB)             : top 6 scores par Poisson + probas 1/N/2 du modele
//
// Constantes a conserver :
//   GAMMA  : { prudent: 1.7, equilibre: 1.0, agressif: 0.5 }
//   LABELS : ["1 (victoire ", "Nul", "2 (victoire "]
//
// Ne rien coder ici tant que l'architecture n'est pas validee.

export {};
