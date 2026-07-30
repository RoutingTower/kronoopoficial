// Envia as variáveis de ambiente do backend (Firebase + CORS) direto pra API
// do Render — em vez de colar cada valor manualmente no painel do Render,
// que é a causa mais provável do bug "401 na verificação do token" descrito
// no README (colar um PEM de várias linhas numa caixa de texto do navegador
// corrompe fim de linha/espaços com facilidade). Rodar (a partir de
// backend/):
//   $env:RENDER_API_KEY="rnd_...."; $env:RENDER_SERVICE_ID="srv-...."
//   $env:ENV_FILE=".env.production"; node scripts/sync-render-env.js
//
// RENDER_API_KEY: Render Dashboard → foto de perfil → Account Settings →
// API Keys → Create API Key.
// RENDER_SERVICE_ID: painel do serviço no Render, começa com "srv-" (também
// aparece na URL do serviço, ou via GET https://api.render.com/v1/services).
//
// ENV_FILE aponta pro arquivo local com os valores corretos (padrão
// ".env.production", já que é isso que deve estar no Render — ver
// docs/COMO-PUBLICAR.md → Passo 5). As demais variáveis já configuradas no
// serviço Render (ex.: PORT, se houver) são preservadas — este script só
// sobrescreve as chaves que ele conhece.

process.env.ENV_FILE = process.env.ENV_FILE || ".env.production";
const { firebase: firebaseConfig } = require("../src/config/env");

const RENDER_API = "https://api.render.com/v1";
const MANAGED_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "ALLOWED_ORIGINS"];

function buildManagedValues() {
  if (!firebaseConfig.projectId || !firebaseConfig.clientEmail || !firebaseConfig.privateKey) {
    throw new Error(
      `Faltam credenciais do Firebase em ${process.env.ENV_FILE} — confira FIREBASE_PROJECT_ID, ` +
        "FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY antes de sincronizar com o Render."
    );
  }
  const values = {
    FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    FIREBASE_CLIENT_EMAIL: firebaseConfig.clientEmail,
    // config/env.js já converteu "\n" -> quebra de linha real pro processo
    // local usar; aqui fazemos o caminho inverso pra guardar no Render como
    // uma única linha com "\n" literal — mesmo formato que o
    // backend/.env.yaml (Cloud Run) já usa e que config/env.js sabe ler de
    // volta corretamente em produção.
    FIREBASE_PRIVATE_KEY: firebaseConfig.privateKey.replace(/\n/g, "\\n"),
  };
  if (process.env.ALLOWED_ORIGINS) values.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
  return values;
}

async function renderRequest(path, options = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Render API respondeu ${res.status} em ${path}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    throw new Error(
      "Defina RENDER_API_KEY e RENDER_SERVICE_ID antes de rodar este script — ver o comentário no topo do arquivo."
    );
  }

  const managedValues = buildManagedValues();

  console.log(`Lendo variáveis atuais do serviço ${serviceId} no Render...`);
  const current = await renderRequest(`/services/${serviceId}/env-vars`);
  const currentByKey = new Map(current.map((item) => [item.envVar.key, item.envVar.value]));

  for (const key of MANAGED_KEYS) {
    if (key in managedValues) currentByKey.set(key, managedValues[key]);
  }

  const merged = Array.from(currentByKey, ([key, value]) => ({ key, value }));

  console.log(`Enviando ${Object.keys(managedValues).length} variável(is) gerenciada(s): ${Object.keys(managedValues).join(", ")}`);
  await renderRequest(`/services/${serviceId}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(merged),
  });

  console.log(
    "Pronto — variáveis atualizadas no Render. O serviço redeploya sozinho em resposta " +
      "(igual a uma alteração feita pelo painel). Acompanhe em Render → seu serviço → Events."
  );
}

main().catch((err) => {
  console.error("Falha ao sincronizar variáveis com o Render:", err.message);
  process.exit(1);
});
