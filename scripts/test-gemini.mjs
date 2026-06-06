// Probe minimal : verifie que la cle GEMINI_API_KEY repond avec gemini-2.5-flash.
// Ne construit rien de la feature. N'affiche jamais la cle.
// Usage : node scripts/test-gemini.mjs
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

// Lit .env.local sans dependance externe (le projet n'embarque pas dotenv).
function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // pas de .env.local : on se rabat sur l'environnement deja present
  }
}

loadEnvLocal();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY absente (.env.local ou env shell).");
  process.exit(1);
}
console.log(`Cle chargee (longueur ${key.length}, prefixe ${key.slice(0, 3)}).`);

const ai = new GoogleGenAI({ apiKey: key });
const MODEL = "gemini-2.5-flash";

try {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: "Reponds par le seul mot OK.",
  });
  console.log(`Modele ${MODEL} a repondu :`, JSON.stringify(res.text));
  console.log("VERIFICATION OK");
} catch (err) {
  console.error(`Echec sur ${MODEL} :`, err?.message || err);
  if (err?.status) console.error("status:", err.status);
  process.exit(2);
}
