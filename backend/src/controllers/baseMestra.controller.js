const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");
const { notificar } = require("../services/notificar");

const COLLECTION = "baseMestra";

async function listBaseMestra(req, res) {
  const { analistaId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (analistaId) rows = rows.filter((b) => b.analistaId === analistaId);
  res.json(rows);
}

// Só o supervisor do analista pode criar/editar/excluir a base mestra dele
// — mesma regra em todo o arquivo (espelha frontend/js/events.js, "Operações Fixas").
async function createBaseMestra(req, res) {
  const { analistaId, operacao, ciclo, horaInicio, horaFim, titular, dataInicio, dataFim, dias } = req.body;
  if (!analistaId || !operacao || !horaInicio || !horaFim || !dataInicio || !dataFim) {
    return res.status(400).json({
      error: "bad_request",
      message: "analistaId, operacao, horaInicio, horaFim, dataInicio e dataFim são obrigatórios",
    });
  }
  // As duas leituras são independentes — paralelizar corta um round-trip
  // ao Firestore fora do caminho crítico de toda escrita deste recurso.
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(analistaId)]);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar a base mestra da sua equipe." });
  }
  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    operacao,
    ciclo: ciclo || "T3",
    horaInicio,
    horaFim,
    titular: titular || "",
    dataInicio,
    dataFim,
    // Array vazio/ausente = roda todo dia (compatível com registros
    // criados antes desse campo existir) — ver bmRodaNoDia() no frontend.
    dias: Array.isArray(dias) ? dias : [],
  });
  await notificar(analistaId, "agenda", `Nova operação adicionada à sua agenda: ${operacao} (${horaInicio}–${horaFim}).`);
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaId)]);
  if (!caller) return false;
  return caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
}

async function updateBaseMestra(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar a base mestra da sua equipe." });
  }

  // Trocar o titular (analistaId) é diferente de editar horário/ciclo: o
  // novo dono também precisa ser da mesma equipe do supervisor, senão
  // ele conseguiria "empurrar" uma operação pra fora do próprio time —
  // mesma checagem de createBaseMestra, só que aplicada ao NOVO analistaId.
  if (req.body.analistaId !== undefined && req.body.analistaId !== existing.analistaId) {
    const novoSupervisorId = await supervisorIdDoAnalista(req.body.analistaId);
    if (!caller?.isAdmin && (caller?.role !== "supervisor" || novoSupervisorId !== caller.id)) {
      return res.status(403).json({ error: "forbidden", message: "O novo titular também precisa ser da sua equipe." });
    }
  }

  const patch = {};
  for (const key of ["analistaId", "operacao", "ciclo", "horaInicio", "horaFim", "titular", "dataInicio", "dataFim", "dias"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  if (patch.analistaId && patch.analistaId !== existing.analistaId) {
    await notificar(existing.analistaId, "agenda", `A operação ${existing.operacao} (${existing.horaInicio}–${existing.horaFim}) saiu da sua agenda — passou para outro titular.`);
    await notificar(updated.analistaId, "agenda", `Uma operação fixa foi transferida para você: ${updated.operacao} (${updated.horaInicio}–${updated.horaFim}).`);

    // Cobertura avulsa (suplencias) não tem FK pra base_mestra — foi lançada
    // pro antigo titular (analistaOriginalId) casando por operacao/ciclo/
    // horario. Trocado o titular, as coberturas FUTURAS que ainda apontam
    // pro antigo titular ficam órfãs (ele não é mais dono da operação) —
    // limpa daqui pra frente; datas passadas ficam como registro histórico
    // do que realmente aconteceu.
    const hoje = new Date().toISOString().slice(0, 10);
    const todasSuplencias = await supabaseService.listAll("suplencias");
    const orfas = todasSuplencias.filter(
      (s) =>
        s.analistaOriginalId === existing.analistaId &&
        s.operacao === existing.operacao &&
        s.ciclo === existing.ciclo &&
        s.horaInicio === existing.horaInicio &&
        s.horaFim === existing.horaFim &&
        s.dataCobertura >= hoje
    );
    await Promise.all(orfas.map((s) => supabaseService.remove("suplencias", s.id)));
  } else {
    await notificar(existing.analistaId, "agenda", `Uma operação da sua agenda foi alterada: ${updated.operacao} (${updated.horaInicio}–${updated.horaFim}).`);
  }
  res.json(updated);
}

async function deleteBaseMestra(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar a base mestra da sua equipe." });
  }
  // ausencias.base_mestra_id tem FK pra essa tabela (sem cascade) — apagar
  // a operação sem antes apagar as ausências dela batia em
  // "violates foreign key constraint ausencias_base_mestra_id_fkey" e
  // travava a exclusão. Cada ausência aqui é uma folga/cobertura
  // registrada especificamente pra ESSA operação; sem ela deixando de
  // existir na carteira, esses registros não têm mais o que representar.
  const ausenciasLigadas = await supabaseService.listWhere("ausencias", [["baseMestraId", "==", req.params.id]]);
  for (const aus of ausenciasLigadas) {
    await supabaseService.remove("ausencias", aus.id);
    if (aus.suplenteId) {
      await notificar(aus.suplenteId, "agenda", `A cobertura que você faria em ${existing.operacao} (${existing.horaInicio}–${existing.horaFim}) foi cancelada — a operação saiu da carteira.`);
    }
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  await notificar(existing.analistaId, "agenda", `Uma operação foi removida da sua agenda: ${existing.operacao} (${existing.horaInicio}–${existing.horaFim}).`);
  res.status(204).send();
}

module.exports = { listBaseMestra, createBaseMestra, updateBaseMestra, deleteBaseMestra };
