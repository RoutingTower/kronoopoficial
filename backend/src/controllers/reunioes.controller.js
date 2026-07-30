const firestoreService = require("../services/firestoreService");
const { getCaller } = require("../services/authz");

const COLLECTION = "reunioes";

async function listReunioes(req, res) {
  const { supervisorId } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
  if (supervisorId) rows = rows.filter((r) => r.supervisorId === supervisorId);
  res.json(rows);
}

// Só supervisor agenda reunião, e só em nome da própria equipe (espelha
// frontend/js/events.js, "Eventos"). Não há UI de editar/excluir reunião.
async function createReuniao(req, res) {
  const { tipo, titulo, data, hora, analistaIds, supervisorId, criadoPor } = req.body;
  if (!tipo || !data || !hora || !supervisorId) {
    return res.status(400).json({
      error: "bad_request",
      message: "tipo, data, hora e supervisorId são obrigatórios",
    });
  }
  if (tipo !== "grupo" && tipo !== "individual") {
    return res.status(400).json({ error: "bad_request", message: "tipo deve ser 'grupo' ou 'individual'" });
  }
  const caller = await getCaller(req);
  if (!caller || caller.role !== "supervisor" || supervisorId !== caller.id) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode agendar reuniões da sua própria equipe." });
  }
  const reuniao = await firestoreService.create(COLLECTION, {
    tipo,
    titulo: titulo || "Reunião",
    data,
    hora,
    analistaIds: Array.isArray(analistaIds) ? analistaIds : [],
    supervisorId,
    criadoPor: criadoPor || "",
  });
  res.status(201).json(reuniao);
}

async function updateReuniao(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const patch = {};
  for (const key of ["tipo", "titulo", "data", "hora", "analistaIds"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await firestoreService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteReuniao(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listReunioes, createReuniao, updateReuniao, deleteReuniao };
