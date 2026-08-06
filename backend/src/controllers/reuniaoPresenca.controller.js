const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "reuniaoPresenca";

async function listReuniaoPresenca(req, res) {
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows);
}

// Sempre em nome de quem chama — ninguém confirma presença por outra
// pessoa. Idempotente: se já existir, só devolve o registro existente (não
// duplica nem atualiza o ts de novo).
async function marcarPresenca(req, res) {
  const { reuniaoId } = req.body;
  if (!reuniaoId) {
    return res.status(400).json({ error: "bad_request", message: "reuniaoId é obrigatório" });
  }
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  const reuniao = await supabaseService.getById("reunioes", reuniaoId);
  if (!reuniao) return res.status(404).json({ error: "not_found" });

  const existentes = await supabaseService.listAll(COLLECTION);
  const existente = existentes.find((p) => p.reuniaoId === reuniaoId && p.analistaId === caller.id);
  if (existente) return res.json(existente);
  const novo = await supabaseService.create(COLLECTION, { reuniaoId, analistaId: caller.id, ts: Date.now() });
  res.status(201).json(novo);
}

module.exports = { listReuniaoPresenca, marcarPresenca };
