const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");
const { notificar } = require("../services/notificar");
const { statusFormulario } = require("./formularios.controller");

const COLLECTION = "formularioRespostas";
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
function weekdayOf(dateStr) {
  return WEEKDAYS[new Date(dateStr + "T00:00:00Z").getUTCDay()];
}
function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Sem formularioId: lista tudo dentro do escopo de quem chama (mesmo
// padrão bulk do resto do app — ver loadDB no frontend). Com formularioId:
// mais específico, mas a regra de visibilidade é a mesma nos dois casos —
// analista só vê a própria resposta; supervisor dono do formulário (ou
// admin) vê todas (a resposta não guarda supervisorId, só formularioId,
// então o "dono" se resolve via o formulário).
async function listRespostas(req, res) {
  const { formularioId } = req.query;
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });

  if (formularioId) {
    const formulario = await supabaseService.getById("formularios", formularioId);
    if (!formulario) return res.status(404).json({ error: "not_found" });
    let rows = await supabaseService.listWhere(COLLECTION, [["formularioId", "==", formularioId]]);
    const souDono = caller.isAdmin || (caller.role === "supervisor" && formulario.supervisorId === caller.id);
    if (!souDono) rows = rows.filter((r) => r.analistaId === caller.id);
    return res.json(rows);
  }

  if (caller.isAdmin) return res.json(await supabaseService.listAll(COLLECTION));
  if (caller.role === "supervisor") {
    const meusFormularios = new Set(
      (await supabaseService.listAll("formularios")).filter((f) => f.supervisorId === caller.id).map((f) => f.id)
    );
    const rows = await supabaseService.listAll(COLLECTION);
    return res.json(rows.filter((r) => meusFormularios.has(r.formularioId)));
  }
  const rows = await supabaseService.listAll(COLLECTION);
  res.json(rows.filter((r) => r.analistaId === caller.id));
}

function validarPayload(f, payload) {
  if (f.tipo === "domingo_voluntariado") {
    if (!Array.isArray(payload.datas)) return "datas deve ser uma lista.";
    for (const d of payload.datas) {
      if (typeof d !== "string" || (f.periodoInicio && d < f.periodoInicio) || (f.periodoFim && d > f.periodoFim)) {
        return "Data fora do período do formulário.";
      }
    }
    return null;
  }
  if (f.tipo === "folga_escolha") {
    if (!payload.data || typeof payload.data !== "string") return "Escolha uma data.";
    if ((f.periodoInicio && payload.data < f.periodoInicio) || (f.periodoFim && payload.data > f.periodoFim)) {
      return "Data fora do período do formulário.";
    }
    return null;
  }
  if (f.tipo === "reconhecimento_mensal") {
    if (!payload.indicadoId) return "Escolha quem você quer indicar.";
    return null;
  }
  if (f.tipo === "ferias_solicitacao") {
    if (!payload.inicio || !payload.fim) return "Informe o período de férias.";
    if (payload.inicio > payload.fim) return "A data final não pode ser antes da inicial.";
    return null;
  }
  return "tipo de formulário desconhecido.";
}

