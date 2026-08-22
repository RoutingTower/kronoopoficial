// Por padrão lê backend/.env (projeto de desenvolvimento). Pra rodar um
// script (ex.: seed-firestore.js) contra outro projeto — o de produção,
// por exemplo — sem mexer no .env do dia a dia, aponte ENV_FILE:
//   PowerShell:  $env:ENV_FILE=".env.production"; node scripts/seed-firestore.js
//   bash:        ENV_FILE=.env.production node scripts/seed-firestore.js
// Ver docs/FIREBASE-SETUP.md → "Ambiente de produção separado".
require("dotenv").config({ path: process.env.ENV_FILE || ".env" });

// Origens permitidas a chamar a API (cabeçalho Origin do CORS). Em dev, o
// frontend aberto via file:// manda Origin: "null" e via servidor estático
// manda http://localhost:<porta> — ambos liberados por padrão. Em produção,
// defina ALLOWED_ORIGINS com a(s) URL(s) real(is) do frontend publicado
// (ex.: "https://kronoop-a1b2c.web.app,https://seuusuario.github.io").
const defaultOrigins = ["null", "http://localhost:5500", "http://127.0.0.1:5500"];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : defaultOrigins;

module.exports = {
  port: process.env.PORT || 3001,
  allowedOrigins,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  },
  // Usado por supabaseService.js — coexiste com o bloco "firebase" acima
  // enquanto o cutover não acontece (ver docs/MIGRACAO-SUPABASE.md).
  // SUPABASE_SERVICE_ROLE_KEY, não a anon key: o backend precisa ignorar
  // RLS do mesmo jeito que a service account do Firebase ignorava as regras
  // do Firestore (autorização já vive em backend/src/services/authz.js).
  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
  // Token compartilhado com o Apps Script da planilha de roteirização (ver
  // backend/src/controllers/planilhaImport.controller.js) — esse endpoint
  // fica FORA do requireAuth (routes/index.js), porque quem chama não é um
  // usuário logado no Kronos, então se autentica com esse token no lugar.
  planilhaImportToken: process.env.PLANILHA_IMPORT_TOKEN || "",
};
