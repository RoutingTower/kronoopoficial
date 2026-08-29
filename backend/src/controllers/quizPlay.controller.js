// Lado do jogador — SEM login (ver routes/index.js, montado antes do
// requireAuth, igual /esqueci-senha). Quem entra manda só PIN + apelido;
// a identidade dele pro resto da sessão é o participanteId devolvido aqui,
// guardado no localStorage pelo frontend (quiz-play.js).

const supabaseService = require("../services/supabaseService");

const SESSOES = "quizSessoes";
const PERGUNTAS = "quizPerguntas";
const PARTICIPANTES = "quizParticipantes";
const RESPOSTAS = "quizRespostas";

async function getSessaoPorPin(pin) {
  const encontradas = await supabaseService.listWhere(SESSOES, [["pin", "==", pin]]);
  // Reaproveitar PIN só acontece com sessões encerradas (ver quiz.controller.js
  // pinUnico) — entre as que sobrarem com o mesmo PIN, a mais recente é a viva.
  return encontradas.sort((a, b) => b.criadoEm - a.criadoEm)[0] || null;
}

async function perguntasDaSessao(sessaoId) {
  return (await supabaseService.listWhere(PERGUNTAS, [["quizSessaoId", "==", sessaoId]])).sort((a, b) => a.ordem - b.ordem);
}

async function entrar(req, res) {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: "bad_request", message: "Informe seu nome." });
  }
  const sessao = await getSessaoPorPin(req.params.pin);
  if (!sessao) return res.status(404).json({ error: "not_found", message: "PIN não encontrado." });
  if (sessao.status !== "lobby") {
    return res.status(409).json({ error: "ja_iniciado", message: "Esse quiz já começou — peça um PIN novo ao apresentador." });
  }
  const participante = await supabaseService.create(PARTICIPANTES, {
    quizSessaoId: sessao.id,
    nome: nome.trim().slice(0, 40),
    pontuacao: 0,
    entrouEm: Date.now(),
  });
  res.status(201).json({ participanteId: participante.id, quizSessaoId: sessao.id, titulo: sessao.titulo });
}

async function estado(req, res) {
  const sessao = await getSessaoPorPin(req.params.pin);
  if (!sessao) return res.status(404).json({ error: "not_found", message: "PIN não encontrado." });
  const perguntas = await perguntasDaSessao(sessao.id);
  const participantes = await supabaseService.listWhere(PARTICIPANTES, [["quizSessaoId", "==", sessao.id]]);
  const { participanteId } = req.query;

  const out = {
    titulo: sessao.titulo,
    status: sessao.status,
    perguntaIndex: sessao.perguntaAtualIndex,
    totalPerguntas: perguntas.length,
    totalParticipantes: participantes.length,
  };

  const perguntaAtual = perguntas[sessao.perguntaAtualIndex] || null;

  if (sessao.status === "pergunta" && perguntaAtual) {
    const respostas = await supabaseService.listWhere(RESPOSTAS, [["quizPerguntaId", "==", perguntaAtual.id]]);
    out.pergunta = {
      id: perguntaAtual.id,
      enunciado: perguntaAtual.enunciado,
      opcoes: perguntaAtual.opcoes,
      tempoSegundos: perguntaAtual.tempoSegundos,
    };
    out.perguntaIniciadaEm = sessao.perguntaIniciadaEm;
    out.respondidosCount = respostas.length;
    if (participanteId) {
      const minha = respostas.find((r) => r.participanteId === participanteId);
      out.jaRespondi = !!minha;
    }
  } else if (sessao.status === "revelacao" && perguntaAtual) {
    const respostas = await supabaseService.listWhere(RESPOSTAS, [["quizPerguntaId", "==", perguntaAtual.id]]);
    const distribuicao = [0, 0, 0, 0];
    respostas.forEach((r) => { if (distribuicao[r.opcaoIndex] !== undefined) distribuicao[r.opcaoIndex]++; });
    out.pergunta = { enunciado: perguntaAtual.enunciado, opcoes: perguntaAtual.opcoes };
    out.corretaIndex = perguntaAtual.corretaIndex;
    out.distribuicao = distribuicao;
    if (participanteId) {
      const minha = respostas.find((r) => r.participanteId === participanteId);
      out.minhaResposta = minha ? { opcaoIndex: minha.opcaoIndex, correta: minha.correta, pontosGanhos: minha.pontosGanhos } : null;
    }
  } else if (sessao.status === "ranking") {
    const ranking = participantes.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 10).map((p) => ({ nome: p.nome, pontuacao: p.pontuacao }));
    out.ranking = ranking;
    out.final = sessao.perguntaAtualIndex >= perguntas.length - 1;
    if (participanteId) {
      const ordenados = participantes.sort((a, b) => b.pontuacao - a.pontuacao);
      const posicao = ordenados.findIndex((p) => p.id === participanteId);
      const eu = ordenados[posicao];
      if (eu) out.minhaPosicao = { posicao: posicao + 1, pontuacao: eu.pontuacao };
    }
  }

  res.json(out);
}

