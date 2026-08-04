const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "ausencias";

async function listAusencias(req, res) {
  const { analistaId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (analistaId) rows = rows.filter((a) => a.analistaId === analistaId);
  res.json(rows);
}

// Mesma regra em todo o arquivo: só o supervisor do analista mexe na
// folga/férias dele (espelha frontend/js/events.js, "Cobertura"/sugestão).
async function createAusencia(req, res) {
  const { analistaId, baseMestraId, operacao, ciclo, horaInicio, horaFim, data, tipo, suplenteId, suplenteNome } = req.body;
  if (!analistaId || !baseMestraId || !operacao || !data || !tipo) {
    return res.status(400).json({
      error: "bad_request",
      message: "analistaId, baseMestraId, operacao, data e tipo são obrigatórios",
    });
  }
  if (tipo !== "folga" && tipo !== "ferias") {
    return res.status(400).json({ error: "bad_request", message: "tipo deve ser 'folga' ou 'ferias'" });
  }
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(analistaId)]);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }
  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    baseMestraId,
    operacao,
    ciclo: ciclo || "",
    horaInicio: horaInicio || "",
    horaFim: horaFim || "",
    data,
    tipo,
    suplenteId: suplenteId || null,
    suplenteNome: suplenteNome || "",
  });
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaId)]);
  if (!caller) return false;
  return caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
}

async function updateAusencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }

  const patch = {};
  for (const key of ["data", "tipo", "suplenteId", "suplenteNome"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteAusencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listAusencias, createAusencia, updateAusencia, deleteAusencia };
