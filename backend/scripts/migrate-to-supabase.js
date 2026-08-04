// Copia os dados do Firestore (fonte) pro Supabase (destino) — passo 6 do
// checklist em docs/MIGRACAO-SUPABASE.md. Só rodar depois de:
//   1. Ter executado backend/scripts/supabase-schema.sql no projeto Supabase.
//   2. Ter preenchido SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env
//      (além de FIREBASE_* já preenchido, que continua sendo a fonte).
//
// Uso (a partir de backend/):
//   node scripts/migrate-to-supabase.js            # migra de verdade
//   node scripts/migrate-to-supabase.js --dry-run   # só lista contagens,
//                                                    # não cria nada
//
// Recria cada usuário no Supabase Auth com senha temporária aleatória —
// Firebase Auth não expõe hash/senha original, não tem como copiar
// (ver docs/MIGRACAO-SUPABASE.md → "Autenticação: recriando os usuários").
// O relatório final lista quem precisa trocar a senha.
//
// Idempotência: NÃO é seguro rodar duas vezes contra o mesmo projeto
// Supabase — cada rodada recria os usuários e insere linhas novas nas
// outras 10 tabelas. Se precisar rodar de novo, zere o projeto Supabase
// primeiro (ou crie um projeto novo).

const crypto = require("crypto");
const firestoreService = require("../src/services/firestoreService");
const supabaseService = require("../src/services/supabaseService");

const DRY_RUN = process.argv.includes("--dry-run");

function tempPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

// "all_ana_<uid>" (lembretes.target, recados.to) — remapeia só o uid depois
// do prefixo; qualquer outro valor é tratado como um uid solto.
function remapUserRef(value, idMapUsers) {
  if (!value) return value;
  if (value.startsWith("all_ana_")) {
    const oldUid = value.slice("all_ana_".length);
    return `all_ana_${idMapUsers[oldUid] || oldUid}`;
  }
  return idMapUsers[value] || value;
}

async function migrateUsers() {
  const oldUsers = await firestoreService.listAll("users");
  const idMapUsers = {};
  const senhasTemporarias = [];

  console.log(`\n== users (${oldUsers.length}) ==`);
  if (DRY_RUN) {
    console.log("(dry-run) pularia recriação no Supabase Auth + gravação da tabela users");
    return { idMapUsers, oldUsers };
  }

  // Passo 1: recria cada conta no Supabase Auth primeiro, pra ter o mapa de
  // ids completo antes de gravar supervisorId/coordenadorId (que apontam
  // pra OUTROS usuários, possivelmente ainda não processados).
  for (const u of oldUsers) {
    const password = tempPassword();
    const created = await supabaseService.getAuth().createUser({
      email: u.email,
      password,
      displayName: u.name,
    });
    idMapUsers[u.id] = created.uid;
    senhasTemporarias.push({ email: u.email, senha: password });
    console.log(`  Auth: ${u.email} -> ${created.uid}`);
  }

  // Passo 2a: grava as 8 linhas em public.users SEM supervisorId/
  // coordenadorId ainda — como as linhas são gravadas uma a uma, uma
  // referência pra um colega que ainda não foi inserido violaria a FK.
  for (const u of oldUsers) {
    await supabaseService.replace("users", idMapUsers[u.id], {
      role: u.role,
      name: u.name,
      email: u.email,
      active: u.active !== false,
      isAdmin: u.isAdmin === true,
      supervisorId: null,
      coordenadorId: null,
      jornada: u.jornada || null,
      navConfig: u.navConfig || null,
    });
  }
  // Passo 2b: agora que todas as linhas existem, preenche
  // supervisorId/coordenadorId (update, não insert — a FK já resolve
  // porque o alvo referenciado já está na tabela).
  for (const u of oldUsers) {
    if (!u.supervisorId && !u.coordenadorId) continue;
    await supabaseService.update("users", idMapUsers[u.id], {
      supervisorId: u.supervisorId ? idMapUsers[u.supervisorId] || null : null,
      coordenadorId: u.coordenadorId ? idMapUsers[u.coordenadorId] || null : null,
    });
  }
  console.log(`  ${oldUsers.length} linhas gravadas em public.users`);

  console.log("\n== Senhas temporárias (avisar cada usuário / disparar reset) ==");
  for (const { email, senha } of senhasTemporarias) console.log(`  ${email}: ${senha}`);

  return { idMapUsers, oldUsers };
}

async function migrateBaseMestra(idMapUsers) {
  const rows = await firestoreService.listAll("baseMestra");
  const idMapBaseMestra = {};
  console.log(`\n== baseMestra (${rows.length}) ==`);
  if (DRY_RUN) return idMapBaseMestra;

  for (const r of rows) {
    const created = await supabaseService.create("baseMestra", {
      analistaId: idMapUsers[r.analistaId] || null,
      operacao: r.operacao,
      ciclo: r.ciclo || "T3",
      horaInicio: r.horaInicio,
      horaFim: r.horaFim,
      titular: r.titular || "",
      dataInicio: r.dataInicio,
      dataFim: r.dataFim,
      dias: Array.isArray(r.dias) ? r.dias : [],
    });
    idMapBaseMestra[r.id] = created.id;
  }
  console.log(`  ${rows.length} linhas gravadas em public.base_mestra`);
  return idMapBaseMestra;
}

