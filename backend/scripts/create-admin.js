// Cria (ou promove) uma conta admin: coordenador + isAdmin:true, que ignora
// todas as checagens de "só a própria equipe" no backend (ver
// src/services/authz.js). Não existe endpoint na API pra isso de propósito
// — só dá pra criar um admin rodando este script direto, com acesso à
// service account.
//
// Uso (a partir de backend/):
//   node scripts/create-admin.js <email> <senha> "<Nome completo>"
//
// Pra rodar contra produção em vez de dev, aponte ENV_FILE antes:
//   $env:ENV_FILE=".env.production"; node scripts/create-admin.js ...

const firestoreService = require("../src/services/firestoreService");

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password || !name) {
    console.error('Uso: node scripts/create-admin.js <email> <senha> "<Nome completo>"');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("A senha precisa ter ao menos 6 caracteres.");
    process.exit(1);
  }

  const auth = firestoreService.getAuth();
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name });
    console.log(`Conta já existia no Firebase Auth (uid ${uid}) — senha/nome atualizados.`);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({ email, password, displayName: name });
    uid = created.uid;
    console.log(`Conta criada no Firebase Auth (uid ${uid}).`);
  }

  await firestoreService.replace("users", uid, {
    role: "coordenador",
    name,
    email,
    active: true,
    isAdmin: true,
    coordenadorId: null,
    navConfig: null,
  });
  console.log(`Documento users/${uid} gravado com isAdmin:true.`);
  console.log("\nPronto — login com essas credenciais entra sem as restrições de equipe.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao criar admin:", err);
    process.exit(1);
  });
