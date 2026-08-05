const supabaseService = require("./supabaseService");

// Helper único pra criar notificações do sino (ver notificacoes.controller.js
// pra leitura/marcar-lida). Usado tanto pelo fluxo de "esqueci minha senha"
// quanto por qualquer alteração na agenda de um analista (base mestra,
// ausência/cobertura, reunião) — sempre que o nome dele estiver envolvido.
async function notificar(destinatarioId, tipo, mensagem) {
  if (!destinatarioId) return;
  await supabaseService.create("notificacoes", {
    destinatarioId,
    tipo,
    mensagem,
    lida: false,
    ts: Date.now(),
  });
}

module.exports = { notificar };
