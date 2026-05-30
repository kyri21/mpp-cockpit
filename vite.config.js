import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite sert le frontend React sur localhost:5173 en dev.
// En production, Vercel prend le relais : il build le frontend
// et sert les fonctions serverless depuis /api/*.
export default defineConfig({
  plugins: [react()],
});