async function migrateAusencias(idMapUsers, idMapBaseMestra) {
  const rows = await firestoreService.listAll("ausencias");
  console.log(`\n== ausencias (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("ausencias", {
      analistaId: idMapUsers[r.analistaId] || null,
      baseMestraId: idMapBaseMestra[r.baseMestraId] || null,
      operacao: r.operacao,
      ciclo: r.ciclo || "",
      horaInicio: r.horaInicio || "",
      horaFim: r.horaFim || "",
      data: r.data,
      tipo: r.tipo,
      suplenteId: r.suplenteId ? idMapUsers[r.suplenteId] || null : null,
      suplenteNome: r.suplenteNome || "",
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.ausencias`);
}

async function migrateFeedbacks(idMapUsers) {
  const rows = await firestoreService.listAll("feedbacks");
  console.log(`\n== feedbacks (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("feedbacks", {
      analistaId: idMapUsers[r.analistaId] || null,
      analistaNome: r.analistaNome,
      texto: r.texto,
      ts: r.ts,
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.feedbacks`);
}

async function migrateLembretes(idMapUsers) {
  const rows = await firestoreService.listAll("lembretes");
  console.log(`\n== lembretes (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("lembretes", {
      origem: r.origem,
      texto: r.texto,
      observacoes: r.observacoes || "",
      analistaId: r.analistaId ? idMapUsers[r.analistaId] || null : null,
      target: remapUserRef(r.target, idMapUsers),
      criadoPor: r.criadoPor || "",
      done: !!r.done,
      ts: r.ts,
      data: r.data,
      hora: r.hora || "",
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.lembretes`);
}

async function migratePlantoes(idMapUsers) {
  const rows = await firestoreService.listAll("plantoes");
  console.log(`\n== plantoes (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("plantoes", {
      supervisorAusenteId: idMapUsers[r.supervisorAusenteId] || null,
      data: r.data,
      coberturaRole: r.coberturaRole,
      coberturaNome: r.coberturaNome,
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.plantoes`);
}

async function migrateRaioX(idMapUsers) {
  const rows = await firestoreService.listAll("raioX");
  console.log(`\n== raioX (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("raioX", {
      analistaId: idMapUsers[r.analistaId] || null,
      operacao: r.operacao,
      hora: r.hora,
      data: r.data,
      estrelas: r.estrelas,
      observacao: r.observacao,
      ts: r.ts,
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.raio_x`);
}

async function migrateRecados(idMapUsers) {
  const rows = await firestoreService.listAll("recados");
  console.log(`\n== recados (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("recados", {
      from: r.from,
      to: remapUserRef(r.to, idMapUsers),
      titulo: r.titulo || "",
      texto: r.texto,
      observacoes: r.observacoes || "",
      ts: r.ts,
      lidoPor: Array.isArray(r.lidoPor) ? r.lidoPor.map((uid) => idMapUsers[uid] || uid) : [],
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.recados`);
}

async function migrateReunioes(idMapUsers) {
  const rows = await firestoreService.listAll("reunioes");
  console.log(`\n== reunioes (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("reunioes", {
      tipo: r.tipo,
      titulo: r.titulo || "Reunião",
      data: r.data,
      hora: r.hora,
      analistaIds: Array.isArray(r.analistaIds) ? r.analistaIds.map((uid) => idMapUsers[uid] || uid) : [],
      supervisorId: idMapUsers[r.supervisorId] || null,
      criadoPor: r.criadoPor || "",
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.reunioes`);
}

async function migrateSprs(idMapUsers) {
  const rows = await firestoreService.listAll("sprs");
  console.log(`\n== sprs (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("sprs", {
      supervisorId: idMapUsers[r.supervisorId] || null,
      operacao: r.operacao,
      ciclo: r.ciclo,
      spr: r.spr,
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.sprs`);
}

async function migrateSuplencias(idMapUsers) {
  const rows = await firestoreService.listAll("suplencias");
  console.log(`\n== suplencias (${rows.length}) ==`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await supabaseService.create("suplencias", {
      operacao: r.operacao,
      ciclo: r.ciclo || "T3",
      horaInicio: r.horaInicio,
      horaFim: r.horaFim,
      suplente: r.suplente,
      dataCobertura: r.dataCobertura,
      analistaOriginalId: idMapUsers[r.analistaOriginalId] || null,
    });
  }
  console.log(`  ${rows.length} linhas gravadas em public.suplencias`);
}

async function main() {
  if (DRY_RUN) console.log("*** DRY RUN — nada será escrito no Supabase ***");

  const { idMapUsers } = await migrateUsers();
  const idMapBaseMestra = await migrateBaseMestra(idMapUsers);
  await migrateAusencias(idMapUsers, idMapBaseMestra);
  await migrateFeedbacks(idMapUsers);
  await migrateLembretes(idMapUsers);
  await migratePlantoes(idMapUsers);
  await migrateRaioX(idMapUsers);
  await migrateRecados(idMapUsers);
  await migrateReunioes(idMapUsers);
  await migrateSprs(idMapUsers);
  await migrateSuplencias(idMapUsers);

  console.log("\nMigração concluída.");
  if (!DRY_RUN) {
    console.log(
      "Próximo passo: testar login + os 11 recursos contra este projeto Supabase antes de trocar as env vars em produção (ver checklist em docs/MIGRACAO-SUPABASE.md)."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na migração:", err);
    process.exit(1);
  });
