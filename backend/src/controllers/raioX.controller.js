const firestoreService = require("../services/firestoreService");

const COLLECTION = "raioX";
const MIN_OBSERVACAO_LEN = 150;

async function listRaioX(req, res) {
  const { analistaId, inicio, fim } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
  if (analistaId) rows = rows.filter((r) => r.analistaId === analistaId);
  if (inicio) rows = rows.filter((r) => (r.data || "") >= inicio);
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
  if (analistaId !== req.user.uid) {
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
  const entry = await firestoreService.create(COLLECTION, {
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
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.analistaId !== req.user.uid) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir finalizações em seu próprio nome." });
  }
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listRaioX, createRaioX, deleteRaioX };
