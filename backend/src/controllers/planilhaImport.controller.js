const supabaseService = require("../services/supabaseService");
const { planilhaImportToken } = require("../config/env");
const {
  paraDataISO,
  duracaoEmSegundos,
  paraHoraMinuto,
  dataOperacionalDoSheet,
  escolherRaioX,
} = require("../services/planilhaMatching");

// Corta listas de diagnóstico grandes (a planilha real manda dezenas de
// milhares de linhas de histórico) — sem isso a resposta HTTP e o
// Logger.log do Apps Script (que trunca saída grande) ficam inúteis.
function resumir(lista, limite = 20) {
  return { total: lista.length, amostra: lista.slice(0, limite) };
}

// Roda as atualizações em paralelo, um punhado de cada vez, em vez de uma
// por uma (o gargalo real não era o tamanho do que a planilha manda, era
// esperar cada update no Supabase terminar antes de começar o próximo —
// centenas de linhas x uma viagem de rede cada uma vira minutos à toa).
// Uma falha isolada não derruba as outras — fica registrada em `erros`.
async function executarEmParalelo(itens, concorrencia, fn) {
  const fila = [...itens];
  const erros = [];
  async function trabalhador() {
    while (fila.length) {
      const item = fila.shift();
      try {
        await fn(item);
      } catch (e) {
        erros.push({ item, mensagem: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, itens.length) }, trabalhador));
  return erros;
}

// Chamado pelo Apps Script da planilha de roteirização (fora do requireAuth
// — ver routes/index.js), não por um usuário logado no Kronos. Por isso se
// autentica com um token fixo (PLANILHA_IMPORT_TOKEN) em vez de um Supabase
// ID token.
//
// Pra cada linha, tenta primeiro achar o Raio-X já existente (operação já
// finalizada pelo analista) e atualizar seu horário/duração reais — nunca
// CRIA um Raio-X novo (a finalização em si continua exigindo o fluxo
// normal, com estrelas e observação; isso só corrige o tempo depois que
// ela já existe). Quando não existe Raio-X ainda (operação em curso, ou já
// terminada mas o analista não mandou o Raio-X), grava em
// roteirizacao_status — identificando o analista pelo e-mail da própria
// planilha — pra o card mostrar "iniciado às X" mesmo sem Raio-X nenhum.
async function importarPlanilha(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!planilhaImportToken || token !== planilhaImportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas : [];

  const [todosRaioX, todosUsuarios, todosStatus] = await Promise.all([
    supabaseService.listAll("raioX"),
    supabaseService.listAll("users"),
    supabaseService.listWhere("roteirizacaoStatus", [["data", ">=", dataDiasAtras(10)]]),
  ]);

  // Índice do Raio-X por data OPERACIONAL (a mesma que raio_x.data já
  // guarda) + operação — casa direto, sem converter pra data literal (ver
  // comentário de dataOperacionalDoSheet acima sobre por que essa era a
  // fonte do bug).
  const raioXPorDataOperacao = new Map();
  for (const r of todosRaioX) {
    const chave = `${r.data}|${r.operacao}`;
    if (!raioXPorDataOperacao.has(chave)) raioXPorDataOperacao.set(chave, []);
    raioXPorDataOperacao.get(chave).push(r);
  }

  const idPorEmail = new Map(todosUsuarios.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));

  const statusPorChave = new Map(); // analistaId|operacao|data (operacional) -> linha existente
  for (const s of todosStatus) {
    statusPorChave.set(`${s.analistaId}|${s.operacao}|${s.data}`, s);
  }

  let semDadosSuficientes = 0; // sem operação/data/início — não é erro, planilha ainda incompleta pra essa linha
  let semAnalistaIdentificado = 0; // sem Raio-X e sem e-mail reconhecido — não dá pra saber de quem é
  const naoEncontrados = [];
  const ambiguos = [];
  const invalidos = []; // data/horário que não bateu em nenhum formato conhecido
  const paraAtualizarRaioX = [];
  const paraStatus = []; // {chave, dados} — cria ou atualiza roteirizacao_status

  for (const linha of linhas) {
    const operacao = String(linha.operacao || "").trim();
    const ciclo = String(linha.ciclo || "").trim();
    const inicioTxt = String(linha.inicio || "").trim();
    const fimTxt = String(linha.fim || "").trim();
    const dataTxt = String(linha.data || "").trim();
    const email = String(linha.email || "").trim().toLowerCase();

    if (!operacao || !dataTxt || !inicioTxt) {
      semDadosSuficientes++;
      continue;
    }

    const dataISO = paraDataISO(dataTxt);
    const temFim = !!fimTxt;
    const duracaoSegundos = temFim ? duracaoEmSegundos(inicioTxt, fimTxt) : null;
    if (!dataISO || (temFim && duracaoSegundos == null)) {
      invalidos.push({ data: dataTxt, operacao, ciclo, inicio: inicioTxt, fim: fimTxt });
      continue;
    }

    // Data operacional calculada a partir do horário REAL da linha (não do
    // horário agendado do Raio-X) — ver comentário de dataOperacionalDoSheet
    // no topo do arquivo.
    const dataOperacional = dataOperacionalDoSheet(dataISO, inicioTxt);
    const candidatosRaioX = raioXPorDataOperacao.get(`${dataOperacional}|${operacao}`) || [];
    const escolhido = candidatosRaioX.length ? escolherRaioX(candidatosRaioX, ciclo, inicioTxt) : null;

    if (escolhido) {
      const patch = {
        horaInicioReal: paraHoraMinuto(inicioTxt),
        ciclo: ciclo || escolhido.ciclo || null,
      };
      if (temFim) {
        patch.duracaoSegundos = duracaoSegundos;
        patch.duracaoOrigem = "planilha";
        patch.horaFimReal = paraHoraMinuto(fimTxt);
      }
      paraAtualizarRaioX.push({ id: escolhido.id, patch });
      continue;
    }

    // Sem Raio-X (ainda não enviado, ou candidatos ambíguos demais pra
    // arriscar) — tenta o rastro "ao vivo" via e-mail da planilha.
    const analistaId = idPorEmail.get(email);
    if (!analistaId) {
      semAnalistaIdentificado++;
      if (candidatosRaioX.length > 1) ambiguos.push({ data: dataOperacional, operacao, ciclo, qtd: candidatosRaioX.length });
      else naoEncontrados.push({ data: dataOperacional, operacao, ciclo });
      continue;
    }

    const chave = `${analistaId}|${operacao}|${dataOperacional}`;
    paraStatus.push({
      chave,
      existente: statusPorChave.get(chave) || null,
      dados: {
        analistaId,
        operacao,
        ciclo: ciclo || null,
        data: dataOperacional,
        horaInicioReal: paraHoraMinuto(inicioTxt),
        horaFimReal: temFim ? paraHoraMinuto(fimTxt) : null,
        duracaoSegundos: temFim ? duracaoSegundos : null,
        atualizadoEm: Date.now(),
      },
    });
  }

  const CONCORRENCIA = 20;
  const [errosRaioX, errosStatus] = await Promise.all([
    executarEmParalelo(paraAtualizarRaioX, CONCORRENCIA, (item) => supabaseService.update("raioX", item.id, item.patch)),
    executarEmParalelo(paraStatus, CONCORRENCIA, (item) =>
      item.existente
        ? supabaseService.update("roteirizacaoStatus", item.existente.id, item.dados)
        : supabaseService.create("roteirizacaoStatus", item.dados)
    ),
  ]);

  res.json({
    recebidas: linhas.length,
    atualizados: paraAtualizarRaioX.length - errosRaioX.length,
    statusAoVivo: paraStatus.length - errosStatus.length,
    semDadosSuficientes,
    semAnalistaIdentificado,
    naoEncontrados: resumir(naoEncontrados),
    ambiguos: resumir(ambiguos),
    invalidos: resumir(invalidos),
    errosAtualizacao: resumir(errosRaioX),
    errosStatus: resumir(errosStatus),
  });
}

function dataDiasAtras(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

module.exports = { importarPlanilha };
