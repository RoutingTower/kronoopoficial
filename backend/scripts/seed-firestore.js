// Popula o Firestore real com um dataset de exemplo, com IDs fixos (em
// vez de aleatórios) para manter as referências entre coleções estáveis
// a cada execução. Roda uma vez (ou quando quiser resetar os dados):
// `node scripts/seed-firestore.js` (a partir de backend/).
//
// Popula as coleções individuais (users, baseMestra, ausencias, suplencias,
// raioX, recados, reunioes, plantoes, lembretes) — cada uma com endpoint
// próprio, é isso que o frontend lê/escreve hoje (ver docs/ARQUITETURA.md).
//
// Os usuários também ganham uma conta real no Firebase Auth (mesmo uid do
// documento Firestore, senha "demo123") — o campo "pass" abaixo existe só
// para isso e nunca é gravado no Firestore (login passou a ser via Firebase
// Auth, não mais por comparação de string — ver docs/ROADMAP.md, item 3).

const firestoreService = require("../src/services/firestoreService");

async function seed() {
  const today = new Date().toISOString().slice(0, 10);

  const users = [
    { id: "u_ana1", role: "analista", name: "Marina Cordeiro", email: "marina.cordeiro@kronoop.local", pass: "demo123", supervisorId: "u_sup1", active: true, jornada: { dias: ["seg", "ter", "qua", "qui", "sex"], horaInicio: "19:00", horaFim: "01:00" } },
    { id: "u_ana2", role: "analista", name: "Felipe Nogueira", email: "felipe.nogueira@kronoop.local", pass: "demo123", supervisorId: "u_sup1", active: true, jornada: { dias: ["seg", "ter", "qua", "qui", "sex"], horaInicio: "19:00", horaFim: "01:00" } },
    { id: "u_ana3", role: "analista", name: "Bianca Salgado", email: "bianca.salgado@kronoop.local", pass: "demo123", supervisorId: "u_sup1", active: true, jornada: { dias: ["ter", "qua", "qui", "sex", "sab"], horaInicio: "20:00", horaFim: "02:00" } },
    { id: "u_ana4", role: "analista", name: "Rodrigo Peixoto", email: "rodrigo.peixoto@kronoop.local", pass: "demo123", supervisorId: "u_sup2", active: true, jornada: { dias: ["seg", "ter", "qua", "qui", "sex"], horaInicio: "19:00", horaFim: "01:00" } },
    { id: "u_sup1", role: "supervisor", name: "Camila Duarte", email: "camila.duarte@kronoop.local", pass: "demo123", coordenadorId: "u_coord1", active: true },
    { id: "u_sup2", role: "supervisor", name: "Thiago Barros", email: "thiago.barros@kronoop.local", pass: "demo123", coordenadorId: "u_coord1", active: true },
    { id: "u_coord1", role: "coordenador", name: "Renata Feitosa", email: "renata.feitosa@kronoop.local", pass: "demo123", active: true },
  ];

  const baseMestra = [
    { id: "bm1", analistaId: "u_ana1", operacao: "COL-A", ciclo: "T3", horaInicio: "19:00", horaFim: "23:00", titular: "Marina Cordeiro", dataInicio: today, dataFim: "2026-12-31" },
    { id: "bm2", analistaId: "u_ana1", operacao: "ROT-N1", ciclo: "T3", horaInicio: "23:00", horaFim: "01:00", titular: "Marina Cordeiro", dataInicio: today, dataFim: "2026-12-31" },
    { id: "bm3", analistaId: "u_ana2", operacao: "TRI-01", ciclo: "T3", horaInicio: "19:00", horaFim: "22:00", titular: "Felipe Nogueira", dataInicio: today, dataFim: "2026-12-31" },
    { id: "bm4", analistaId: "u_ana3", operacao: "SEP-EXP", ciclo: "T3", horaInicio: "20:00", horaFim: "00:00", titular: "Bianca Salgado", dataInicio: today, dataFim: "2026-12-31" },
    { id: "bm5", analistaId: "u_ana4", operacao: "ROT-N2", ciclo: "T3", horaInicio: "21:00", horaFim: "01:00", titular: "Rodrigo Peixoto", dataInicio: today, dataFim: "2026-12-31" },
  ];

  const ausencias = [
    { id: "af1", analistaId: "u_ana1", baseMestraId: "bm1", operacao: "COL-A", ciclo: "T3", horaInicio: "19:00", horaFim: "23:00", data: today, tipo: "folga", suplenteId: "u_ana2", suplenteNome: "" },
    { id: "af2", analistaId: "u_ana1", baseMestraId: "bm2", operacao: "ROT-N1", ciclo: "T3", horaInicio: "23:00", horaFim: "01:00", data: today, tipo: "folga", suplenteId: "u_ana3", suplenteNome: "" },
  ];

  const suplencias = [
    { id: "sp1", operacao: "COL-B", ciclo: "T3", horaInicio: "19:00", horaFim: "23:00", suplente: "Rodrigo Peixoto", dataCobertura: today, analistaOriginalId: "u_ana4" },
  ];

  const raioX = [
    { id: "rx1", analistaId: "u_ana2", operacao: "TRI-01", hora: "19:00", data: today, estrelas: 3, observacao: "Atraso de 12 min na fila de coleta por excesso de volume na doca 2. Roteirizador foi ajustado manualmente para redistribuir os pacotes represados e a operação foi normalizada até o fim do turno.", ts: Date.now() - 3600e3 },
    { id: "rx2", analistaId: "u_ana3", operacao: "SEP-EXP", hora: "20:00", data: today, estrelas: 5, observacao: "Operação transcorreu dentro do esperado, sem atrasos na separação. Todos os pedidos expedidos dentro do SLA e sem retrabalho na conferência final.", ts: Date.now() - 2600e3 },
  ];

  const recados = [
    { id: "rc1", from: "Camila Duarte (Supervisor)", to: "all_ana_u_sup1", titulo: "", texto: "Atenção: revisão de rota SEP-EXP às 22h hoje, favor confirmar leitura.", observacoes: "", ts: Date.now() - 5400e3, lidoPor: [] },
  ];

  const reunioes = [
    { id: "rn1", tipo: "grupo", titulo: "Alinhamento semanal da operação", data: today, hora: "19:00", analistaIds: [], supervisorId: "u_sup1", criadoPor: "Camila Duarte" },
  ];

  const plantoes = [];
  const lembretes = [];

  console.log("Criando contas no Firebase Auth (uid = id do Firestore)...");
  const auth = firestoreService.getAuth();
  for (const u of users) {
    try {
      await auth.createUser({ uid: u.id, email: u.email, password: u.pass, displayName: u.name });
      console.log(`  ${u.id} (${u.email}): criado`);
    } catch (err) {
      if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
        console.log(`  ${u.id} (${u.email}): já existia, mantido`);
      } else {
        throw err;
      }
    }
  }

  const usersNoPass = users.map(({ pass, ...rest }) => rest);
  const collections = { users: usersNoPass, baseMestra, ausencias, suplencias, raioX, recados, reunioes, plantoes, lembretes };

  console.log("Semeando coleções individuais...");
  for (const [name, docs] of Object.entries(collections)) {
    for (const doc of docs) {
      const { id, ...data } = doc;
      await firestoreService.replace(name, id, data);
    }
    console.log(`  ${name}: ${docs.length} documento(s)`);
  }

  console.log("\nPronto. Todas as coleções foram (re)criadas com os dados de demonstração.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao semear o Firestore:", err);
    process.exit(1);
  });
