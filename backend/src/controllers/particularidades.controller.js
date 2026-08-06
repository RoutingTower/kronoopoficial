const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");
const { sanitizeParticularidadeHtml } = require("../services/sanitizeHtml");

const COLLECTION = "particularidades";

async function listParticularidades(req, res) {
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows);
}

// Uma nota por Operação+Supervisor (upsert) — pensada pra passagem de
// bastão entre turnos. Só edita quem é dono fixo dessa operação (tem uma
// entrada em base_mestra pra esse analista+operação) ou o supervisor/admin
// — quem só está cobrindo o hub (suplente avulso ou de ausência) pode ver
// mas não editar, pra a nota não virar bagunça de gente de passagem. Sem
// histórico de versões de propósito — é uma nota viva compartilhada, não
// um log; quem salvar por último vence.
async function upsertParticularidade(req, res) {
  const { supervisorId, operacao, texto } = req.body;
  if (!supervisorId || !operacao) {
    return res.status(400).json({ error: "bad_request", message: "supervisorId e operacao são obrigatórios" });
  }
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  let podeEditar = caller.isAdmin || (caller.role === "supervisor" && caller.id === supervisorId);
  if (!podeEditar && caller.role === "analista" && caller.supervisorId === supervisorId) {
    const baseMestra = await supabaseService.listAll("baseMestra");
    podeEditar = baseMestra.some((b) => b.analistaId === caller.id && b.operacao === operacao);
  }
  if (!podeEditar) {
    return res.status(403).json({ error: "forbidden", message: "Só o analista titular dessa operação ou o supervisor podem editar a particularidade." });
  }

  const existentes = await supabaseService.listAll(COLLECTION);
  const existente = existentes.find((p) => p.supervisorId === supervisorId && p.operacao === operacao);
  const dados = {
    supervisorId,
    operacao,
    // Só o toolbar (negrito/itálico/sublinhado/alinhamento) sobrevive —
    // fecha a brecha de quem mandar HTML direto pro POST, sem passar pelo
    // execCommand do frontend (ver sanitizeHtml.js).
    texto: sanitizeParticularidadeHtml(texto),
    atualizadoPor: caller.name || caller.email || "—",
    atualizadoEm: Date.now(),
  };
  const salvo = existente
    ? await supabaseService.update(COLLECTION, existente.id, dados)
    : await supabaseService.create(COLLECTION, dados);
  res.json(salvo);
}

module.exports = { listParticularidades, upsertParticularidade };
