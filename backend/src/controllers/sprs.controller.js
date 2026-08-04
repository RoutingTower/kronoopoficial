const firestoreService = require("../services/firestoreService");
const { getCaller } = require("../services/authz");

const COLLECTION = "sprs";

async function listSprs(req, res) {
  const { supervisorId } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
  if (supervisorId) rows = rows.filter((s) => s.supervisorId === supervisorId);
  res.json(rows);
}

// Supervisor só cadastra SPR em nome de si mesmo — espelha
// frontend/js/events.js, "SPR" → "Nova entrada SPR".
async function createSpr(req, res) {
  const { supervisorId, operacao, ciclo, spr } = req.body;
  if (!supervisorId || !operacao || !ciclo || spr === undefined || spr === null || spr === "") {
    return res.status(400).json({
      error: "bad_request",
      message: "supervisorId, operacao, ciclo e spr são obrigatórios",
    });
  }
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode cadastrar SPR em seu próprio nome." });
  }
  const entry = await firestoreService.create(COLLECTION, { supervisorId, operacao, ciclo, spr });
  res.status(201).json(entry);
}

async function assertDonoDoSpr(req, existing) {
  const caller = await getCaller(req);
  return !!caller && (caller.isAdmin || (caller.role === "supervisor" && existing.supervisorId === caller.id));
}

async function updateSpr(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDoSpr(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar SPR do seu próprio cadastro." });
  }
  const patch = {};
  for (const key of ["operacao", "ciclo", "spr"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await firestoreService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteSpr(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDoSpr(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir SPR do seu próprio cadastro." });
  }
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listSprs, createSpr, updateSpr, deleteSpr };
