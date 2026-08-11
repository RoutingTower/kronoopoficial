const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");
const { notificar } = require("../services/notificar");

const COLLECTION = "ausencias";

async function listAusencias(req, res) {
  const { analistaId } = req.query;
  let rows = await supabaseService.listAll(COLLECTION);
  if (analistaId) rows = rows.filter((a) => a.analistaId === analistaId);
  res.json(rows);
}

// Mesma regra em todo o arquivo: só o supervisor do analista mexe na
// folga/férias dele (espelha frontend/js/events.js, "Cobertura"/sugestão).
async function createAusencia(req, res) {
  const { analistaId, baseMestraId, operacao, ciclo, horaInicio, horaFim, data, tipo, suplenteId, suplenteNome } = req.body;
  if (!analistaId || !baseMestraId || !operacao || !data || !tipo) {
    return res.status(400).json({
      error: "bad_request",
      message: "analistaId, baseMestraId, operacao, data e tipo são obrigatórios",
    });
  }
  if (tipo !== "folga" && tipo !== "ferias") {
    return res.status(400).json({ error: "bad_request", message: "tipo deve ser 'folga' ou 'ferias'" });
  }
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(analistaId)]);
  if (!caller || (!caller.isAdmin && (caller.role !== "supervisor" || supervisorId !== caller.id))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }
  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    baseMestraId,
    operacao,
    ciclo: ciclo || "",
    horaInicio: horaInicio || "",
    horaFim: horaFim || "",
    data,
    tipo,
    suplenteId: suplenteId || null,
    suplenteNome: suplenteNome || "",
  });
  const rotulo = tipo === "ferias" ? "férias" : "folga";
  await notificar(analistaId, "agenda", `Sua ${rotulo} em ${data} (${operacao}) foi registrada.`);
  if (suplenteId) {
    await notificar(suplenteId, "agenda", `Você foi escalado(a) para cobrir ${operacao} em ${data}.`);
  }
  res.status(201).json(entry);
}

async function assertDonoDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaId)]);
  if (!caller) return false;
  return caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
}

async function updateAusencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }

  // Trocar "quem tá folgando" é trocar de baseMestra inteira (o titular E
  // a operação fixa dele, não só um id solto) — o novo titular também
  // precisa ser da mesma equipe, e o baseMestraId novo tem que realmente
  // pertencer a ele (senão a ausência aponta pra uma escala de outra
  // pessoa). operacao/ciclo/horaInicio/horaFim vêm do frontend já
  // derivados do baseMestra escolhido (mesma lógica de createAusencia).
  if (req.body.analistaId !== undefined && req.body.analistaId !== existing.analistaId) {
    const novoSupervisorId = await supervisorIdDoAnalista(req.body.analistaId);
    if (!caller?.isAdmin && (caller?.role !== "supervisor" || novoSupervisorId !== caller.id)) {
      return res.status(403).json({ error: "forbidden", message: "O novo titular também precisa ser da sua equipe." });
    }
    if (req.body.baseMestraId) {
      const bm = await supabaseService.getById("baseMestra", req.body.baseMestraId);
      if (!bm || bm.analistaId !== req.body.analistaId) {
        return res.status(400).json({ error: "bad_request", message: "A operação escolhida não pertence ao novo titular." });
      }
    }
  }

  const patch = {};
  for (const key of ["data", "tipo", "suplenteId", "suplenteNome", "analistaId", "baseMestraId", "operacao", "ciclo", "horaInicio", "horaFim"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);

  const rotulo = updated.tipo === "ferias" ? "férias" : "folga";
  if (patch.analistaId && patch.analistaId !== existing.analistaId) {
    await notificar(existing.analistaId, "agenda", `A ${rotulo} de ${existing.operacao} em ${existing.data} deixou de ser sua — foi transferida para outra pessoa.`);
    await notificar(updated.analistaId, "agenda", `Uma ${rotulo} foi registrada em seu nome: ${updated.operacao} em ${updated.data}.`);
  } else {
    await notificar(existing.analistaId, "agenda", `Sua ${rotulo} em ${updated.data} (${updated.operacao}) foi atualizada.`);
  }
  if (patch.suplenteId !== undefined && patch.suplenteId !== existing.suplenteId) {
    if (existing.suplenteId) {
      await notificar(existing.suplenteId, "agenda", `Você foi removido(a) da cobertura de ${existing.operacao} em ${existing.data}.`);
    }
    if (updated.suplenteId) {
      await notificar(updated.suplenteId, "agenda", `Você foi escalado(a) para cobrir ${updated.operacao} em ${updated.data}.`);
    }
  }
  res.json(updated);
}

async function deleteAusencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertDonoDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode gerenciar ausências da sua equipe." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  const rotulo = existing.tipo === "ferias" ? "férias" : "folga";
  await notificar(existing.analistaId, "agenda", `Sua ${rotulo} em ${existing.data} (${existing.operacao}) foi cancelada.`);
  if (existing.suplenteId) {
    await notificar(existing.suplenteId, "agenda", `Sua cobertura de ${existing.operacao} em ${existing.data} foi cancelada.`);
  }
  res.status(204).send();
}

module.exports = { listAusencias, createAusencia, updateAusencia, deleteAusencia };
