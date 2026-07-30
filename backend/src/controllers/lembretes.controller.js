const firestoreService = require("../services/firestoreService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

const COLLECTION = "lembretes";

// target de um lembrete "supervisor" é o id de um analista específico, ou
// "all_ana_<supervisorId>" pra equipe inteira — ver frontend/js/events.js.
async function isSupervisorDoTarget(caller, target) {
  if (caller.role !== "supervisor") return false;
  if (target === `all_ana_${caller.id}`) return true;
  return (await supervisorIdDoAnalista(target)) === caller.id;
}

// Espelha getLembretesForAnalista() do frontend (frontend/js/utils.js):
// um lembrete pertence ao analista se ele criou (origem=self) ou se foi
// enviado a ele especificamente ou a toda a equipe do supervisor dele.
function belongsToAnalista(lembrete, analistaId, supervisorId) {
  if (lembrete.origem === "self") return lembrete.analistaId === analistaId;
  if (lembrete.origem === "supervisor") {
    return (
      lembrete.target === analistaId ||
      (supervisorId && lembrete.target === `all_ana_${supervisorId}`)
    );
  }
  return false;
}

async function listLembretes(req, res) {
  const { analistaId, supervisorId } = req.query;
  const lembretes = await firestoreService.listAll(COLLECTION);
  if (!analistaId) return res.json(lembretes);
  res.json(lembretes.filter((l) => belongsToAnalista(l, analistaId, supervisorId)));
}

async function createLembrete(req, res) {
  const { origem, texto, observacoes, analistaId, target, criadoPor, data, hora } = req.body;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: "bad_request", message: "texto é obrigatório" });
  }
  if (origem !== "self" && origem !== "supervisor") {
    return res.status(400).json({ error: "bad_request", message: "origem deve ser 'self' ou 'supervisor'" });
  }
  if (origem === "self" && !analistaId) {
    return res.status(400).json({ error: "bad_request", message: "analistaId é obrigatório quando origem=self" });
  }
  if (origem === "supervisor" && !target) {
    return res.status(400).json({ error: "bad_request", message: "target é obrigatório quando origem=supervisor" });
  }

  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden", message: "Usuário autenticado não encontrado." });
  if (origem === "self" && analistaId !== caller.id) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode criar lembretes para si mesmo." });
  }
  if (origem === "supervisor" && !(await isSupervisorDoTarget(caller, target))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode enviar lembretes para a sua própria equipe." });
  }

  const lembrete = await firestoreService.create(COLLECTION, {
    origem,
    texto: texto.trim(),
    observacoes: observacoes ? String(observacoes).trim() : "",
    analistaId: analistaId || null,
    target: target || null,
    criadoPor: criadoPor || "",
    done: false,
    ts: Date.now(),
    data: data || new Date().toISOString().slice(0, 10),
    hora: hora || "",
  });
  res.status(201).json(lembrete);
}

// Dono (origem=self, criador) edita livremente. Destinatário de um lembrete
// enviado por supervisor (origem=supervisor) só pode marcar/desmarcar
// "done" — não reescrever o conteúdo de um lembrete que não é dele.
async function updateLembrete(req, res) {
  const { id } = req.params;
  const existing = await firestoreService.getById(COLLECTION, id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden", message: "Usuário autenticado não encontrado." });

  const isDono = existing.origem === "self" && existing.analistaId === caller.id;
  const isDestinatario =
    existing.origem === "supervisor" &&
    (existing.target === caller.id || (caller.supervisorId && existing.target === `all_ana_${caller.supervisorId}`));

  const { done, texto, observacoes, data, hora } = req.body;
  if (!isDono) {
    if (!isDestinatario) {
      return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para editar este lembrete." });
    }
    if (texto !== undefined || observacoes !== undefined || data !== undefined || hora !== undefined) {
      return res.status(403).json({ error: "forbidden", message: "Você só pode marcar este lembrete como concluído." });
    }
  }

  const patch = {};
  if (typeof done === "boolean") patch.done = done;
  if (typeof texto === "string" && texto.trim()) patch.texto = texto.trim();
  if (typeof observacoes === "string") patch.observacoes = observacoes.trim();
  if (typeof data === "string") patch.data = data;
  if (typeof hora === "string") patch.hora = hora;

  const updated = await firestoreService.update(COLLECTION, id, patch);
  res.json(updated);
}

// Dono (self) exclui o próprio; supervisor exclui o que ele mesmo enviou
// pra própria equipe.
async function deleteLembrete(req, res) {
  const { id } = req.params;
  const existing = await firestoreService.getById(COLLECTION, id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const caller = await getCaller(req);
  const isDono = caller && existing.origem === "self" && existing.analistaId === caller.id;
  const isRemetente = caller && existing.origem === "supervisor" && (await isSupervisorDoTarget(caller, existing.target));
  if (!isDono && !isRemetente) {
    return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para excluir este lembrete." });
  }

  await firestoreService.remove(COLLECTION, id);
  res.status(204).send();
}

module.exports = { listLembretes, createLembrete, updateLembrete, deleteLembrete };
