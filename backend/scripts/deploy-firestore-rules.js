// Publica firestore.rules (raiz do projeto) no projeto Firebase configurado
// em backend/.env, via Firebase Rules API — sem precisar do Firebase CLI
// autenticado interativamente. Rodar: node scripts/deploy-firestore-rules.js
// (a partir de backend/).

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");
const { firebase: firebaseConfig } = require("../src/config/env");

async function main() {
  const rulesPath = path.join(__dirname, "..", "..", "firestore.rules");
  const source = fs.readFileSync(rulesPath, "utf8");

  const auth = new GoogleAuth({
    credentials: {
      client_email: firebaseConfig.clientEmail,
      private_key: firebaseConfig.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const projectId = firebaseConfig.projectId;

  console.log(`Criando ruleset novo em ${projectId}...`);
  const createRes = await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    method: "POST",
    data: {
      source: {
        files: [{ name: "firestore.rules", content: source }],
      },
    },
  });
  const rulesetName = createRes.data.name; // ex.: projects/xxx/rulesets/yyy
  console.log(`  ruleset criado: ${rulesetName}`);

  console.log("Publicando na release cloud.firestore...");
  await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
    method: "PATCH",
    data: {
      release: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName,
      },
    },
  });
  console.log("Pronto — regras publicadas.");
}

main().catch((err) => {
  console.error("Falha ao publicar as regras:", err.response?.data || err.message);
  process.exit(1);
});