// Envia (ou reenvia — upsert por formularioId+analistaId, ver índice único
// no schema) a resposta do próprio analista. Reenviar uma solicitação de
// férias sempre volta pro status "pendente" (mudou a data, precisa
// reavaliar), mesmo que a anterior já tivesse sido decidida.
async function enviarResposta(req, res) {
  const { formularioId, payload } = req.body;
  if (!formularioId || !payload || typeof payload !== "object") {
    return res.status(400).json({ error: "bad_request", message: "formularioId e payload são obrigatórios." });
  }
  const formulario = await supabaseService.getById("formularios", formularioId);
  if (!formulario) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller || caller.role !== "analista" || caller.supervisorId !== formulario.supervisorId) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode responder formulários da sua própria equipe." });
  }
  if (statusFormulario(formulario) !== "aberto") {
    return res.status(403).json({ error: "forbidden", message: "Esse formulário não está aberto no momento." });
  }

  const erro = validarPayload(formulario, payload);
  if (erro) return res.status(400).json({ error: "bad_request", message: erro });

  if (formulario.tipo === "reconhecimento_mensal") {
    if (payload.indicadoId === caller.id) {
      return res.status(400).json({ error: "bad_request", message: "Você não pode indicar a si mesmo." });
    }
    const indicadoSupervisorId = await supervisorIdDoAnalista(payload.indicadoId);
    if (indicadoSupervisorId !== caller.supervisorId) {
      return res.status(400).json({ error: "bad_request", message: "Só é possível indicar alguém da sua própria equipe." });
    }
  }

  if (formulario.tipo === "folga_escolha") {
    const outras = await supabaseService.listWhere(COLLECTION, [["formularioId", "==", formularioId]]);
    const ocupadas = outras.filter((r) => r.analistaId !== caller.id && r.payload?.data === payload.data).length;
    if (ocupadas >= (formulario.limitePorDia || 1)) {
      return res.status(409).json({ error: "conflict", message: "Esse dia já atingiu o limite de folgas — escolha outro." });
    }
  }

  const existentes = await supabaseService.listWhere(COLLECTION, [
    ["formularioId", "==", formularioId],
    ["analistaId", "==", caller.id],
  ]);
  const existente = existentes[0];
  const agora = Date.now();
  const dadosBase = {
    payload,
    status: formulario.tipo === "ferias_solicitacao" ? "pendente" : "enviado",
    motivoRecusa: "",
    atualizadoEm: agora,
  };
  let resposta;
  if (existente) {
    resposta = await supabaseService.update(COLLECTION, existente.id, dadosBase);
  } else {
    resposta = await supabaseService.create(COLLECTION, { formularioId, analistaId: caller.id, criadoEm: agora, ...dadosBase });
  }

  if (formulario.tipo === "ferias_solicitacao") {
    await notificar(formulario.supervisorId, "agenda", `${caller.name} solicitou férias de ${payload.inicio} a ${payload.fim}.`);
  }
  res.status(existente ? 200 : 201).json(resposta);
}

// Aprovar cria o esqueleto de ausência (tipo "ferias") pra cada operação
// fixa do analista, em cada dia do período — sem suplente ainda, o
// supervisor completa a cobertura depois pelo fluxo que já existe
// (Sugerir Suplente / editar a ausência), igual já acontece hoje quando
// ele lança férias manualmente. Pula slot que já tiver ausência (evita
// duplicar se for aprovado mais de uma vez).
async function decidirFerias(req, res, aprovado) {
  const resposta = await supabaseService.getById(COLLECTION, req.params.id);
  if (!resposta) return res.status(404).json({ error: "not_found" });
  const formulario = await supabaseService.getById("formularios", resposta.formularioId);
  if (!formulario || formulario.tipo !== "ferias_solicitacao") {
    return res.status(400).json({ error: "bad_request", message: "Essa resposta não é uma solicitação de férias." });
  }
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || formulario.supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const patch = {
    status: aprovado ? "aprovado" : "recusado",
    motivoRecusa: aprovado ? "" : req.body.motivo || "",
    atualizadoEm: Date.now(),
  };
  const atualizado = await supabaseService.update(COLLECTION, req.params.id, patch);

  const { inicio, fim } = resposta.payload;
  if (aprovado) {
    const bmEntries = await supabaseService.listWhere("baseMestra", [["analistaId", "==", resposta.analistaId]]);
    const existingAus = await supabaseService.listWhere("ausencias", [["analistaId", "==", resposta.analistaId]]);
    const jaTemAus = new Set(existingAus.filter((a) => a.data >= inicio && a.data <= fim).map((a) => `${a.baseMestraId}|${a.data}`));
    let d = inicio;
    while (d <= fim) {
      for (const bm of bmEntries) {
        if (d < bm.dataInicio || d > bm.dataFim) continue;
        if (bm.dias && bm.dias.length && !bm.dias.includes(weekdayOf(d))) continue;
        if (jaTemAus.has(`${bm.id}|${d}`)) continue;
        await supabaseService.create("ausencias", {
          analistaId: resposta.analistaId,
          baseMestraId: bm.id,
          operacao: bm.operacao,
          ciclo: bm.ciclo || "",
          horaInicio: bm.horaInicio || "",
          horaFim: bm.horaFim || "",
          data: d,
          tipo: "ferias",
          suplenteId: null,
          suplenteNome: "",
        });
      }
      d = addDaysISO(d, 1);
    }
    await notificar(resposta.analistaId, "agenda", `Suas férias de ${inicio} a ${fim} foram aprovadas.`);
  } else {
    await notificar(
      resposta.analistaId,
      "agenda",
      `Sua solicitação de férias de ${inicio} a ${fim} foi recusada.${req.body.motivo ? " Motivo: " + req.body.motivo : ""}`
    );
  }
  res.json(atualizado);
}
const aprovarFerias = (req, res) => decidirFerias(req, res, true);
const recusarFerias = (req, res) => decidirFerias(req, res, false);

module.exports = { listRespostas, enviarResposta, aprovarFerias, recusarFerias };
