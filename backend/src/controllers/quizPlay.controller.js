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

// GET /estado é a rota "N vezes por segundo" de verdade — TODO participante
// conectado bate aqui a cada ~2s, cada um disparando 2-3 consultas (sessão +
// perguntas + participantes + respostas). Sem isso, o trabalho do servidor
// cresce junto com o número de gente no quiz — 20 participantes já foi o
// suficiente pra travar (visto em produção, quiz do Thiago Nascimento,
// 01/09/2026); com esse cache, 20 ou 150 participantes fazem o servidor
// consultar o banco a MESMA quantidade de vezes (uma vez por segundo, por
// quiz, não uma vez por participante). Guarda só a parte COMPARTILHADA da
// resposta (igual pra todo mundo) — os campos por participante (jaRespondi,
// minhaResposta, minhaPosicao) continuam calculados na hora, em cima do
// bundle cacheado, sem bater no banco de novo.
const CACHE_TTL_MS = 1000;
const bundleCache = new Map(); // pin -> { expiraEm, promise }

// Guarda a PROMISE em voo, não só o resultado pronto — com N participantes
// pollando quase ao mesmo tempo (o cenário exato que sobrecarregou o
// servidor), se guardássemos só o resultado final, todo mundo que chegasse
// ANTES da primeira consulta terminar veria "cache vazio" e cada um
// dispararia sua própria consulta igual — o cache não protegeria nada bem
// na hora que mais importa. Guardando a promise, quem chega depois do
// primeiro (mesmo ainda em voo) recebe a MESMA promise em vez de iniciar
// outra consulta.
function bundleDaSessao(pin) {
  const cache = bundleCache.get(pin);
  if (cache && cache.expiraEm > Date.now()) return cache.promise;

  const promise = (async () => {
    const sessao = await getSessaoPorPin(pin);
    if (!sessao) {
      bundleCache.delete(pin);
      return null;
    }
    const perguntas = await perguntasDaSessao(sessao.id);
    const participantes = await supabaseService.listWhere(PARTICIPANTES, [["quizSessaoId", "==", sessao.id]]);
    const perguntaAtual = perguntas[sessao.perguntaAtualIndex] || null;
    let respostasAtuais = [];
    if (perguntaAtual && (sessao.status === "pergunta" || sessao.status === "revelacao")) {
      respostasAtuais = await supabaseService.listWhere(RESPOSTAS, [["quizPerguntaId", "==", perguntaAtual.id]]);
    }
    return { sessao, perguntas, participantes, perguntaAtual, respostasAtuais };
  })();

  bundleCache.set(pin, { expiraEm: Date.now() + CACHE_TTL_MS, promise });
  return promise;
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
  const bundle = await bundleDaSessao(req.params.pin);
  if (!bundle) return res.status(404).json({ error: "not_found", message: "PIN não encontrado." });
  const { sessao, perguntas, participantes, perguntaAtual, respostasAtuais } = bundle;
  const { participanteId } = req.query;

  const out = {
    titulo: sessao.titulo,
    status: sessao.status,
    perguntaIndex: sessao.perguntaAtualIndex,
    totalPerguntas: perguntas.length,
    totalParticipantes: participantes.length,
  };

  if (sessao.status === "pergunta" && perguntaAtual) {
    out.pergunta = {
      id: perguntaAtual.id,
      enunciado: perguntaAtual.enunciado,
      opcoes: perguntaAtual.opcoes,
      tempoSegundos: perguntaAtual.tempoSegundos,
    };
    out.perguntaIniciadaEm = sessao.perguntaIniciadaEm;
    out.respondidosCount = respostasAtuais.length;
    if (participanteId) {
      const minha = respostasAtuais.find((r) => r.participanteId === participanteId);
      out.jaRespondi = !!minha;
    }
  } else if (sessao.status === "revelacao" && perguntaAtual) {
    const distribuicao = [0, 0, 0, 0];
    respostasAtuais.forEach((r) => { if (distribuicao[r.opcaoIndex] !== undefined) distribuicao[r.opcaoIndex]++; });
    out.pergunta = { enunciado: perguntaAtual.enunciado, opcoes: perguntaAtual.opcoes };
    out.corretaIndex = perguntaAtual.corretaIndex;
    out.distribuicao = distribuicao;
    if (participanteId) {
      const minha = respostasAtuais.find((r) => r.participanteId === participanteId);
      out.minhaResposta = minha ? { opcaoIndex: minha.opcaoIndex, correta: minha.correta, pontosGanhos: minha.pontosGanhos } : null;
    }
  } else if (sessao.status === "ranking") {
    const ordenados = participantes.slice().sort((a, b) => b.pontuacao - a.pontuacao);
    out.ranking = ordenados.slice(0, 10).map((p) => ({ nome: p.nome, pontuacao: p.pontuacao }));
    out.final = sessao.perguntaAtualIndex >= perguntas.length - 1;
    if (participanteId) {
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

module.exports = { entrar, estado, responder, bundleDaSessao };
