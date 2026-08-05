const supabaseService = require("../services/supabaseService");
const { notificar } = require("../services/notificar");

const COLLECTION = "notificacoes";

async function listNotificacoes(req, res) {
  const all = await supabaseService.listAll(COLLECTION);
  const minhas = all.filter((n) => n.destinatarioId === req.user.uid).sort((a, b) => b.ts - a.ts);
  res.json(minhas);
}

async function marcarLida(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.destinatarioId !== req.user.uid) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode marcar como lida a sua própria notificação." });
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, { lida: true });
  res.json(updated);
}

// PÚBLICO — registrado antes do requireAuth (ver routes/index.js), porque
// quem clica em "Esqueci minha senha" ainda não está logado. Responde
// sempre a mesma mensagem genérica, exista ou não o e-mail — não dá pra
// esse endpoint virar um jeito de descobrir quem tem conta no sistema.
//
// Quem é avisado: o supervisor do analista, o coordenador do supervisor,
// ou (se for o próprio coordenador, ou não tiver ninguém acima) todo mundo
// com isAdmin — não existe ninguém "acima" de um coordenador nesse app.
async function esqueciSenha(req, res) {
  const { email } = req.body;
  const respostaGenerica = { message: "Se esse e-mail estiver cadastrado, a pessoa responsável foi avisada." };
  if (!email) return res.json(respostaGenerica);

  const users = await supabaseService.listAll("users");
  const alvo = users.find((u) => (u.email || "").toLowerCase() === String(email).trim().toLowerCase());
  if (!alvo) return res.json(respostaGenerica);

  let destinatarios;
  if (alvo.role === "analista" && alvo.supervisorId) {
    destinatarios = [alvo.supervisorId];
  } else if (alvo.role === "supervisor" && alvo.coordenadorId) {
    destinatarios = [alvo.coordenadorId];
  } else {
    destinatarios = users.filter((u) => u.isAdmin).map((u) => u.id);
  }

  const mensagem = `${alvo.name} (${alvo.email}) esqueceu a senha e precisa de um reset.`;
  await Promise.all(destinatarios.map((id) => notificar(id, "esqueci_senha", mensagem)));
  res.json(respostaGenerica);
}

module.exports = { listNotificacoes, marcarLida, esqueciSenha };
