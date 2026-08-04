const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "plantoes";

async function listPlantoes(req, res) {
  const { supervisorAusenteId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (supervisorAusenteId) rows = rows.filter((p) => p.supervisorAusenteId === supervisorAusenteId);
  res.json(rows);
}

// Supervisor só declara plantão em nome de si mesmo (espelha
// frontend/js/events.js, "Eventos" → "Definir plantão na minha ausência").
async function createPlantao(req, res) {
  const { supervisorAusenteId, data, coberturaRole, coberturaNome } = req.body;
  if (!supervisorAusenteId || !data || !coberturaRole || !coberturaNome) {
    return res.status(400).json({
      error: "bad_request",
      message: "supervisorAusenteId, data, coberturaRole e coberturaNome são obrigatórios",
    });
  }
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorAusenteId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode declarar plantão em seu próprio nome." });
  }
  const plantao = await supabaseService.create(COLLECTION, {
    supervisorAusenteId,
    data,
    coberturaRole,
    coberturaNome,
  });
  res.status(201).json(plantao);
}

async function assertDonoDoPlantao(req, existing) {
  const caller = await getCaller(req);
  return !!caller && (caller.isAdmin || (caller.role === "supervisor" && existing.supervisorAusenteId === caller.id));
}

async function updatePlantao(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDoPlantao(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar plantão em seu próprio nome." });
  }
  const patch = {};
  for (const key of ["data", "coberturaRole", "coberturaNome"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deletePlantao(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDoPlantao(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir plantão em seu próprio nome." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listPlantoes, createPlantao, updatePlantao, deletePlantao };
