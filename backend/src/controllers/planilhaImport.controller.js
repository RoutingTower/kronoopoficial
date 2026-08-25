const supabaseService = require("../services/supabaseService");
const { planilhaImportToken } = require("../config/env");

// A planilha manda a data como texto — aceita tanto "DD/MM/YYYY" (o que a
// aba realmente usa) quanto "YYYY-MM-DD" (caso um dia a formatação mude),
// sempre devolvendo ISO pra bater com a coluna raio_x.data.
function paraDataISO(valor) {
  const s = String(valor || "").trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

// Aceita "HH:MM" ou "HH:MM:SS" (a planilha manda com segundos).
function paraSegundosDoDia(valor) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(valor || "").trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

// Duração em segundos entre início e fim, cruzando meia-noite se o fim for
// menor/igual ao início (mesma ideia de calcularDuracaoManual no frontend,
// só que com precisão de segundos, já que a planilha traz os segundos).
function duracaoEmSegundos(inicio, fim) {
  const ini = paraSegundosDoDia(inicio);
  const fimSeg0 = paraSegundosDoDia(fim);
  if (ini == null || fimSeg0 == null) return null;
  let fimSeg = fimSeg0;
  if (fimSeg <= ini) fimSeg += 24 * 3600;
  return fimSeg - ini;
}

// "HH:MM:SS" ou "HH:MM" -> "HH:MM" (sem segundos, com zero à esquerda) —
// só pra exibição (início/fim reais no card). A duração continua com
// precisão de segundos, guardada à parte.
function paraHoraMinuto(valor) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(valor || "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// raio_x.data é o "dia operacional" do turno (o turno inteiro conta pro dia
// em que começou, mesmo virando a madrugada — mesma convenção de
// hourSortValue/slotTimestamp no frontend), mas a planilha registra a data
// literal do relógio: uma operação de madrugada que o Kronos guarda como
// "21/08" (turno começou dia 21) aparece na planilha como "22/08" (a hora
// real já é depois da meia-noite). dataOperacionalDoSheet faz esse caminho
// (literal -> operacional) usando o horário REAL de cada linha da planilha
// — é o que garante achar o Raio-X certo mesmo quando a execução real
// escorrega pra antes ou depois da meia-noite em relação ao horário
// agendado (ver escolherRaioX/candidatosRaioX abaixo: casar direto pela
// data operacional evita o bug de indexar pelo horário AGENDADO do
// Raio-X, que é fixo e não reflete a variação real dia a dia — via
// Hub_SP_Araraquara em produção, agendado 01:00 mas a execução real de um
// dia caiu antes da virada e a de outro depois, e indexar pelo agendado
// jogava as duas linhas da planilha pro MESMO Raio-X, deixando o outro
// Raio-X inalcançável pra sempre).
function dataOperacionalDoSheet(dataCalendario, hora) {
  const h = parseInt(String(hora).split(":")[0], 10);
  if (h >= 7) return dataCalendario;
  const [y, m, d] = dataCalendario.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

// Mesma convenção de hourSortValue no frontend: madrugada (antes das 7h)
// conta como depois da meia-noite anterior, pra medir distância de horário
// direito entre um turno que já cruzou a virada e o hora agendado do Raio-X.
function segundosAjustados(segundos) {
  return segundos < 7 * 3600 ? segundos + 24 * 3600 : segundos;
}

// Janela de tolerância pra casar por horário quando o ciclo não bate — 3h
// cobre a folga normal entre horário agendado e início real sem risco de
// confundir com outro ciclo do mesmo hub mais tarde no dia (esses costumam
// ficar bem mais distantes que isso).
const TOLERANCIA_HORARIO_SEG = 3 * 60 * 60;

// Acha, entre os Raio-X da mesma operação+data (candidatos, todos os
// ciclos), qual é o certo pra essa linha da planilha: 1) ciclo bate exato
// (caminho normal — registro antigo sem ciclo gravado conta como "qualquer
// ciclo"); 2) senão, cai pro horário — se o início real cai perto o
// bastante (TOLERANCIA_HORARIO_SEG) do horário agendado de UM único
// candidato, considera esse mesmo com o rótulo do ciclo não batendo. Só
// aceita se o mais próximo estiver claramente à frente do segundo colocado
// — candidatos igualmente próximos (ex.: dois ciclos no mesmo horário)
// continuam null (ambíguo), não arrisca escolher errado.
function escolherRaioX(candidatos, ciclo, inicioTxt) {
  const cicloExato = candidatos.filter((r) => ciclo && r.ciclo && r.ciclo === ciclo);
  if (cicloExato.length === 1) return cicloExato[0];
  if (cicloExato.length > 1) return null; // não deveria acontecer, mas não arrisca

  const inicioSeg = paraSegundosDoDia(inicioTxt);
  const comDistancia = candidatos
    .map((r) => {
      const horaSeg = paraSegundosDoDia(r.hora);
      const d = inicioSeg == null || horaSeg == null
        ? Infinity
        : Math.abs(segundosAjustados(inicioSeg) - segundosAjustados(horaSeg));
      return { r, d };
    })
    .filter((x) => x.d <= TOLERANCIA_HORARIO_SEG)
    .sort((a, b) => a.d - b.d);
  if (comDistancia.length === 1 || (comDistancia.length > 1 && comDistancia[1].d - comDistancia[0].d >= 600)) {
    return comDistancia[0].r;
  }
  return null;
}

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
