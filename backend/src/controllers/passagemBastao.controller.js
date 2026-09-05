// Varredura manual/retroativa de passagem de bastão — cobre operações que já
// existiam ANTES da checagem automática (ver createBaseMestra,
// baseMestra.controller.js) entrar no ar. Fora do requireAuth (mesmo esquema
// do planilha-import/report do SeaTalk): autenticado por token compartilhado,
// não por sessão de usuário logado.
const { encontrarPassagensDeBastao, montarMensagens } = require("../services/passagemBastao");
const { notificar } = require("../services/notificar");
const { passagemBastaoToken } = require("../config/env");

async function previsarOuEnviarPassagemBastao(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!passagemBastaoToken || token !== passagemBastaoToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const { dataFimAntigo, enviar } = req.body;
  if (!dataFimAntigo) {
    return res.status(400).json({ error: "bad_request", message: "dataFimAntigo é obrigatório (o último dia do titular que está saindo)." });
  }

  const pares = await encontrarPassagensDeBastao(dataFimAntigo);
  const mensagens = pares.map((par) => ({ ...par, ...montarMensagens(par) }));

  if (enviar) {
    for (const m of mensagens) {
      await notificar(m.antigoAnalistaId, "agenda", m.paraAntigo);
      await notificar(m.novoAnalistaId, "agenda", m.paraNovo);
    }
  }

  res.json({ enviado: !!enviar, total: mensagens.length, pares: mensagens });
}

module.exports = { previsarOuEnviarPassagemBastao };