async function responder(req, res) {
  const { participanteId, perguntaId, opcaoIndex } = req.body;
  if (!participanteId || !perguntaId || !Number.isInteger(opcaoIndex)) {
    return res.status(400).json({ error: "bad_request", message: "Dados incompletos." });
  }
  const sessao = await getSessaoPorPin(req.params.pin);
  if (!sessao) return res.status(404).json({ error: "not_found", message: "PIN não encontrado." });
  if (sessao.status !== "pergunta") {
    return res.status(409).json({ error: "fora_de_tempo", message: "Essa pergunta não está mais aberta." });
  }
  const perguntas = await perguntasDaSessao(sessao.id);
  const perguntaAtual = perguntas[sessao.perguntaAtualIndex];
  if (!perguntaAtual || perguntaAtual.id !== perguntaId) {
    return res.status(409).json({ error: "fora_de_tempo", message: "Essa pergunta não está mais aberta." });
  }
  const participante = await supabaseService.getById(PARTICIPANTES, participanteId);
  if (!participante || participante.quizSessaoId !== sessao.id) {
    return res.status(403).json({ error: "forbidden", message: "Participante não encontrado nessa sessão." });
  }

  // Tempo decorrido a partir do relógio do SERVIDOR (perguntaIniciadaEm foi
  // gravado por avancarQuiz) — nunca confia num timestamp mandado pelo
  // cliente, senão dava pra forjar resposta "instantânea" e pontuar o máximo.
  const tempoTotalMs = perguntaAtual.tempoSegundos * 1000;
  const tempoDecorridoMs = Math.min(Math.max(Date.now() - sessao.perguntaIniciadaEm, 0), tempoTotalMs);
  const correta = opcaoIndex === perguntaAtual.corretaIndex;
  const pontosGanhos = correta ? Math.round(1000 * (0.5 + 0.5 * (1 - tempoDecorridoMs / tempoTotalMs))) : 0;

  let resposta;
  try {
    resposta = await supabaseService.create(RESPOSTAS, {
      quizPerguntaId: perguntaAtual.id,
      participanteId,
      opcaoIndex,
      correta,
      pontosGanhos,
      respondidoEm: Date.now(),
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "ja_respondeu", message: "Você já respondeu essa pergunta." });
    }
    throw err;
  }

  let pontuacaoTotal = participante.pontuacao;
  if (correta) {
    pontuacaoTotal = participante.pontuacao + pontosGanhos;
    await supabaseService.update(PARTICIPANTES, participanteId, { pontuacao: pontuacaoTotal });
  }

  res.status(201).json({ correta: resposta.correta, pontosGanhos: resposta.pontosGanhos, pontuacaoTotal });
}

module.exports = { entrar, estado, responder };
