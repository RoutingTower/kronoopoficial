const firestoreService = require("../services/firestoreService");
const { getCaller } = require("../services/authz");

const COLLECTION = "recados";

async function listRecados(req, res) {
  const { to } = req.query;
  let rows = await firestoreService.listAll(COLLECTION);
  if (to) rows = rows.filter((r) => r.to === to || r.to === "all");
  res.json(rows);
}

// Só supervisor envia comunicado, e só pra própria equipe (espelha
// frontend/js/events.js, "Caixa de Envio"). Não há como amarrar "to" a um
// analista específico da equipe de forma genérica aqui (pode ser um id ou
// "all_ana_<supervisorId>"), então a checagem forte é: quem manda tem que
// ser supervisor E o "to" tem que referenciar a própria equipe dele.
async function createRecado(req, res) {
  const { from, to, titulo, texto, observacoes } = req.body;
  if (!from || !to || !texto || !texto.trim()) {
    return res.status(400).json({ error: "bad_request", message: "from, to e texto são obrigatórios" });
  }
  const caller = await getCaller(req);
  if (!caller || caller.role !== "supervisor" || to !== `all_ana_${caller.id}`) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode enviar comunicados para a sua própria equipe." });
  }
  const recado = await firestoreService.create(COLLECTION, {
    from,
    to,
    titulo: titulo || "",
    texto: texto.trim(),
    observacoes: observacoes || "",
    ts: Date.now(),
    lidoPor: [],
  });
  res.status(201).json(recado);
}

// "marcarLido" é aberto a qualquer autenticado (é o destinatário confirmando
// leitura). Reescrever o conteúdo (titulo/texto/observacoes) só quem enviou
// — na prática, o supervisor dono da equipe pra quem o recado foi mandado.
async function updateRecado(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const { titulo, texto, observacoes, lidoPor, marcarLido } = req.body;
  const editaConteudo = titulo !== undefined || texto !== undefined || observacoes !== undefined || lidoPor !== undefined;
  if (editaConteudo) {
    const caller = await getCaller(req);
    if (!caller || caller.role !== "supervisor" || existing.to !== `all_ana_${caller.id}`) {
      return res.status(403).json({ error: "forbidden", message: "Você só pode editar comunicados enviados pela sua própria equipe." });
    }
  }
  const patch = {};
  if (typeof titulo === "string") patch.titulo = titulo;
  if (typeof texto === "string" && texto.trim()) {
    patch.texto = texto.trim();
    patch.editado = true;
  }
  if (typeof observacoes === "string") patch.observacoes = observacoes;
  if (Array.isArray(lidoPor)) patch.lidoPor = lidoPor;
  if (marcarLido && !((existing.lidoPor || []).includes(marcarLido))) {
    patch.lidoPor = [...(existing.lidoPor || []), marcarLido];
  }
  const updated = await firestoreService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteRecado(req, res) {
  const existing = await firestoreService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller || caller.role !== "supervisor" || existing.to !== `all_ana_${caller.id}`) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir comunicados enviados pela sua própria equipe." });
  }
  await firestoreService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listRecados, createRecado, updateRecado, deleteRecado };
