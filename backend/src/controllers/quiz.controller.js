// Lado do "host" (quem cria e apresenta o quiz) — exige login (requireAuth,
// ver routes/index.js), mas qualquer papel pode usar, não só supervisor/
// coordenador: é uma dinâmica pontual de equipe, não uma tela de gestão.
// O jogador (sem conta) fala com quizPlay.controller.js.

const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const SESSOES = "quizSessoes";
const PERGUNTAS = "quizPerguntas";
const PARTICIPANTES = "quizParticipantes";
const RESPOSTAS = "quizRespostas";

function gerarPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function pinDisponivel(pin) {
  const existentes = await supabaseService.listWhere(SESSOES, [["pin", "==", pin]]);
  return existentes.every((s) => s.status === "encerrado");
}

async function pinUnico() {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const pin = gerarPin();
    if (await pinDisponivel(pin)) return pin;
  }
  throw new Error("Não foi possível gerar um PIN disponível.");
}

function assertDonoQuiz(caller, sessao) {
  return !!caller && !!sessao && sessao.criadoPor === caller.id;
}

async function listQuizzes(req, res) {
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  const sessoes = await supabaseService.listWhere(SESSOES, [["criadoPor", "==", caller.id]]);
  const participantes = await supabaseService.listAll(PARTICIPANTES);
  const contagem = {};
  participantes.forEach((p) => { contagem[p.quizSessaoId] = (contagem[p.quizSessaoId] || 0) + 1; });
  const rows = sessoes
    .sort((a, b) => b.criadoEm - a.criadoEm)
    .map((s) => ({ ...s, totalParticipantes: contagem[s.id] || 0 }));
  res.json(rows);
}

// Usado por createQuiz e updateQuiz — mesma validação nos dois, retorna a
// mensagem de erro (string) ou null se estiver tudo certo.
function validarTituloEPerguntas(titulo, perguntas) {
  if (!titulo || !titulo.trim()) return "Título é obrigatório.";
  if (!Array.isArray(perguntas) || perguntas.length === 0) return "Adicione ao menos uma pergunta.";
  for (const p of perguntas) {
    if (!p.enunciado || !p.enunciado.trim()) return "Toda pergunta precisa de um enunciado.";
    if (!Array.isArray(p.opcoes) || p.opcoes.length !== 4 || p.opcoes.some((o) => !o || !o.trim())) {
      return "Toda pergunta precisa de 4 opções preenchidas.";
    }
    if (!Number.isInteger(p.corretaIndex) || p.corretaIndex < 0 || p.corretaIndex > 3) {
      return "Marque qual opção é a correta.";
    }
  }
  return null;
}

async function createQuiz(req, res) {
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  const { titulo, perguntas } = req.body;
  const erro = validarTituloEPerguntas(titulo, perguntas);
  if (erro) return res.status(400).json({ error: "bad_request", message: erro });

  const pin = await pinUnico();
  const sessao = await supabaseService.create(SESSOES, {
    titulo: titulo.trim(),
    pin,
    criadoPor: caller.id,
    status: "lobby",
    perguntaAtualIndex: -1,
    perguntaIniciadaEm: null,
    criadoEm: Date.now(),
  });

  const perguntasCriadas = [];
  for (let i = 0; i < perguntas.length; i++) {
    const p = perguntas[i];
    perguntasCriadas.push(
      await supabaseService.create(PERGUNTAS, {
        quizSessaoId: sessao.id,
        ordem: i,
        enunciado: p.enunciado.trim(),
        opcoes: p.opcoes.map((o) => o.trim()),
        corretaIndex: p.corretaIndex,
        tempoSegundos: Number(p.tempoSegundos) > 0 ? Number(p.tempoSegundos) : 20,
      })
    );
  }

  res.status(201).json({ ...sessao, perguntas: perguntasCriadas });
}

// Monta o detalhe completo (sessão + perguntas + participantes + respostas
// da pergunta corrente) — usado tanto pelo GET quanto pelo PATCH /avancar,
// que precisa devolver a MESMA forma: o frontend guarda a resposta direto
// em uiState.quizApresentarDados (ver btnQuizAvancar, events.js) e
// renderiza sem esperar o próximo poll — se avancarQuiz devolvesse só a
// sessão crua (sem perguntas/participantes), o render seguinte quebrava em
// "Cannot read properties of undefined (reading 'length')" (dados.perguntas
// undefined), mesmo com o avanço em si já tendo sido salvo com sucesso.
async function montarDetalhe(sessao) {
  const perguntas = (await supabaseService.listWhere(PERGUNTAS, [["quizSessaoId", "==", sessao.id]])).sort((a, b) => a.ordem - b.ordem);
  const participantes = (await supabaseService.listWhere(PARTICIPANTES, [["quizSessaoId", "==", sessao.id]])).sort((a, b) => b.pontuacao - a.pontuacao);

  // Só a pergunta corrente interessa pro host (contagem de "X responderam" em
  // 'pergunta', distribuição por opção em 'revelacao') — nunca as anteriores.
  const perguntaAtual = perguntas[sessao.perguntaAtualIndex] || null;
  let respostasAtuais = [];
  if (perguntaAtual && (sessao.status === "pergunta" || sessao.status === "revelacao")) {
    respostasAtuais = await supabaseService.listWhere(RESPOSTAS, [["quizPerguntaId", "==", perguntaAtual.id]]);
  }

  return { ...sessao, perguntas, participantes, respostasAtuais };
}

