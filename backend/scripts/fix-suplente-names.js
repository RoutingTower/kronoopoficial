// Corrige registros de Cobertura (suplencias) cujo campo "suplente" (nome
// digitado livremente na importação em massa, sem vínculo de id) tem
// diferença de acento, caixa ou pontuação em relação ao nome cadastrado do
// analista — isso fazia a cobertura sumir da agenda de quem cobriu de
// verdade (Programação, Métricas e Ocorrências comparam esse campo por
// igualdade exata com o nome do analista). A importação em massa já foi
// corrigida (ver findAnalistaByName em frontend/js/utils.js); este script
// só normaliza o que já está gravado no Firestore. Só corrige automático
// quando o nome bate com EXATAMENTE UM analista do mesmo time (mesmo
// supervisor do titular coberto) depois de normalizado — qualquer coisa
// ambígua ou sem nenhum candidato fica de fora, listada separadamente pra
// revisão manual. Rodar a partir de backend/:
//   node scripts/fix-suplente-names.js                           (simula, projeto de dev)
//   ENV_FILE=.env.production node scripts/fix-suplente-names.js          (simula, produção)
//   ENV_FILE=.env.production node scripts/fix-suplente-names.js --apply  (aplica de fato)

const firestoreService = require("../src/services/firestoreService");

function normalizarNome(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?'"´`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function run() {
  const apply = process.argv.includes("--apply");
  const [users, suplencias] = await Promise.all([
    firestoreService.listAll("users"),
    firestoreService.listAll("suplencias"),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const fixes = [];
  const semResolucao = [];

  for (const s of suplencias) {
    if (!s.suplente || !s.analistaOriginalId) continue;
    const titular = usersById.get(s.analistaOriginalId);
    if (!titular) continue; // referência quebrada — fora do escopo deste script

    // Escopo: só analistas do MESMO supervisor do titular coberto, pra não
    // casar com um nome parecido de outro time.
    const candidatos = users.filter((u) => u.role === "analista" && u.supervisorId === titular.supervisorId);
    const jaBate = candidatos.some((c) => c.name === s.suplente);
    if (jaBate) continue; // já está com o nome canônico, nada a fazer

    const alvoNorm = normalizarNome(s.suplente);
    const matches = candidatos.filter((c) => normalizarNome(c.name) === alvoNorm);
    if (matches.length === 1) {
      fixes.push({
        id: s.id,
        label: `${s.operacao} · ${s.dataCobertura}`,
        de: s.suplente,
        para: matches[0].name,
        patch: { suplente: matches[0].name },
      });
    } else {
      semResolucao.push({
        id: s.id,
        label: `${s.operacao} · ${s.dataCobertura}`,
        suplente: s.suplente,
        motivo: matches.length === 0
          ? "nenhum analista do time bate, nem aproximado"
          : `${matches.length} analistas do time batem com esse nome normalizado — ambíguo`,
      });
    }
  }

  if (fixes.length === 0 && semResolucao.length === 0) {
    console.log("Nenhuma cobertura com nome de suplente divergente encontrada.");
    return;
  }

  if (fixes.length > 0) {
    console.log(`\n${fixes.length} cobertura(s) com nome corrigível automaticamente:`);
    for (const f of fixes) console.log(`- ${f.label} (${f.id}): "${f.de}" -> "${f.para}"`);
  }
  if (semResolucao.length > 0) {
    console.log(`\n${semResolucao.length} cobertura(s) SEM resolução automática (precisam de revisão manual):`);
    for (const f of semResolucao) console.log(`- ${f.label} (${f.id}): "${f.suplente}" — ${f.motivo}`);
  }

  if (!apply) {
    console.log("\nModo simulação — nada foi alterado. Rode com --apply para gravar no Firestore.");
    return;
  }

  for (const f of fixes) {
    await firestoreService.update("suplencias", f.id, f.patch);
  }
  console.log(`\n${fixes.length} registro(s) atualizado(s) no Firestore.`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
