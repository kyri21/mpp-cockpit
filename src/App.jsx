// Cockpit MPP — interface principale.
// A porter depuis mpp-cockpit.jsx en phase 1.
//
// Changements par rapport au fichier original :
//   1. Les fonctions de calcul sont importees depuis src/engine/calcul.js (plus inline).
//   2. La sauvegarde utilise localStorage directement (remplace window.storage).
//   3. Un bouton "Rafraichir les cotes" appelle l'endpoint /api/odds et pré-remplit les cotes.
//   4. Le CSS reste en string inline (meme approche que l'original, simple et portable).
//
// Structure cible :
//   import { vigRemove, computeVerdict, topScores } from "./engine/calcul.js";
//   export default function App() { ... }

export default function App() {
  return <div>MPP Cockpit — a implementer en phase 1</div>;
}
