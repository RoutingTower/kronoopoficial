const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "particularidadeCiente";

async function listParticularidadeCiente(req, res) {
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows);
}

// Confirmação pessoal de "li a particularidade dessa cobertura" — só o
// próprio analista pode confirmar em nome dele (nunca outra pessoa, nem o
// supervisor). Idempotente: se já existir pra essa analista+operação+data,
// só devolve o registro existente (não duplica nem atualiza o ts de novo).
async function marcarCiente(req, res) {
  const { analistaId, operacao, data } = req.body;
  if (!analistaId || !operacao || !data) {
    return res.status(400).json({ error: "bad_request", message: "analistaId, operacao e data são obrigatórios" });
  }
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && caller.id !== analistaId)) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode confirmar ciência em seu próprio nome." });
  }
  const existentes = await supabaseService.listAll(COLLECTION);
  const existente = existentes.find((c) => c.analistaId === analistaId && c.operacao === operacao && c.data === data);
  if (existente) return res.json(existente);
  const novo = await supabaseService.create(COLLECTION, { analistaId, operacao, data, ts: Date.now() });
  res.status(201).json(novo);
}

module.exports = { listParticularidadeCiente, marcarCiente };
