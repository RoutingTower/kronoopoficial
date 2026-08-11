const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "formularios";
const TIPOS = ["domingo_voluntariado", "folga_escolha", "reconhecimento_mensal", "ferias_solicitacao"];

// Status calculado (nunca guardado) — mesma lógica do frontend
// (formularioStatus, utils.js). Pausado manualmente vence a janela; fora
// disso é só relógio.
function statusFormulario(f) {
  if (!f.ativoManual) return "pausado";
  const agora = Date.now();
  if (agora < f.abertura) return "agendado";
  if (agora > f.fechamento) return "encerrado";
  return "aberto";
}

// Analista só vê formulários do próprio supervisor; supervisor só vê (e só
// mexe) nos seus — mesma regra em todo o arquivo (espelha ausencias/
// suplencias.controller.js).
async function listFormularios(req, res) {
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  let rows = await supabaseService.listAll(COLLECTION);
  if (caller.isAdmin) {
    if (req.query.supervisorId) rows = rows.filter((f) => f.supervisorId === req.query.supervisorId);
  } else if (caller.role === "supervisor") {
    rows = rows.filter((f) => f.supervisorId === caller.id);
  } else {
    rows = rows.filter((f) => f.supervisorId === caller.supervisorId);
  }
  res.json(rows);
}

async function createFormulario(req, res) {
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && caller.role !== "supervisor")) {
    return res.status(403).json({ error: "forbidden", message: "Só supervisores podem criar formulários." });
  }
  const { tipo, titulo, descricao, abertura, fechamento, periodoInicio, periodoFim, limitePorDia } = req.body;
  if (!tipo || !TIPOS.includes(tipo)) {
    return res.status(400).json({ error: "bad_request", message: "tipo inválido." });
  }
  if (!abertura || !fechamento) {
    return res.status(400).json({ error: "bad_request", message: "abertura e fechamento são obrigatórios." });
  }
  const supervisorId = caller.isAdmin ? req.body.supervisorId || caller.id : caller.id;
  const entry = await supabaseService.create(COLLECTION, {
    supervisorId,
    tipo,
    titulo: titulo || "",
    descricao: descricao || "",
    abertura: Number(abertura),
    fechamento: Number(fechamento),
    ativoManual: true,
    periodoInicio: periodoInicio || null,
    periodoFim: periodoFim || null,
    limitePorDia: tipo === "folga_escolha" ? Number(limitePorDia) || 1 : null,
    criadoEm: Date.now(),
  });
  res.status(201).json(entry);
}

async function assertDonoFormulario(caller, existing) {
  return !!caller && (caller.isAdmin || (caller.role === "supervisor" && existing.supervisorId === caller.id));
}

async function updateFormulario(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!(await assertDonoFormulario(caller, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar formulários da sua própria equipe." });
  }
  const patch = {};
  for (const key of ["titulo", "descricao", "abertura", "fechamento", "ativoManual", "periodoInicio", "periodoFim", "limitePorDia"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteFormulario(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!(await assertDonoFormulario(caller, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar formulários da sua própria equipe." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listFormularios, createFormulario, updateFormulario, deleteFormulario, statusFormulario, TIPOS };
