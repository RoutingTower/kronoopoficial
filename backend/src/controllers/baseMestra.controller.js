const firestoreService = require("../services/firestoreService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "baseMestra";

async function listBaseMestra(req, res) {
  const { analistaId } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
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
  const entry = await firestoreService.create(COLLECTION, {
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
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaId)]);
  if (!caller) return false;
  return caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
}

async function updateBaseMestra(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar a base mestra da sua equipe." });
  }

  const patch = {};
  for (const key of ["operacao", "ciclo", "horaInicio", "horaFim", "titular", "dataInicio", "dataFim", "dias"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await firestoreService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteBaseMestra(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar a base mestra da sua equipe." });
  }
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listBaseMestra, createBaseMestra, updateBaseMestra, deleteBaseMestra };
