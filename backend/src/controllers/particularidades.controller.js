const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "particularidades";

async function listParticularidades(req, res) {
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows);
}

// Uma nota por Operação+Supervisor (upsert) — pensada pra passagem de
// bastão entre turnos, então "qualquer analista pode ver e editar" (ver
// pedido original): qualquer um da equipe (analista, o próprio supervisor,
// ou admin) pode salvar. Sem histórico de versões de propósito — é uma
// nota viva compartilhada, não um log; quem salvar por último vence.
async function upsertParticularidade(req, res) {
  const { supervisorId, operacao, texto } = req.body;
  if (!supervisorId || !operacao) {
    return res.status(400).json({ error: "bad_request", message: "supervisorId e operacao são obrigatórios" });
  }
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  const souDaEquipe = caller.isAdmin
    || (caller.role === "supervisor" && caller.id === supervisorId)
    || (caller.role === "analista" && caller.supervisorId === supervisorId);
  if (!souDaEquipe) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode editar particularidades de operações da sua equipe." });
  }

  const existentes = await supabaseService.listAll(COLLECTION);
  const existente = existentes.find((p) => p.supervisorId === supervisorId && p.operacao === operacao);
  const dados = {
    supervisorId,
    operacao,
    texto: texto || "",
    atualizadoPor: caller.name || caller.email || "—",
    atualizadoEm: Date.now(),
  };
  const salvo = existente
    ? await supabaseService.update(COLLECTION, existente.id, dados)
    : await supabaseService.create(COLLECTION, dados);
  res.json(salvo);
}

module.exports = { listParticularidades, upsertParticularidade };