async function getQuiz(req, res) {
  const caller = await getCaller(req);
  const sessao = await supabaseService.getById(SESSOES, req.params.id);
  if (!sessao) return res.status(404).json({ error: "not_found" });
  if (!assertDonoQuiz(caller, sessao)) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode ver quizzes que criou." });
  }
  res.json(await montarDetalhe(sessao));
}

// Edita título/perguntas de um quiz que ainda NÃO começou — só faz sentido
// em 'lobby' (nenhum participante respondeu nada ainda, perguntaAtualIndex
// ainda é -1, então trocar as perguntas não bagunça nenhum estado em
// andamento). Reaproveita a MESMA tela de criação no frontend (ver
// btnQuizEditar/quizDraft.editingId, events.js) — diferente de "Reaproveitar
// perguntas" (que sempre cria um quiz NOVO a partir de um encerrado), aqui
// o PIN e o id continuam os mesmos.
async function updateQuiz(req, res) {
  const caller = await getCaller(req);
  const sessao = await supabaseService.getById(SESSOES, req.params.id);
  if (!sessao) return res.status(404).json({ error: "not_found" });
  if (!assertDonoQuiz(caller, sessao)) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode editar quizzes que criou." });
  }
  if (sessao.status !== "lobby") {
    return res.status(409).json({ error: "conflict", message: "Só dá pra editar um quiz antes de iniciar." });
  }
  const { titulo, perguntas } = req.body;
  const erro = validarTituloEPerguntas(titulo, perguntas);
  if (erro) return res.status(400).json({ error: "bad_request", message: erro });

  await supabaseService.update(SESSOES, sessao.id, { titulo: titulo.trim() });

  const existentes = await supabaseService.listWhere(PERGUNTAS, [["quizSessaoId", "==", sessao.id]]);
  for (const p of existentes) {
    await supabaseService.remove(PERGUNTAS, p.id);
  }
  for (let i = 0; i < perguntas.length; i++) {
    const p = perguntas[i];
    await supabaseService.create(PERGUNTAS, {
      quizSessaoId: sessao.id,
      ordem: i,
      enunciado: p.enunciado.trim(),
      opcoes: p.opcoes.map((o) => o.trim()),
      corretaIndex: p.corretaIndex,
      tempoSegundos: Number(p.tempoSegundos) > 0 ? Number(p.tempoSegundos) : 20,
    });
  }

  const atualizado = await supabaseService.getById(SESSOES, sessao.id);
  res.json(await montarDetalhe(atualizado));
}

// Única ação de controle do host — um botão "Avançar" empurra a máquina de
// estado adiante (ver docs do plano): lobby -> pergunta -> revelacao ->
// ranking -> [próxima pergunta ou encerrado]. Mantém tudo num só endpoint
// porque o host nunca precisa "voltar" nem pular estados.
async function avancarQuiz(req, res) {
  const caller = await getCaller(req);
  const sessao = await supabaseService.getById(SESSOES, req.params.id);
  if (!sessao) return res.status(404).json({ error: "not_found" });
  if (!assertDonoQuiz(caller, sessao)) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode controlar quizzes que criou." });
  }
  const perguntas = (await supabaseService.listWhere(PERGUNTAS, [["quizSessaoId", "==", sessao.id]])).sort((a, b) => a.ordem - b.ordem);

  let patch;
  if (sessao.status === "lobby") {
    if (perguntas.length === 0) return res.status(400).json({ error: "bad_request", message: "Quiz sem perguntas." });
    patch = { status: "pergunta", perguntaAtualIndex: 0, perguntaIniciadaEm: Date.now() };
  } else if (sessao.status === "pergunta") {
    patch = { status: "revelacao" };
  } else if (sessao.status === "revelacao") {
    patch = { status: "ranking" };
  } else if (sessao.status === "ranking") {
    const proximoIndex = sessao.perguntaAtualIndex + 1;
    patch = proximoIndex < perguntas.length
      ? { status: "pergunta", perguntaAtualIndex: proximoIndex, perguntaIniciadaEm: Date.now() }
      : { status: "encerrado" };
  } else {
    return res.status(400).json({ error: "bad_request", message: "Quiz já encerrado." });
  }

  const atualizado = await supabaseService.update(SESSOES, sessao.id, patch);
  res.json(await montarDetalhe(atualizado));
}

async function deleteQuiz(req, res) {
  const caller = await getCaller(req);
  const sessao = await supabaseService.getById(SESSOES, req.params.id);
  if (!sessao) return res.status(404).json({ error: "not_found" });
  if (!assertDonoQuiz(caller, sessao)) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir quizzes que criou." });
  }
  await supabaseService.remove(SESSOES, sessao.id);
  res.status(204).send();
}

module.exports = { listQuizzes, createQuiz, getQuiz, updateQuiz, avancarQuiz, deleteQuiz };
