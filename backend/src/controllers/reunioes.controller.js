const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "reunioes";

async function listReunioes(req, res) {
  const { supervisorId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (supervisorId) rows = rows.filter((r) => r.supervisorId === supervisorId);
  res.json(rows);
}

// Só supervisor agenda reunião, e só em nome da própria equipe (espelha
// frontend/js/events.js, "Eventos").
async function createReuniao(req, res) {
  const { tipo, titulo, data, hora, analistaIds, supervisorId, criadoPor, link } = req.body;
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
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode agendar reuniões da sua própria equipe." });
  }
  const reuniao = await supabaseService.create(COLLECTION, {
    tipo,
    titulo: titulo || "Reunião",
    data,
    hora,
    analistaIds: Array.isArray(analistaIds) ? analistaIds : [],
    supervisorId,
    criadoPor: criadoPor || "",
    link: link || "",
  });
  res.status(201).json(reuniao);
}

// Mesma regra do create: só o supervisor dono (ou admin).
async function assertDonoDaEquipe(req, existing) {
  const caller = await getCaller(req);
  return !!caller && (caller.isAdmin || (caller.role === "supervisor" && existing.supervisorId === caller.id));
}

async function updateReuniao(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar reuniões da sua própria equipe." });
  }

  const patch = {};
  for (const key of ["tipo", "titulo", "data", "hora", "analistaIds", "link"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteReuniao(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar reuniões da sua própria equipe." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listReunioes, createReuniao, updateReuniao, deleteReuniao };
