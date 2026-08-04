const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "feedbacks";

// Lista pra todo mundo (mesmo padrão de baseMestra/ausencias/etc.: o
// backend não filtra por role, quem decide o que mostrar é a tela — só o
// Coordenador tem uma tela que lista isso, ver frontend/js/render-coordenador.js).
async function listFeedbacks(req, res) {
  const feedbacks = await supabaseService.listAll(COLLECTION);
  res.json(feedbacks);
}

// Só analista manda feedback — é o público-alvo do recurso (ver
// frontend/js/render-analista.js, tela "Feedback").
async function createFeedback(req, res) {
  const { texto } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: "bad_request", message: "texto é obrigatório" });
  }
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden", message: "Usuário autenticado não encontrado." });
  if (!caller.isAdmin && caller.role !== "analista") {
    return res.status(403).json({ error: "forbidden", message: "Só analistas podem enviar feedback." });
  }
  const feedback = await supabaseService.create(COLLECTION, {
    analistaId: caller.id,
    analistaNome: caller.name,
    texto: texto.trim(),
    ts: Date.now(),
  });
  res.status(201).json(feedback);
}

// Só coordenador (ou admin) exclui — é quem tem a tela de gestão desses
// feedbacks.
async function deleteFeedback(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller || (!caller.isAdmin && caller.role !== "coordenador")) {
    return res.status(403).json({ error: "forbidden", message: "Só coordenadores podem excluir feedbacks." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listFeedbacks, createFeedback, deleteFeedback };
