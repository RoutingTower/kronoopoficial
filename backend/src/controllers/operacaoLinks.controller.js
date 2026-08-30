// Link do grupo do SeaTalk por operação — cadastro simples, independente
// de base_mestra/sprs (ver comentário na tabela, supabase-schema.sql).
// Leitura liberada a qualquer autenticado (o botão aparece no card de
// QUALQUER analista, titular ou suplente cobrindo); escrita só supervisor/
// coordenador/admin, mesma régua de outras telas de cadastro (ex.: SPR).

const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "operacaoLinks";

function podeEditar(caller) {
  return !!caller && (caller.isAdmin || caller.role === "supervisor" || caller.role === "coordenador");
}

async function listOperacaoLinks(req, res) {
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows);
}

async function createOperacaoLink(req, res) {
  const caller = await getCaller(req);
  if (!podeEditar(caller)) {
    return res.status(403).json({ error: "forbidden", message: "Só supervisor ou coordenador pode cadastrar links." });
  }
  const { operacao, link } = req.body;
  if (!operacao || !operacao.trim() || !link || !link.trim()) {
    return res.status(400).json({ error: "bad_request", message: "Operação e link são obrigatórios." });
  }
  const existentes = await supabaseService.listWhere(COLLECTION, [["operacao", "==", operacao.trim()]]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: "conflict", message: "Já existe um link cadastrado para essa operação." });
  }
  const entry = await supabaseService.create(COLLECTION, { operacao: operacao.trim(), link: link.trim() });
  res.status(201).json(entry);
}

async function updateOperacaoLink(req, res) {
  const caller = await getCaller(req);
  if (!podeEditar(caller)) {
    return res.status(403).json({ error: "forbidden", message: "Só supervisor ou coordenador pode editar links." });
  }
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const { operacao, link } = req.body;
  const patch = {};
  if (typeof operacao === "string" && operacao.trim()) patch.operacao = operacao.trim();
  if (typeof link === "string" && link.trim()) patch.link = link.trim();
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteOperacaoLink(req, res) {
  const caller = await getCaller(req);
  if (!podeEditar(caller)) {
    return res.status(403).json({ error: "forbidden", message: "Só supervisor ou coordenador pode excluir links." });
  }
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listOperacaoLinks, createOperacaoLink, updateOperacaoLink, deleteOperacaoLink };
