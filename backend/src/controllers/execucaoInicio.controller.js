const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "execucaoInicio";

// Mesmo motivo do DEFAULT_JANELA_DIAS em raioX.controller.js: a coleção
// cresce 1 linha por operação iniciada, pra sempre — sem filtro, cada
// carga de página paga o preço de ler tudo que já existiu.
const DEFAULT_JANELA_DIAS = 30;
function inicioPadrao() {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_JANELA_DIAS);
  return d.toISOString().slice(0, 10);
}

async function listExecucaoInicio(req, res) {
  const { analistaId, inicio } = req.query;
  const inicioEfetivo = inicio || inicioPadrao();
  let rows = await supabaseService.listWhere(COLLECTION, [["data", ">=", inicioEfetivo]]);
  if (analistaId) rows = rows.filter((r) => r.analistaId === analistaId);
  res.json(rows);
}

function mesmoSlot(row, { operacao, ciclo, hora, data }) {
  return row.operacao === operacao && (row.ciclo || "") === (ciclo || "") && row.hora === hora && row.data === data;
}

// Clique em "Iniciar operação" — sempre em nome de quem clica (espelha
// raioX.controller.js). Idempotente: se já existe um início pra esse slot,
// devolve ele sem sobrescrever (o cronômetro já está rodando desde o
// primeiro clique, um duplo-clique não deve "resetar" o relógio).
async function createExecucaoInicio(req, res) {
  const { analistaId, operacao, ciclo, hora, data } = req.body;
  if (!analistaId || !operacao || !hora || !data) {
    return res.status(400).json({ error: "bad_request", message: "analistaId, operacao, hora e data são obrigatórios" });
  }
  if (analistaId !== req.user.uid) {
    const caller = await getCaller(req);
    if (!caller?.isAdmin) {
      return res.status(403).json({ error: "forbidden", message: "Você só pode iniciar operações em seu próprio nome." });
    }
  }
  const existentes = await supabaseService.listWhere(COLLECTION, [["analistaId", "==", analistaId], ["data", "==", data]]);
  const existente = existentes.find((r) => mesmoSlot(r, { operacao, ciclo, hora, data }));
  if (existente) return res.json(existente);

  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    operacao,
    ciclo: ciclo || "",
    hora,
    data,
    iniciadoEm: Date.now(),
    liberadoManual: false,
    liberadoPor: null,
    criadoEm: Date.now(),
  });
  res.status(201).json(entry);
}

// Supervisor libera o preenchimento manual (início/fim digitados à mão) pra
// quem esqueceu de clicar "Iniciar" dentro da janela — só o supervisor
// dessa equipe (ou admin) pode liberar, espelhando createAusencia.
async function liberarManual(req, res) {
  const { analistaId, operacao, ciclo, hora, data } = req.body;
  if (!analistaId || !operacao || !hora || !data) {
    return res.status(400).json({ error: "bad_request", message: "analistaId, operacao, hora e data são obrigatórios" });
  }
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(analistaId)]);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode liberar preenchimento manual da sua equipe." });
  }

  const existentes = await supabaseService.listWhere(COLLECTION, [["analistaId", "==", analistaId], ["data", "==", data]]);
  const existente = existentes.find((r) => mesmoSlot(r, { operacao, ciclo, hora, data }));
  if (existente) {
    const atualizado = await supabaseService.update(COLLECTION, existente.id, { liberadoManual: true, liberadoPor: caller.id });
    return res.json(atualizado);
  }
  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    operacao,
    ciclo: ciclo || "",
    hora,
    data,
    iniciadoEm: null,
    liberadoManual: true,
    liberadoPor: caller.id,
    criadoEm: Date.now(),
  });
  res.status(201).json(entry);
}

module.exports = { listExecucaoInicio, createExecucaoInicio, liberarManual };
