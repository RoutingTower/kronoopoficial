const firestoreService = require("../services/firestoreService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "suplencias";

async function listSuplencias(req, res) {
  const { analistaOriginalId } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
  if (analistaOriginalId) rows = rows.filter((s) => s.analistaOriginalId === analistaOriginalId);
  res.json(rows);
}

// Mesma regra em todo o arquivo: só o supervisor do analista original pode
// gerenciar a cobertura avulsa (espelha frontend/js/events.js, "Cobertura").
async function createSuplencia(req, res) {
  const { operacao, ciclo, horaInicio, horaFim, suplente, dataCobertura, analistaOriginalId } = req.body;
  if (!operacao || !horaInicio || !horaFim || !suplente || !dataCobertura || !analistaOriginalId) {
    return res.status(400).json({
      error: "bad_request",
      message: "operacao, horaInicio, horaFim, suplente, dataCobertura e analistaOriginalId são obrigatórios",
    });
  }
  const caller = await getCaller(req);
  const supervisorId = await supervisorIdDoAnalista(analistaOriginalId);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }
  const entry = await firestoreService.create(COLLECTION, {
    operacao,
    ciclo: ciclo || "T3",
    horaInicio,
    horaFim,
    suplente,
    dataCobertura,
    analistaOriginalId,
  });
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const caller = await getCaller(req);
  if (!caller) return false;
  if (caller.isAdmin) return true;
  const supervisorId = await supervisorIdDoAnalista(existing.analistaOriginalId);
  return caller.role === "supervisor" && supervisorId === caller.id;
}

async function updateSuplencia(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }

  const patch = {};
  for (const key of ["operacao", "horaInicio", "horaFim", "suplente", "dataCobertura"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await firestoreService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteSuplencia(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listSuplencias, createSuplencia, updateSuplencia, deleteSuplencia };
