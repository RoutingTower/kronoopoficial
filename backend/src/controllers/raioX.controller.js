const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "raioX";
const MIN_OBSERVACAO_LEN = 150;

// raioX cresce sem limite (1 registro por finalização de operação, de toda
// a equipe, pra sempre) — sem filtro no próprio Firestore, uma coleção
// grande faz cada carga de página contar 1 leitura por documento já
// existente, não só pelos novos. Quando o caller não pede um "inicio",
// aplicamos um default de 30 dias (mesma janela do filtro de Ocorrências no
// frontend) pra manter esse custo limitado — quem precisar de um histórico
// mais antigo tem que pedir explicitamente via ?inicio=.
const DEFAULT_JANELA_DIAS = 30;
function inicioPadrao() {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_JANELA_DIAS);
  return d.toISOString().slice(0, 10);
}

async function listRaioX(req, res) {
  const { analistaId, inicio, fim } = req.query;
  const inicioEfetivo = inicio || inicioPadrao();
  let rows = await supabaseService.listWhere(COLLECTION, [["data", ">=", inicioEfetivo]]);
  if (analistaId) rows = rows.filter((r) => r.analistaId === analistaId);
  if (fim) rows = rows.filter((r) => (r.data || "") <= fim);
  res.json(rows);
}

// Espelha o processo de finalização obrigatório do card de operação no
// kanban do analista (frontend/js/events.js): nota de 1 a 5 estrelas e uma
// observação com no mínimo 150 caracteres — ver frontend/js/utils.js
// (isOperacaoFinalizada, RAIOX_MIN_OBS_LEN).
// Finalização é sempre auto-declarada pelo próprio analista (ver
// frontend/js/events.js) — ninguém finaliza operação de outra pessoa.
async function createRaioX(req, res) {
  const { analistaId, operacao, hora, data, estrelas, observacao } = req.body;
  if (!analistaId || !operacao || !hora || !data) {
    return res.status(400).json({
      error: "bad_request",
      message: "analistaId, operacao, hora e data são obrigatórios",
    });
  }
  const caller = await getCaller(req);
  if (!caller?.isAdmin && analistaId !== req.user.uid) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode finalizar operações em seu próprio nome." });
  }
  const nota = Number(estrelas);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ error: "bad_request", message: "estrelas deve ser um inteiro de 1 a 5" });
  }
  if (!observacao || observacao.trim().length < MIN_OBSERVACAO_LEN) {
    return res.status(400).json({
      error: "bad_request",
      message: `observacao é obrigatória, com no mínimo ${MIN_OBSERVACAO_LEN} caracteres`,
    });
  }
  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    operacao,
    hora,
    data,
    estrelas: nota,
    observacao: observacao.trim(),
    ts: Date.now(),
  });
  res.status(201).json(entry);
}

async function deleteRaioX(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller?.isAdmin && existing.analistaId !== req.user.uid) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir finalizações em seu próprio nome." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listRaioX, createRaioX, deleteRaioX };
