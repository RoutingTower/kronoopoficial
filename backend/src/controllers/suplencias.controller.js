const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "suplencias";

async function listSuplencias(req, res) {
  const { analistaOriginalId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (analistaOriginalId) rows = rows.filter((s) => s.analistaOriginalId === analistaOriginalId);
  res.json(rows);
}

// Mesma regra em todo o arquivo: só o supervisor do analista original pode
// gerenciar a cobertura avulsa (espelha frontend/js/events.js, "Cobertura").
async function createSuplencia(req, res) {
  const { operacao, ciclo, horaInicio, horaFim, suplente, dataCobertura, analistaOriginalId, tipo } = req.body;
  if (!operacao || !horaInicio || !horaFim || !suplente || !dataCobertura || !analistaOriginalId) {
    return res.status(400).json({
      error: "bad_request",
      message: "operacao, horaInicio, horaFim, suplente, dataCobertura e analistaOriginalId são obrigatórios",
    });
  }
  if (tipo !== undefined && tipo !== "folga" && tipo !== "ferias") {
    return res.status(400).json({ error: "bad_request", message: "tipo deve ser 'folga' ou 'ferias'" });
  }
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(analistaOriginalId)]);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }
  const entry = await supabaseService.create(COLLECTION, {
    operacao,
    ciclo: ciclo || "T3",
    horaInicio,
    horaFim,
    suplente,
    dataCobertura,
    analistaOriginalId,
    // Cobertura avulsa não tem "titular fixo" pra falar de férias vs folga
    // separado (não existe ausência ligada à Base Mestra aqui) — por
    // padrão trata como folga, igual sempre foi; "férias" é uma escolha
    // explícita no botão/edição.
    tipo: tipo || "folga",
  });
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaOriginalId)]);
  if (!caller) return false;
  return caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
}

async function updateSuplencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }

  if (req.body.tipo !== undefined && req.body.tipo !== "folga" && req.body.tipo !== "ferias") {
    return res.status(400).json({ error: "bad_request", message: "tipo deve ser 'folga' ou 'ferias'" });
  }
  const patch = {};
  for (const key of ["operacao", "ciclo", "horaInicio", "horaFim", "suplente", "dataCobertura", "tipo"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteSuplencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar coberturas da sua equipe." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listSuplencias, createSuplencia, updateSuplencia, deleteSuplencia };
