// Report automático no SeaTalk (hora a hora + fechamento de turno) — quem
// dispara é o mesmo Apps Script que já importa a planilha de roteirização
// (um gatilho de hora em hora à parte, não os 5min do de sempre), passando
// explicitamente qual dia/janela de hora quer reportar. De propósito: o
// Apps Script já resolve o fuso horário corretamente (Session.
// getScriptTimeZone(), comprovado pelo enviarParaKronos existente) —
// deixar o SERVIDOR (Render, provavelmente UTC) tentar adivinhar "que hora
// é agora no Brasil" seria arriscar um bug de fuso bem mais chato de achar
// depois. Esse endpoint só monta o texto com o que já veio pronto e manda
// pro webhook do SeaTalk.

const supabaseService = require("../services/supabaseService");
const { seatalkReportToken, seatalkWebhookUrl, seatalkSuporteWebhookUrl } = require("../config/env");

const COLLECTION = "raioX";

// Assinatura do report de fechamento — pedido explícito pra não sumir quem
// é o responsável pelo relatório automático.
const ELABORADO_POR = "Thiago Ribeiro";

// SLA específico da lista de "ofensores" deste report — 1h10min, pedido
// explícito do usuário. Independente do SLA de 1h usado no card do
// analista (SLA_TEMPO_EXECUCAO_SEGUNDOS, frontend/js/utils.js) — os dois
// não precisam ser o mesmo número, são critérios diferentes (um é "acima
// do SLA" pro analista, o outro é "vale reportar pro turno inteiro").
const SLA_SEGUNDOS = 70 * 60;
const LIMITE_SPR_ALTO = 120;
const LIMITE_SPR_BAIXO = 90;
const LIMITE_ORFAOS = 40;

// Listas de ofensores/SPR alto/SPR baixo/órfãos mostram só os TOP_N_LISTA
// piores (já vêm ordenadas por gravidade) — com o turno inteiro (~90 hubs)
// essas listas viravam a maior parte do report e empurravam o tamanho da
// mensagem pra cima do limite do SeaTalk (ver enviarParaSeatalkEmPartes).
// Pedido explícito do usuário: focar no que mais importa em vez de listar
// tudo. Sempre mostra quantos ficaram de fora ("+N hub(s)") pra não esconder
// o tamanho real do problema.
const TOP_N_LISTA = 3;
function pushMais(linhas, total, mostrados) {
  if (total > mostrados) linhas.push(`+ ${total - mostrados} hub(s) também nessa lista.`);
}

// Mesma convenção de virada de madrugada do resto do app (hourSortValue,
// frontend/js/utils.js) — hora antes das 7h conta como "depois" da noite
// anterior, pra comparar/ordenar corretamente dentro do turno 19h–06h.
function horaValor(hora) {
  const h = parseInt(String(hora || "0").split(":")[0], 10);
  return h < 7 ? h + 24 : h;
}

function formatarDuracao(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatarNumero(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

// Mini-histórico visual de SPR — uma seta por dia dentro da janela,
// comparando com o dia anterior (📈 subiu, 📉 caiu, ➡️ igual), pra bater o
// olho na tendência da semana sem abrir o Resultado SPR. Só entra no report
// quando tem pelo menos 2 dias com SPR na janela (senão não tem o que
// comparar). O primeiro dia da janela não tem seta própria (▪️, nada antes
// dele pra comparar).
function tendenciaSemanalTxt(rowsJanela) {
  const porDia = new Map();
  rowsJanela
    .filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null)
    .forEach((r) => {
      if (!porDia.has(r.data)) porDia.set(r.data, { soma: 0, count: 0 });
      const d = porDia.get(r.data);
      d.soma += r.sprRoteirizado;
      d.count += 1;
    });
  const dias = [...porDia.keys()].sort();
  if (dias.length < 2) return null;
  const medias = dias.map((d) => porDia.get(d).soma / porDia.get(d).count);
  const setas = medias.map((m, i) => {
    if (i === 0) return "▪️";
    if (m > medias[i - 1]) return "📈";
    if (m < medias[i - 1]) return "📉";
    return "➡️";
  });
  return setas.join("");
}

// Mesma convenção de dias da base mestra do frontend (WEEKDAYS/bmRodaNoDia,
// frontend/js/utils.js) — portado aqui porque o backend não importa código
// do frontend. dataStr sem componente de hora: getDay() bate com o dia
// certo independente do fuso do processo (Render roda em UTC), já que uma
// string "yyyy-MM-ddT00:00:00" sem offset não cruza dia nenhuma hora.
const WEEKDAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
function bmRodaNoDia(bm, dataStr) {
  if (dataStr < bm.dataInicio || dataStr > bm.dataFim) return false;
  if (!bm.dias || bm.dias.length === 0) return true;
  const weekday = WEEKDAYS_PT[new Date(dataStr + "T00:00:00").getDay()];
  return bm.dias.includes(weekday);
}

// Operações que DEVERIAM ter Raio-X nessa data — mesmo raciocínio de
// getDaySlots (frontend/js/utils.js), simplificado pra só o que o report
// precisa (operação/ciclo/horário/quem é o responsável — não a agenda
// completa de ninguém). Cobertura (ausência com suplente, ou suplência
// avulsa) troca quem é o responsável esperado, mas o hub continua contando
// — o titular de folga sem ninguém cobrindo (suplenteId nulo) não entra:
// nesse caso não tem quem cobrar Raio-X ainda, é problema de escala, não
// de execução. supervisorId (opcional) escopa pelo DONO original do hub
// (base_mestra.analistaId), não por quem efetivamente cobre — é o hub que
// pertence à equipe, mesmo se um suplente de fora vier ajudar.
async function operacoesEsperadas(data, supervisorId) {
  const [usuarios, baseMestra, ausencias, suplencias] = await Promise.all([
    supabaseService.listAll("users"),
    supabaseService.listAll("baseMestra"),
    supabaseService.listWhere("ausencias", [["data", "==", data]]),
    supabaseService.listWhere("suplencias", [["dataCobertura", "==", data]]),
  ]);
  const donoNaEquipe = (analistaId) => !supervisorId || usuarios.find((u) => u.id === analistaId)?.supervisorId === supervisorId;

  const esperadas = [];
  baseMestra
    .filter((bm) => bmRodaNoDia(bm, data) && donoNaEquipe(bm.analistaId))
    .forEach((bm) => {
      const aus = ausencias.find((a) => a.baseMestraId === bm.id);
      if (aus) {
        if (!aus.suplenteId) return;
        const sup = usuarios.find((u) => u.id === aus.suplenteId);
        esperadas.push({ operacao: bm.operacao, ciclo: bm.ciclo, horaInicio: bm.horaInicio, responsavelNome: sup?.name || aus.suplenteNome || "—" });
      } else {
        esperadas.push({ operacao: bm.operacao, ciclo: bm.ciclo, horaInicio: bm.horaInicio, responsavelNome: bm.titular });
      }
    });

  suplencias.filter((s) => donoNaEquipe(s.analistaOriginalId)).forEach((s) => {
    esperadas.push({ operacao: s.operacao, ciclo: s.ciclo, horaInicio: s.horaInicio, responsavelNome: s.suplente });
  });

  return esperadas;
}

// Cruza o esperado com o que já tem Raio-X (rows) — casa só por
// operação+horário (a mesma convenção de chave já usada em todo o resto do
// app pra SPR/Links SeaTalk: nome de operação é único). Não exige bater o
// analistaId porque o objetivo aqui é "esse hub foi finalizado por
// ALGUÉM", não "por quem era esperado".
function separarNaoFinalizados(esperadas, rowsDoDia) {
  return esperadas.filter((e) => !rowsDoDia.some((r) => r.operacao === e.operacao && r.hora === e.horaInicio));
}

// Mesma convenção de extração de UF do nome do hub do frontend
// (ufDaOperacao, frontend/js/utils.js — "LM Hub_UF_Cidade...", 92/92 hubs
// reais seguem esse padrão). Hub fora do padrão simplesmente não entra na
// comparação por UF (retorna ''), igual ao frontend.
function ufDaOperacao(operacao) {
  const m = /^LM Hub_([A-Za-z]{2})_/.exec(operacao || "");
  return m ? m[1].toUpperCase() : "";
}

function diaAnterior(dataStr, dias = 1) {
  const d = new Date(dataStr + "T12:00:00");
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function formatarDataBR(dataStr) {
  const [, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}`;
}

// Média de SPR agrupada por uma chave (operação ou UF) — só entre linhas
// COM SPR lançado (mesmo filtro de sempre: sem "sem roteirização" e sem
// sprRoteirizado nulo). `count` fica junto do resultado de propósito: quem
// usa isso (montarAnaliseDiaria) precisa saber o TAMANHO da amostra antes
// de atribuir qualquer variação a uma chave — ver LIMITE_MIN_AMOSTRA_UF.
function mediaSprPorChave(rows, chaveFn) {
  const somas = new Map();
  rows
    .filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null)
    .forEach((r) => {
      const chave = chaveFn(r);
      if (!chave) return;
      if (!somas.has(chave)) somas.set(chave, { soma: 0, count: 0 });
      const d = somas.get(chave);
      d.soma += r.sprRoteirizado;
      d.count += 1;
    });
  const out = new Map();
  somas.forEach((d, chave) => out.set(chave, { media: d.soma / d.count, count: d.count }));
  return out;
}

// Só atribui a variação do dia a um estado (UF) se os dois dias tiverem
// pelo menos essa quantidade de finalizações COM SPR naquele estado — sem
// isso, 1 hub com SPR ruim por acaso já "explicaria" o dia inteiro, o que
// não é uma leitura confiável. Pedido explícito: "atribui as variações a
// volumetria se possível".
const LIMITE_MIN_AMOSTRA_UF = 3;

// "Oportunidade de clusterização" (fechamento) — só entra na lista quem tem
// pelo menos essa quantidade de finalizações COM meta cadastrada nos
// últimos DIAS_JANELA_CLUSTER dias, pra não apontar uma operação por causa
// de 1 dia ruim isolado.
const LIMITE_MIN_AMOSTRA_CLUSTER = 2;
const DIAS_JANELA_CLUSTER = 7;
// Sem esses dois filtros, a lista vira quase a operação inteira — com só
// 6-7 finalizações por semana, é normal a média ficar alguns pontos abaixo
// da meta por variação natural, não por um problema real de malha. Só
// entra quem fica consistentemente MUITO abaixo (gap mínimo), e mesmo
// assim a lista fica curta (top N piores), pra continuar acionável.
const LIMITE_GAP_CLUSTER = 8;
const TOP_N_CLUSTER = TOP_N_LISTA;

// Média de SPR Lançado x Meta por operação numa janela de dias — quem fica
// consistentemente abaixo da própria meta é candidato a revisão de
// clusterização (a operação, não o analista: é sobre a malha, não sobre
// quem executou). rowsJanela já vem filtrado pela equipe (se aplicável) e
// pela janela de datas por quem chama.
function operacoesAbaixoMetaNaJanela(rowsJanela) {
  const porOperacao = new Map();
  rowsJanela
    .filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null && r.sprMeta != null)
    .forEach((r) => {
      if (!porOperacao.has(r.operacao)) porOperacao.set(r.operacao, { sprSoma: 0, metaSoma: 0, count: 0 });
      const d = porOperacao.get(r.operacao);
      d.sprSoma += r.sprRoteirizado;
      d.metaSoma += r.sprMeta;
      d.count += 1;
    });
  const resultado = [];
  porOperacao.forEach((d, operacao) => {
    if (d.count < LIMITE_MIN_AMOSTRA_CLUSTER) return;
    const sprMedio = d.sprSoma / d.count;
    const metaMedia = d.metaSoma / d.count;
    if (metaMedia - sprMedio >= LIMITE_GAP_CLUSTER) resultado.push({ operacao, sprMedio, metaMedia, count: d.count });
  });
  return resultado.sort((a, b) => (a.sprMedio - a.metaMedia) - (b.sprMedio - b.metaMedia)).slice(0, TOP_N_CLUSTER);
}

async function enviarParaSeatalk(texto, webhookUrl) {
  const url = webhookUrl || seatalkWebhookUrl;
  if (!url) throw new Error("Webhook do SeaTalk não configurado.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag: "text", text: { content: texto } }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`SeaTalk respondeu ${res.status}: ${corpo}`);
  }
}

// Achado real em produção: o report de fechamento unificado (4188
// caracteres) voltou "enviado:true" (SeaTalk respondeu 2xx pro POST) mas
// nunca apareceu no grupo, enquanto o hora a hora (872 caracteres) no MESMO
// webhook, na MESMA execução, chegou normalmente — assinatura de um limite
// de tamanho de mensagem do lado do SeaTalk que descarta silenciosamente
// depois de aceitar a chamada, sem devolver erro. LIMITE_CARACTERES_MENSAGEM
// é uma margem conservadora (não documentada pelo SeaTalk); divide por
// linha inteira pra nunca cortar uma seção no meio.
const LIMITE_CARACTERES_MENSAGEM = 2500;
function dividirEmPartes(texto, limite = LIMITE_CARACTERES_MENSAGEM) {
  const linhas = texto.split("\n");
  const partes = [];
  let atual = "";
  for (const linha of linhas) {
    const candidato = atual ? `${atual}\n${linha}` : linha;
    if (candidato.length > limite && atual) {
      partes.push(atual);
      atual = linha;
    } else {
      atual = candidato;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

// Manda em várias mensagens sequenciais quando o texto passa do limite —
// substitui toda chamada direta a enviarParaSeatalk nos reports (que podem
// crescer bastante, ex.: fechamento com o turno inteiro) por esta função.
// Quando cabe numa mensagem só, o comportamento é idêntico a antes (1 parte,
// sem prefixo de contagem).
async function enviarParaSeatalkEmPartes(texto, webhookUrl) {
  const partes = dividirEmPartes(texto);
  for (let i = 0; i < partes.length; i++) {
    const prefixo = partes.length > 1 ? `(${i + 1}/${partes.length})\n` : "";
    await enviarParaSeatalk(prefixo + partes[i], webhookUrl);
  }
}

function montarFechamento(rows, horaFechamento, nomeSupervisor, naoFinalizados, rowsUltimosDias, rowsOntem, dataHoje, dataOntem) {
  naoFinalizados = naoFinalizados || [];
  rowsUltimosDias = rowsUltimosDias || [];
  // Análise diária (hoje vs ontem) embutida NO MESMO report, não mais uma
  // mensagem separada — pedido explícito. Só calcula quando tem ontem pra
  // comparar; sem isso, o consolidado cai pros números simples de sempre.
  const tendencia = rowsOntem && rowsOntem.length ? computarTendenciaDiaria(rows, rowsOntem) : null;
  const analisados = rows.length;
  const roteirizados = rows.filter((r) => r.duracaoSegundos != null).length;
  const comSpr = rows.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const sprMedio = comSpr.length ? Math.round(comSpr.reduce((s, r) => s + r.sprRoteirizado, 0) / comSpr.length) : 0;
  const totalOrfaos = rows.reduce((s, r) => s + (r.orfaos || 0), 0);
  const totalPedidos = rows.reduce((s, r) => s + (r.pedRoteirizados || 0), 0);
  const totalRotas = rows.reduce((s, r) => s + (r.rotasFinal || 0), 0);

  const ofensores = rows.filter((r) => r.duracaoSegundos != null && r.duracaoSegundos > SLA_SEGUNDOS).sort((a, b) => b.duracaoSegundos - a.duracaoSegundos);
  const sprAlto = comSpr.filter((r) => r.sprRoteirizado >= LIMITE_SPR_ALTO).sort((a, b) => b.sprRoteirizado - a.sprRoteirizado);
  const sprBaixo = comSpr.filter((r) => r.sprRoteirizado < LIMITE_SPR_BAIXO).sort((a, b) => a.sprRoteirizado - b.sprRoteirizado);
  const comOrfaos = rows.filter((r) => (r.orfaos || 0) > LIMITE_ORFAOS).sort((a, b) => b.orfaos - a.orfaos);
  const pendentes = naoFinalizados.slice().sort((a, b) => horaValor(a.horaInicio) - horaValor(b.horaInicio));

  // Operações consistentemente abaixo da própria meta de SPR nos últimos
  // DIAS_JANELA_CLUSTER dias — candidatas a revisão de clusterização.
  // Volumetria/SPR "de hoje" (rowPorOperacaoHoje, quando a operação rodou no
  // turno) dão contexto de como ela se saiu especificamente nesse
  // fechamento. Calculado aqui em cima (não junto da seção) porque
  // "prioridade máxima" abaixo precisa cruzar com `ofensores`.
  const rowPorOperacaoHoje = new Map();
  rows.forEach((r) => rowPorOperacaoHoje.set(r.operacao, r));
  const clusterizacao = operacoesAbaixoMetaNaJanela(rowsUltimosDias);

  // Hub que está LENTO hoje (ofensores) E cronicamente abaixo da própria
  // meta de SPR (clusterização) é o sinal mais forte de que tem algo
  // estrutural na malha, não um dia ruim isolado — pedido explícito do
  // usuário, com dois exemplos reais confirmando o padrão (Salvador_Retiro,
  // Juazeiro apareceram nas duas listas em turnos diferentes).
  const operacoesOfensoras = new Set(ofensores.map((r) => r.operacao));
  const prioridadeMaxima = clusterizacao.filter((c) => operacoesOfensoras.has(c.operacao));

  const tituloData = dataHoje ? ` — ${formatarDataBR(dataHoje)}${dataOntem ? ` (vs. ${formatarDataBR(dataOntem)})` : ""}` : "";

  // Resumo executivo — 1 linha com o veredito do turno, pra quem só quer o
  // essencial sem ler o report inteiro. 🔴 se tem prioridade máxima (o pior
  // sinal: lento hoje E cronicamente abaixo da meta), 🟡 se só tem ofensor
  // de tempo ou SPR caiu vs ontem, 🟢 se nada disso.
  const resumoPartes = [];
  if (tendencia) resumoPartes.push(`SPR ${tendencia.deltaGeral >= 0 ? "subiu" : tendencia.deltaGeral < 0 ? "caiu" : "ficou estável"}${tendencia.deltaPct != null ? ` ${tendencia.deltaPct >= 0 ? "+" : ""}${tendencia.deltaPct.toFixed(1)}%` : ""} vs ontem`);
  if (prioridadeMaxima.length > 0) resumoPartes.push(`${prioridadeMaxima.length} hub(s) em prioridade máxima`);
  else if (ofensores.length > 0) resumoPartes.push(`${ofensores.length} hub(s) acima do SLA`);
  const resumoEmoji = prioridadeMaxima.length > 0 ? "🔴" : (ofensores.length > 0 || (tendencia && tendencia.deltaGeral < 0)) ? "🟡" : "🟢";
  const linhas = [];
  linhas.push(`📢 REPORT DE FECHAMENTO | ${horaFechamento}`, `Elaborado por ${ELABORADO_POR}`, "");
  linhas.push(`${resumoEmoji} RESUMO: ${resumoPartes.length ? resumoPartes.join(", ") + "." : "turno tranquilo, sem alertas."}`, "");
  linhas.push(`📊 CONSOLIDADO ${nomeSupervisor ? nomeSupervisor.toUpperCase() : "GERAL"}${tituloData}`, "");
  linhas.push(`• Hubs analisados: ${analisados}${tendencia ? ` (ontem: ${rowsOntem.length})` : ""}`);
  linhas.push(`• Hubs roteirizados: ${roteirizados}`);
  if (tendencia) {
    linhas.push(`• SPR médio: ${tendencia.sprMedioHoje.toFixed(1)} (ontem: ${tendencia.sprMedioOntem.toFixed(1)})${tendencia.deltaPct != null ? ` → ${tendencia.deltaPct >= 0 ? "+" : ""}${tendencia.deltaPct.toFixed(1)}% ${tendencia.deltaGeral >= 0 ? "📈" : "📉"}` : ""}`);
    linhas.push(`• Hubs abaixo da meta: ${tendencia.abaixoMetaHoje} (ontem: ${tendencia.abaixoMetaOntem})`);
  } else {
    linhas.push(`• SPR médio: ${sprMedio}`);
  }
  linhas.push(`• Total de órfãos: ${formatarNumero(totalOrfaos)}`);
  if (tendencia) {
    linhas.push(`• Pedidos roteirizados: ${formatarNumero(totalPedidos)} (ontem: ${formatarNumero(tendencia.totalPedidosOntem)})${tendencia.deltaPedidosPct != null ? ` → ${tendencia.deltaPedidosPct >= 0 ? "+" : ""}${tendencia.deltaPedidosPct.toFixed(1)}%` : ""}`);
    linhas.push(`• Rotas: ${formatarNumero(totalRotas)} (ontem: ${formatarNumero(tendencia.totalRotasOntem)})${tendencia.deltaRotasPct != null ? ` → ${tendencia.deltaRotasPct >= 0 ? "+" : ""}${tendencia.deltaRotasPct.toFixed(1)}%` : ""}`);
  } else {
    linhas.push(`• Pedidos roteirizados: ${formatarNumero(totalPedidos)}`);
    linhas.push(`• Rotas: ${formatarNumero(totalRotas)}`);
  }
  const sparkline = tendenciaSemanalTxt(rowsUltimosDias);
  if (sparkline) linhas.push(`• Tendência ${DIAS_JANELA_CLUSTER}d: ${sparkline}`);
  linhas.push("");

  if (tendencia) {
    linhas.push("🏆 MAIOR EVOLUÇÃO (vs ontem)", "");
    if (tendencia.maiorEvolucao.length === 0) {
      linhas.push("Nenhuma operação com SPR maior que ontem.");
    } else {
      tendencia.maiorEvolucao.forEach((d) => linhas.push(`🟢 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (+${d.delta.toFixed(0)})${tendencia.volumeHojeTxt(d.operacao)}`));
    }
    linhas.push("");

    linhas.push("⚠️ MAIOR QUEDA (vs ontem)", "");
    if (tendencia.maiorQueda.length === 0) {
      linhas.push("Nenhuma operação com SPR menor que ontem.");
    } else {
      tendencia.maiorQueda.forEach((d) => linhas.push(`🔴 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (${d.delta.toFixed(0)})${tendencia.volumeHojeTxt(d.operacao)}`));
    }
    linhas.push("");

    if (tendencia.ufAlta || tendencia.ufBaixa) {
      const partes = [];
      if (tendencia.ufAlta) partes.push(`${tendencia.ufAlta.uf} foi o estado que mais puxou a alta de hoje (SPR médio +${tendencia.ufAlta.delta.toFixed(1)}, ${tendencia.ufAlta.countHoje} hubs)`);
      if (tendencia.ufBaixa) partes.push(`${tendencia.ufBaixa.uf} foi o que mais recuou (${tendencia.ufBaixa.delta.toFixed(1)}, ${tendencia.ufBaixa.countHoje} hubs)`);
      linhas.push(`📍 ${partes.join(" — ")}.`);
    } else {
      linhas.push("📍 Sem volume suficiente pra atribuir a variação a um estado específico hoje.");
    }
    linhas.push("");
  }

  if (prioridadeMaxima.length > 0) {
    linhas.push("⚠️ PRIORIDADE MÁXIMA — lento hoje E cronicamente abaixo da meta", "");
    prioridadeMaxima.forEach((c) => linhas.push(`🔺 ${c.operacao} — SPR médio ${DIAS_JANELA_CLUSTER}d: ${c.sprMedio.toFixed(0)} (REF ${c.metaMedia.toFixed(0)}) | passou de ${formatarDuracao(SLA_SEGUNDOS)} hoje`));
    linhas.push("");
  }

  // Pedidos/Rotas/Órfãos ao lado do SPR nos dois extremos — pedido
  // explícito pra correlacionar/justificar o SPR ofensor: um SPR muito alto
  // ou muito baixo costuma ter explicação na volumetria (poucas rotas pra
  // muito pedido, ou o contrário) ou na quantidade de órfãos.
  const correlacaoTxt = (r) => {
    const partes = [];
    if (r.pedRoteirizados != null) partes.push(`Ped ${formatarNumero(r.pedRoteirizados)}`);
    if (r.rotasFinal != null) partes.push(`Rot ${formatarNumero(r.rotasFinal)}`);
    partes.push(`Órf ${r.orfaos ?? 0}`);
    return partes.join(" | ");
  };

  linhas.push(`🚨 HUBS OFENSORES — OPERAÇÃO SUPERIOR A ${formatarDuracao(SLA_SEGUNDOS)} (top ${TOP_N_LISTA})`, "");
  if (ofensores.length === 0) {
    linhas.push(`✅ Nenhum hub passou de ${formatarDuracao(SLA_SEGUNDOS)} de operação.`);
  } else {
    ofensores.slice(0, TOP_N_LISTA).forEach((r) => {
      const horario = `${r.horaInicioReal || r.hora} às ${r.horaFimReal || "—"}`;
      const sprTxt = r.sprRoteirizado != null ? r.sprRoteirizado : "aguardando planilha";
      linhas.push(`🔴 ${r.operacao} — ${horario} | Tempo: ${formatarDuracao(r.duracaoSegundos)} | SPR ${sprTxt} | Órf ${r.orfaos ?? 0}`);
    });
    pushMais(linhas, ofensores.length, TOP_N_LISTA);
  }
  linhas.push("");

  linhas.push(`📈 HUBS COM SPR ${LIMITE_SPR_ALTO}+ (top ${TOP_N_LISTA})`, "");
  if (sprAlto.length === 0) {
    linhas.push(`✅ Nenhum hub com SPR igual ou acima de ${LIMITE_SPR_ALTO}.`);
  } else {
    sprAlto.slice(0, TOP_N_LISTA).forEach((r) => linhas.push(`🟠 ${r.operacao} | SPR ${r.sprRoteirizado} | ${correlacaoTxt(r)}`));
    pushMais(linhas, sprAlto.length, TOP_N_LISTA);
  }
  linhas.push("");

  linhas.push(`📉 HUBS COM SPR ABAIXO DE ${LIMITE_SPR_BAIXO} (top ${TOP_N_LISTA})`, "");
  if (sprBaixo.length === 0) {
    linhas.push(`✅ Nenhum hub ficou com SPR abaixo de ${LIMITE_SPR_BAIXO}.`);
  } else {
    sprBaixo.slice(0, TOP_N_LISTA).forEach((r) => linhas.push(`🟡 ${r.operacao} | SPR ${r.sprRoteirizado} | ${correlacaoTxt(r)}`));
    pushMais(linhas, sprBaixo.length, TOP_N_LISTA);
  }
  linhas.push("");

  linhas.push(`📦 HUBS COM MAIS DE ${LIMITE_ORFAOS} ÓRFÃOS (top ${TOP_N_LISTA})`, "");
  if (comOrfaos.length === 0) {
    linhas.push(`✅ Nenhum hub com mais de ${LIMITE_ORFAOS} órfãos.`);
  } else {
    comOrfaos.slice(0, TOP_N_LISTA).forEach((r) => {
      // Mesma correlação de Pedidos/Rotas/SPR já mostrada nos extremos de
      // SPR — fazia falta aqui também, pedido explícito.
      const partes = [`Órf ${formatarNumero(r.orfaos)}`];
      if (!r.semRoteirizacao && r.sprRoteirizado != null) partes.push(`SPR ${r.sprRoteirizado}`);
      if (r.pedRoteirizados != null) partes.push(`Ped ${formatarNumero(r.pedRoteirizados)}`);
      if (r.rotasFinal != null) partes.push(`Rot ${formatarNumero(r.rotasFinal)}`);
      const clusters = r.orfaosClustersOfensores ? ` — ${r.orfaosClustersOfensores}` : "";
      linhas.push(`🔵 ${r.operacao} | ${partes.join(" | ")}${clusters}`);
    });
    pushMais(linhas, comOrfaos.length, TOP_N_LISTA);
  }
  linhas.push("");

  linhas.push(`🔬 OPORTUNIDADE DE CLUSTERIZAÇÃO — ${LIMITE_GAP_CLUSTER}+ pontos abaixo do SPR referencial nos últimos ${DIAS_JANELA_CLUSTER} dias (top ${TOP_N_CLUSTER})`, "");
  if (clusterizacao.length === 0) {
    linhas.push("✅ Nenhuma operação consistentemente abaixo da meta de SPR na janela analisada.");
  } else {
    clusterizacao.forEach((c) => {
      const hoje = rowPorOperacaoHoje.get(c.operacao);
      const volumeHoje = hoje
        ? ` | Hoje: SPR ${hoje.sprRoteirizado ?? "—"}${hoje.pedRoteirizados != null ? ` | Ped ${formatarNumero(hoje.pedRoteirizados)}` : ""}${hoje.rotasFinal != null ? ` | Rot ${formatarNumero(hoje.rotasFinal)}` : ""}`
        : " | Não rodou nesse turno";
      linhas.push(`🔸 ${c.operacao} — SPR médio ${DIAS_JANELA_CLUSTER}d: ${c.sprMedio.toFixed(0)} (REF ${c.metaMedia.toFixed(0)}, ${c.count} finalização(ões))${volumeHoje}`);
    });
  }
  linhas.push("");

  // "Ainda sem Raio-X" vai por último de propósito: às 05h (fim do turno)
  // é a lista menos acionável de todas (não dá mais pra fazer nada a
  // respeito NESSE turno) e pode ficar grande — antes vinha logo depois do
  // consolidado e empurrava os alertas mais úteis (Ofensores,
  // Clusterização) pra baixo, com risco de ficar escondido atrás do "ver
  // mais" do SeaTalk.
  linhas.push("⏳ HUBS AINDA SEM RAIO-X", "");
  if (pendentes.length === 0) {
    linhas.push("✅ Todos os hubs programados do turno já têm Raio-X.");
  } else {
    pendentes.forEach((p) => linhas.push(`⏳ ${p.operacao} (${p.responsavelNome}) — previsto p/ ${p.horaInicio}`));
  }
  linhas.push("");

  const tiposComAlerta = [pendentes.length > 0, ofensores.length > 0, sprAlto.length > 0, sprBaixo.length > 0, comOrfaos.length > 0].filter(Boolean).length;
  let statusTxt = tiposComAlerta > 0
    ? `Fechamento concluído com ${tiposComAlerta} tipo${tiposComAlerta > 1 ? "s" : ""} de alerta operacional identificado${tiposComAlerta > 1 ? "s" : ""}.`
    : "Fechamento concluído sem nenhum alerta operacional.";
  if (tendencia) {
    statusTxt += ` SPR médio ${tendencia.deltaGeral >= 0 ? "subiu" : tendencia.deltaGeral < 0 ? "caiu" : "ficou estável"} em relação a ontem.`;
  }
  linhas.push(`Status: ${statusTxt}`);
  return linhas.join("\n");
}

function montarHora(rows, horaInicio, horaFim, naoFinalizados, rowsOntemMesmaJanela) {
  naoFinalizados = naoFinalizados || [];
  rowsOntemMesmaJanela = rowsOntemMesmaJanela || [];
  const linhas = [];
  linhas.push(`📢 INFORMATIVO OPERACIONAL | ${horaInicio.slice(0, 2)}h às ${horaFim.slice(0, 2)}h`, "");

  // Comparativo com a MESMA janela de ontem — Pedidos/Rotas somados e SPR
  // médio, com variação percentual. Só aparece quando tem algo pra
  // comparar (ontem também teve movimento nessa janela).
  if (rowsOntemMesmaJanela.length > 0) {
    const comSprHoje = rows.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
    const comSprOntem = rowsOntemMesmaJanela.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
    const sprMedioHoje = comSprHoje.length ? comSprHoje.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprHoje.length : null;
    const sprMedioOntem = comSprOntem.length ? comSprOntem.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprOntem.length : null;
    const totalPedidosHoje = rows.reduce((s, r) => s + (r.pedRoteirizados || 0), 0);
    const totalPedidosOntem = rowsOntemMesmaJanela.reduce((s, r) => s + (r.pedRoteirizados || 0), 0);
    const totalRotasHoje = rows.reduce((s, r) => s + (r.rotasFinal || 0), 0);
    const totalRotasOntem = rowsOntemMesmaJanela.reduce((s, r) => s + (r.rotasFinal || 0), 0);
    const pct = (hoje, ontem) => (ontem ? ((hoje - ontem) / ontem) * 100 : null);
    const sprPct = sprMedioHoje != null ? pct(sprMedioHoje, sprMedioOntem) : null;
    const pedidosPct = pct(totalPedidosHoje, totalPedidosOntem);
    const rotasPct = pct(totalRotasHoje, totalRotasOntem);
    const setaTxt = (p) => (p == null ? "" : ` → ${p >= 0 ? "+" : ""}${p.toFixed(1)}% ${p >= 0 ? "📈" : "📉"}`);

    linhas.push("📊 COMPARATIVO COM ONTEM (mesma janela)", "");
    linhas.push(`• SPR médio: ${sprMedioHoje != null ? sprMedioHoje.toFixed(1) : "—"} (ontem: ${sprMedioOntem != null ? sprMedioOntem.toFixed(1) : "—"})${setaTxt(sprPct)}`);
    linhas.push(`• Pedidos: ${formatarNumero(totalPedidosHoje)} (ontem: ${formatarNumero(totalPedidosOntem)})${setaTxt(pedidosPct)}`);
    linhas.push(`• Rotas: ${formatarNumero(totalRotasHoje)} (ontem: ${formatarNumero(totalRotasOntem)})${setaTxt(rotasPct)}`, "");
  }

  // Comparação HUB A HUB da mesma janela de ontem — pedido explícito, além
  // do comparativo agregado acima. Cada hub que rodou ontem NESSA MESMA
  // janela de horário ganha "· ontem X (+Y%)" junto do próprio valor.
  const ontemPorOperacao = new Map();
  rowsOntemMesmaJanela.forEach((r) => ontemPorOperacao.set(r.operacao, r));
  // pctHub tolera ontem=0 explicitamente (ex.: 0 órfãos ontem, N hoje) —
  // só fica sem porcentagem quando realmente não dá pra calcular (0/0 ou
  // sem dado), mas mostra o "ontem 0" mesmo assim pra dar contexto.
  const pctHub = (hoje, ontem) => (ontem ? ((hoje - ontem) / ontem) * 100 : hoje === ontem ? 0 : null);
  const comparativoTxt = (hoje, ontem) => {
    const p = pctHub(hoje, ontem);
    return ` · ontem ${formatarNumero(ontem)}${p != null ? ` (${p >= 0 ? "+" : ""}${p.toFixed(1)}%)` : ""}`;
  };

  if (rows.length === 0 && naoFinalizados.length === 0) {
    linhas.push("Nenhum hub agendado pra essa janela.");
  } else {
    rows
      .sort((a, b) => horaValor(a.hora) - horaValor(b.hora))
      .forEach((r) => {
        const segs = [];
        if (r.horaInicioReal && r.horaFimReal) {
          segs.push(`${r.horaInicioReal} às ${r.horaFimReal}`);
          segs.push(formatarDuracao(r.duracaoSegundos));
        }
        const ontemHub = ontemPorOperacao.get(r.operacao);
        if (!r.semRoteirizacao && r.sprRoteirizado != null) {
          let sprSeg = r.sprMeta != null
            ? `SPR ${r.sprRoteirizado} (meta ${r.sprMeta}, ${r.sprRoteirizado - r.sprMeta >= 0 ? "+" : ""}${r.sprRoteirizado - r.sprMeta})`
            : `SPR ${r.sprRoteirizado}`;
          if (ontemHub && !ontemHub.semRoteirizacao && ontemHub.sprRoteirizado != null) {
            sprSeg += comparativoTxt(r.sprRoteirizado, ontemHub.sprRoteirizado);
          }
          segs.push(sprSeg);
        }
        if (r.pedRoteirizados != null) {
          let pedSeg = `Ped ${formatarNumero(r.pedRoteirizados)}`;
          if (ontemHub && ontemHub.pedRoteirizados != null) pedSeg += comparativoTxt(r.pedRoteirizados, ontemHub.pedRoteirizados);
          segs.push(pedSeg);
        }
        if (r.rotasFinal != null) {
          let rotSeg = `Rot ${formatarNumero(r.rotasFinal)}`;
          if (ontemHub && ontemHub.rotasFinal != null) rotSeg += comparativoTxt(r.rotasFinal, ontemHub.rotasFinal);
          segs.push(rotSeg);
        }
        const orfaosHoje = r.orfaos ?? 0;
        let orfSeg = `Órf ${orfaosHoje}`;
        if (ontemHub && ontemHub.orfaos != null) orfSeg += comparativoTxt(orfaosHoje, ontemHub.orfaos);
        segs.push(orfSeg);
        // 🟢 bateu ou passou a meta, 🟡 ficou abaixo — ✅ só quando não dá
        // pra comparar (sem meta cadastrada ou sem SPR ainda).
        const emoji = r.sprMeta != null && r.sprRoteirizado != null ? (r.sprRoteirizado >= r.sprMeta ? "🟢" : "🟡") : "✅";
        linhas.push(`${emoji} ${r.operacao} - ${segs.join(" | ")}`, "");
      });
    naoFinalizados
      .slice()
      .sort((a, b) => horaValor(a.horaInicio) - horaValor(b.horaInicio))
      .forEach((p) => linhas.push(`⏳ ${p.operacao} (${p.responsavelNome}) — ainda sem Raio-X`));
  }
  linhas.push(
    "",
    naoFinalizados.length > 0
      ? `Status: ${naoFinalizados.length} hub(s) dessa janela ainda sem Raio-X.`
      : "Status: Todos os hubs foram finalizados sem intercorrências."
  );
  return linhas.join("\n");
}

// Todo o cálculo de tendência hoje-vs-ontem, compartilhado entre
// montarAnaliseDiaria (standalone, mantida por compatibilidade) e o
// consolidado unificado de montarFechamento — extraído pra não duplicar a
// lógica (que já não é pequena) nos dois lugares.
function computarTendenciaDiaria(rowsHoje, rowsOntem) {
  const comSprHoje = rowsHoje.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const comSprOntem = rowsOntem.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const sprMedioHoje = comSprHoje.length ? comSprHoje.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprHoje.length : 0;
  const sprMedioOntem = comSprOntem.length ? comSprOntem.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprOntem.length : 0;
  const deltaGeral = sprMedioHoje - sprMedioOntem;
  const deltaPct = sprMedioOntem ? (deltaGeral / sprMedioOntem) * 100 : null;

  const abaixoMetaHoje = comSprHoje.filter((r) => r.sprMeta != null && r.sprRoteirizado < r.sprMeta).length;
  const abaixoMetaOntem = comSprOntem.filter((r) => r.sprMeta != null && r.sprRoteirizado < r.sprMeta).length;

  const totalPedidosHoje = rowsHoje.reduce((s, r) => s + (r.pedRoteirizados || 0), 0);
  const totalPedidosOntem = rowsOntem.reduce((s, r) => s + (r.pedRoteirizados || 0), 0);
  const totalRotasHoje = rowsHoje.reduce((s, r) => s + (r.rotasFinal || 0), 0);
  const totalRotasOntem = rowsOntem.reduce((s, r) => s + (r.rotasFinal || 0), 0);
  const deltaPedidosPct = totalPedidosOntem ? ((totalPedidosHoje - totalPedidosOntem) / totalPedidosOntem) * 100 : null;
  const deltaRotasPct = totalRotasOntem ? ((totalRotasHoje - totalRotasOntem) / totalRotasOntem) * 100 : null;

  const porOperacaoHoje = mediaSprPorChave(rowsHoje, (r) => r.operacao);
  const porOperacaoOntem = mediaSprPorChave(rowsOntem, (r) => r.operacao);
  const deltasOperacao = [];
  porOperacaoHoje.forEach((h, operacao) => {
    const o = porOperacaoOntem.get(operacao);
    if (!o) return;
    deltasOperacao.push({ operacao, hoje: h.media, ontem: o.media, delta: h.media - o.media });
  });
  const maiorEvolucao = deltasOperacao.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
  const maiorQueda = deltasOperacao.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);

  const porUfHoje = mediaSprPorChave(rowsHoje, (r) => ufDaOperacao(r.operacao));
  const porUfOntem = mediaSprPorChave(rowsOntem, (r) => ufDaOperacao(r.operacao));
  const deltasUf = [];
  porUfHoje.forEach((h, uf) => {
    const o = porUfOntem.get(uf);
    if (!o) return;
    if (h.count < LIMITE_MIN_AMOSTRA_UF || o.count < LIMITE_MIN_AMOSTRA_UF) return;
    deltasUf.push({ uf, delta: h.media - o.media, countHoje: h.count });
  });
  deltasUf.sort((a, b) => b.delta - a.delta);
  const ufAlta = deltasUf.length && deltasUf[0].delta > 0 ? deltasUf[0] : null;
  const ufBaixaCandidata = deltasUf[deltasUf.length - 1];
  const ufBaixa = ufBaixaCandidata && ufBaixaCandidata.delta < 0 && ufBaixaCandidata.uf !== ufAlta?.uf ? ufBaixaCandidata : null;

  const rowPorOperacaoHoje = new Map();
  rowsHoje.forEach((r) => rowPorOperacaoHoje.set(r.operacao, r));
  const volumeHojeTxt = (operacao) => {
    const r = rowPorOperacaoHoje.get(operacao);
    if (!r) return "";
    const partes = [];
    if (r.pedRoteirizados != null) partes.push(`Ped ${formatarNumero(r.pedRoteirizados)}`);
    if (r.rotasFinal != null) partes.push(`Rot ${formatarNumero(r.rotasFinal)}`);
    return partes.length ? ` | ${partes.join(" | ")}` : "";
  };

  return {
    sprMedioHoje, sprMedioOntem, deltaGeral, deltaPct,
    abaixoMetaHoje, abaixoMetaOntem,
    totalPedidosHoje, totalPedidosOntem, deltaPedidosPct,
    totalRotasHoje, totalRotasOntem, deltaRotasPct,
    maiorEvolucao, maiorQueda, ufAlta, ufBaixa,
    volumeHojeTxt,
  };
}

// Compara hoje com ontem — sempre dia contra dia (não semana), pedido
// explícito. Só usa o que já existe no Raio-X (SPR lançado/meta), sem
// depender de pedidos/rotas. A atribuição por UF (qual estado puxou a alta
// ou a queda) é aritmética pura (soma/média por grupo, maior/menor delta)
// — não é uma IA "opinando", só uma regra bem desenhada.
function montarAnaliseDiaria(rowsHoje, rowsOntem, dataHoje, dataOntem, nomeSupervisor, comoSecao) {
  const {
    sprMedioHoje, sprMedioOntem, deltaGeral, deltaPct,
    abaixoMetaHoje, abaixoMetaOntem,
    totalPedidosHoje, totalPedidosOntem, deltaPedidosPct,
    totalRotasHoje, totalRotasOntem,
    maiorEvolucao, maiorQueda, ufAlta, ufBaixa,
    volumeHojeTxt,
  } = computarTendenciaDiaria(rowsHoje, rowsOntem);

  const linhas = [];
  linhas.push(
    comoSecao
      ? "📊 ANÁLISE DIÁRIA (hoje vs ontem)"
      : `📊 ANÁLISE DIÁRIA DE SPR | CONSOLIDADO ${nomeSupervisor ? nomeSupervisor.toUpperCase() : "GERAL"}`,
    ""
  );
  linhas.push(`📅 ${formatarDataBR(dataHoje)} (vs. ${formatarDataBR(dataOntem)})`, "");
  linhas.push(`• SPR médio: ${sprMedioHoje.toFixed(1)} (dia anterior: ${sprMedioOntem.toFixed(1)}) → ${deltaPct != null ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"} ${deltaGeral >= 0 ? "📈" : "📉"}`);
  linhas.push(`• Hubs analisados: ${rowsHoje.length} (dia anterior: ${rowsOntem.length})`);
  linhas.push(`• Hubs abaixo da meta: ${abaixoMetaHoje} — dia anterior: ${abaixoMetaOntem}`);
  linhas.push(`• Pedidos roteirizados: ${formatarNumero(totalPedidosHoje)} (dia anterior: ${formatarNumero(totalPedidosOntem)})${deltaPedidosPct != null ? ` → ${deltaPedidosPct >= 0 ? "+" : ""}${deltaPedidosPct.toFixed(1)}%` : ""}`);
  linhas.push(`• Rotas: ${formatarNumero(totalRotasHoje)} (dia anterior: ${formatarNumero(totalRotasOntem)})`, "");

  linhas.push("🏆 MAIOR EVOLUÇÃO", "");
  if (maiorEvolucao.length === 0) {
    linhas.push("Nenhuma operação com SPR maior que ontem.");
  } else {
    maiorEvolucao.forEach((d) => linhas.push(`🟢 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (+${d.delta.toFixed(0)})${volumeHojeTxt(d.operacao)}`));
  }
  linhas.push("");

  linhas.push("⚠️ MAIOR QUEDA", "");
  if (maiorQueda.length === 0) {
    linhas.push("Nenhuma operação com SPR menor que ontem.");
  } else {
    maiorQueda.forEach((d) => linhas.push(`🔴 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (${d.delta.toFixed(0)})${volumeHojeTxt(d.operacao)}`));
  }
  linhas.push("");

  if (ufAlta || ufBaixa) {
    const partes = [];
    if (ufAlta) partes.push(`${ufAlta.uf} foi o estado que mais puxou a alta de hoje (SPR médio +${ufAlta.delta.toFixed(1)}, ${ufAlta.countHoje} hubs)`);
    if (ufBaixa) partes.push(`${ufBaixa.uf} foi o que mais recuou (${ufBaixa.delta.toFixed(1)}, ${ufBaixa.countHoje} hubs)`);
    linhas.push(`📍 ${partes.join(" — ")}.`);
  } else {
    linhas.push("📍 Sem volume suficiente pra atribuir a variação a um estado específico hoje.");
  }
  linhas.push("");

  linhas.push(`Status: SPR médio ${deltaGeral >= 0 ? "subiu" : deltaGeral < 0 ? "caiu" : "ficou estável"} em relação a ontem.`);
  return linhas.join("\n");
}

// Report semanal — janela rolante de 7 dias vs os 7 dias anteriores, pra ver
// tendência sem o ruído dia a dia. Reaproveita computarTendenciaDiaria tal e
// qual (a função só compara dois conjuntos de linhas — não importa se cada
// "lado" é 1 dia ou 7, o cálculo é o mesmo).
function montarRelatorioSemanal(rowsSemana, rowsSemanaAnterior, dataInicioSemana, dataFimSemana, dataInicioSemanaAnterior, dataFimSemanaAnterior, nomeSupervisor) {
  const {
    sprMedioHoje: sprMedioSemana, sprMedioOntem: sprMedioSemanaAnterior, deltaGeral, deltaPct,
    abaixoMetaHoje: abaixoMetaSemana, abaixoMetaOntem: abaixoMetaSemanaAnterior,
    totalPedidosHoje: totalPedidosSemana, totalPedidosOntem: totalPedidosSemanaAnterior, deltaPedidosPct,
    totalRotasHoje: totalRotasSemana, totalRotasOntem: totalRotasSemanaAnterior, deltaRotasPct,
    maiorEvolucao, maiorQueda, ufAlta, ufBaixa,
    volumeHojeTxt,
  } = computarTendenciaDiaria(rowsSemana, rowsSemanaAnterior);

  const linhas = [];
  linhas.push(`📢 REPORT SEMANAL${nomeSupervisor ? " | " + nomeSupervisor.toUpperCase() : ""}`, `Elaborado por ${ELABORADO_POR}`, "");
  linhas.push(`📅 ${formatarDataBR(dataInicioSemana)} a ${formatarDataBR(dataFimSemana)} (vs. ${formatarDataBR(dataInicioSemanaAnterior)} a ${formatarDataBR(dataFimSemanaAnterior)})`, "");
  linhas.push(`• SPR médio: ${sprMedioSemana.toFixed(1)} (semana anterior: ${sprMedioSemanaAnterior.toFixed(1)})${deltaPct != null ? ` → ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : ""} ${deltaGeral >= 0 ? "📈" : "📉"}`);
  linhas.push(`• Hubs analisados: ${rowsSemana.length} (semana anterior: ${rowsSemanaAnterior.length})`);
  linhas.push(`• Hubs abaixo da meta: ${abaixoMetaSemana} (semana anterior: ${abaixoMetaSemanaAnterior})`);
  linhas.push(`• Pedidos roteirizados: ${formatarNumero(totalPedidosSemana)} (semana anterior: ${formatarNumero(totalPedidosSemanaAnterior)})${deltaPedidosPct != null ? ` → ${deltaPedidosPct >= 0 ? "+" : ""}${deltaPedidosPct.toFixed(1)}%` : ""}`);
  linhas.push(`• Rotas: ${formatarNumero(totalRotasSemana)} (semana anterior: ${formatarNumero(totalRotasSemanaAnterior)})${deltaRotasPct != null ? ` → ${deltaRotasPct >= 0 ? "+" : ""}${deltaRotasPct.toFixed(1)}%` : ""}`, "");

  linhas.push("🏆 MAIOR EVOLUÇÃO NA SEMANA", "");
  if (maiorEvolucao.length === 0) {
    linhas.push("Nenhuma operação com SPR maior que a semana anterior.");
  } else {
    maiorEvolucao.forEach((d) => linhas.push(`🟢 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (+${d.delta.toFixed(0)})${volumeHojeTxt(d.operacao)}`));
  }
  linhas.push("");

  linhas.push("⚠️ MAIOR QUEDA NA SEMANA", "");
  if (maiorQueda.length === 0) {
    linhas.push("Nenhuma operação com SPR menor que a semana anterior.");
  } else {
    maiorQueda.forEach((d) => linhas.push(`🔴 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (${d.delta.toFixed(0)})${volumeHojeTxt(d.operacao)}`));
  }
  linhas.push("");

  if (ufAlta || ufBaixa) {
    const partes = [];
    if (ufAlta) partes.push(`${ufAlta.uf} foi o estado que mais puxou a alta da semana (SPR médio +${ufAlta.delta.toFixed(1)}, ${ufAlta.countHoje} hubs)`);
    if (ufBaixa) partes.push(`${ufBaixa.uf} foi o que mais recuou (${ufBaixa.delta.toFixed(1)}, ${ufBaixa.countHoje} hubs)`);
    linhas.push(`📍 ${partes.join(" — ")}.`);
  } else {
    linhas.push("📍 Sem volume suficiente pra atribuir a variação a um estado específico nessa semana.");
  }
  linhas.push("");

  linhas.push(`Status: SPR médio ${deltaGeral >= 0 ? "subiu" : deltaGeral < 0 ? "caiu" : "ficou estável"} em relação à semana anterior.`);
  return linhas.join("\n");
}

// Alerta imediato de "Prioridade Máxima" — não espera o fechamento das 05h:
// se um hub que acabou de finalizar NESSA hora está lento (ofensor de tempo)
// E é cronicamente abaixo da própria meta de SPR (mesmo critério de
// montarFechamento), manda um aviso curto na hora. Devolve null quando não
// tem nada pra avisar (quem chama decide não enviar nada nesse caso).
function montarAlertaPrioridade(doPeriodo, rowsUltimosDias, horaInicio, horaFim) {
  const ofensoresDoPeriodo = doPeriodo.filter((r) => r.duracaoSegundos != null && r.duracaoSegundos > SLA_SEGUNDOS);
  if (ofensoresDoPeriodo.length === 0) return null;

  const clusterizacao = operacoesAbaixoMetaNaJanela(rowsUltimosDias);
  const porOperacaoCluster = new Map(clusterizacao.map((c) => [c.operacao, c]));
  const criticos = ofensoresDoPeriodo.filter((r) => porOperacaoCluster.has(r.operacao));
  if (criticos.length === 0) return null;

  const linhas = [];
  linhas.push(`🚨 ALERTA — PRIORIDADE MÁXIMA (${horaInicio.slice(0, 2)}h às ${horaFim.slice(0, 2)}h)`, "");
  criticos.forEach((r) => {
    const c = porOperacaoCluster.get(r.operacao);
    linhas.push(`🔺 ${r.operacao} — ${formatarDuracao(r.duracaoSegundos)} de operação | SPR médio ${DIAS_JANELA_CLUSTER}d: ${c.sprMedio.toFixed(0)} (REF ${c.metaMedia.toFixed(0)}) | Hoje: SPR ${r.sprRoteirizado != null ? r.sprRoteirizado : "aguardando planilha"}`);
    linhas.push("");
  });
  linhas.push("Esse hub está lento agora E cronicamente abaixo da meta — vale checar antes do fechamento.");
  return linhas.join("\n");
}

// POST /api/reports/seatalk — fora do requireAuth (ver routes/index.js),
// autenticado pelo token compartilhado (mesmo esquema do planilha-import).
// Body: { tipo:'fechamento', data, supervisorEmail? } ou
// { tipo:'hora', data, horaInicio, horaFim, supervisorEmail? }.
// supervisorEmail (opcional) escopa o report só pra equipe desse
// supervisor — sem ele, o report sai da empresa inteira (todo mundo
// junto). E-mail (não id) porque quem chama é um Apps Script sem acesso
// fácil ao uuid do usuário no Kronos.
async function enviarReportSeatalk(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!seatalkReportToken || token !== seatalkReportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const { tipo, data, horaInicio, horaFim, supervisorEmail } = req.body;
  const TIPOS_VALIDOS = ["fechamento", "hora", "analise_diaria", "semanal", "alerta_prioridade"];
  if (!data || !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: "bad_request", message: `tipo (${TIPOS_VALIDOS.map((t) => `'${t}'`).join(", ")}) e data são obrigatórios.` });
  }

  // Bruta (sem filtro de equipe) fica reservada pra achar "não finalizados"
  // — um Raio-X pode ter sido enviado por alguém de OUTRA equipe cobrindo
  // um hub que é seu (ex.: suplência entre supervisores), e nesse caso
  // `todasDoDia` (escopada por quem SUBMETEU) não incluiria essa linha,
  // fazendo um hub já finalizado aparecer como pendente à toa. Mesmo
  // raciocínio vale pra escopar rowsOntem, por isso usuarios/supervisor são
  // resolvidos aqui em cima, fora do if/else de cada tipo.
  const todasDoDiaBruta = await supabaseService.listWhere(COLLECTION, [["data", "==", data]]);
  let todasDoDia = todasDoDiaBruta;
  let supervisor = null;
  let usuarios = null;

  if (supervisorEmail) {
    usuarios = await supabaseService.listAll("users");
    supervisor = usuarios.find((u) => (u.email || "").toLowerCase() === supervisorEmail.toLowerCase());
    if (!supervisor) {
      return res.status(400).json({ error: "bad_request", message: `Nenhum usuário encontrado com o e-mail ${supervisorEmail}.` });
    }
    // analistaId -> supervisorId, pra filtrar o raio-x (que só guarda
    // analistaId, não supervisorId) pela equipe de quem pediu.
    const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
    todasDoDia = todasDoDiaBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
  }

  let texto;
  if (tipo === "analise_diaria") {
    const dataOntem = diaAnterior(data);
    const rowsOntemBruta = await supabaseService.listWhere(COLLECTION, [["data", "==", dataOntem]]);
    let rowsOntem = rowsOntemBruta;
    if (supervisor) {
      const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
      rowsOntem = rowsOntemBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
    }
    texto = montarAnaliseDiaria(todasDoDia, rowsOntem, data, dataOntem, supervisor?.name);
  } else if (tipo === "semanal") {
    // Janela rolante: 7 dias terminando em `data` vs os 7 dias anteriores.
    const dataFimSemana = data;
    const dataInicioSemana = diaAnterior(data, 6);
    const dataFimSemanaAnterior = diaAnterior(dataInicioSemana, 1);
    const dataInicioSemanaAnterior = diaAnterior(dataFimSemanaAnterior, 6);

    const [rowsSemanaBruta, rowsSemanaAnteriorBruta] = await Promise.all([
      supabaseService.listWhere(COLLECTION, [["data", ">=", dataInicioSemana], ["data", "<=", dataFimSemana]]),
      supabaseService.listWhere(COLLECTION, [["data", ">=", dataInicioSemanaAnterior], ["data", "<=", dataFimSemanaAnterior]]),
    ]);
    let rowsSemana = rowsSemanaBruta;
    let rowsSemanaAnterior = rowsSemanaAnteriorBruta;
    if (supervisor) {
      const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
      rowsSemana = rowsSemanaBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
      rowsSemanaAnterior = rowsSemanaAnteriorBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
    }
    texto = montarRelatorioSemanal(rowsSemana, rowsSemanaAnterior, dataInicioSemana, dataFimSemana, dataInicioSemanaAnterior, dataFimSemanaAnterior, supervisor?.name);
  } else if (tipo === "alerta_prioridade") {
    if (!horaInicio || !horaFim) {
      return res.status(400).json({ error: "bad_request", message: "horaInicio e horaFim são obrigatórios pra tipo='alerta_prioridade'." });
    }
    const doPeriodo = todasDoDia.filter((r) => horaValor(r.hora) >= horaValor(horaInicio) && horaValor(r.hora) < horaValor(horaFim));
    const dataInicioJanelaAlerta = diaAnterior(data, DIAS_JANELA_CLUSTER - 1);
    const rowsJanelaAlertaBruta = await supabaseService.listWhere(COLLECTION, [
      ["data", ">=", dataInicioJanelaAlerta],
      ["data", "<=", data],
    ]);
    let rowsJanelaAlerta = rowsJanelaAlertaBruta;
    if (supervisor) {
      const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
      rowsJanelaAlerta = rowsJanelaAlertaBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
    }
    const textoAlerta = montarAlertaPrioridade(doPeriodo, rowsJanelaAlerta, horaInicio, horaFim);
    if (!textoAlerta) {
      return res.json({ enviado: false, motivo: "nenhum hub em prioridade máxima nessa janela" });
    }
    await enviarParaSeatalkEmPartes(textoAlerta);
    return res.json({ enviado: true, tamanho: textoAlerta.length, preview: textoAlerta });
  } else {
    const esperadas = await operacoesEsperadas(data, supervisor?.id || null);
    if (tipo === "fechamento") {
      const naoFinalizados = separarNaoFinalizados(esperadas, todasDoDiaBruta);
      // Janela dos últimos DIAS_JANELA_CLUSTER dias (incluindo hoje) pra
      // "Oportunidade de clusterização" — quem fica consistentemente abaixo
      // da própria meta de SPR, não só num dia isolado.
      const dataInicioJanela = diaAnterior(data, DIAS_JANELA_CLUSTER - 1);
      const rowsJanelaBruta = await supabaseService.listWhere(COLLECTION, [
        ["data", ">=", dataInicioJanela],
        ["data", "<=", data],
      ]);
      let rowsJanela = rowsJanelaBruta;
      if (supervisor) {
        const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
        rowsJanela = rowsJanelaBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
      }
      // Análise diária (hoje vs ontem) entra DENTRO do mesmo consolidado do
      // fechamento agora — pedido explícito, pra ser um report só, não dois
      // colados com divisor.
      const dataOntemFechamento = diaAnterior(data);
      const rowsOntemFechamentoBruta = await supabaseService.listWhere(COLLECTION, [["data", "==", dataOntemFechamento]]);
      let rowsOntemFechamento = rowsOntemFechamentoBruta;
      if (supervisor) {
        const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
        rowsOntemFechamento = rowsOntemFechamentoBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
      }

      texto = montarFechamento(todasDoDia, req.body.horaFechamento || "05h", supervisor?.name, naoFinalizados, rowsJanela, rowsOntemFechamento, data, dataOntemFechamento);
    } else {
      if (!horaInicio || !horaFim) {
        return res.status(400).json({ error: "bad_request", message: "horaInicio e horaFim são obrigatórios pra tipo='hora'." });
      }
      const doPeriodo = todasDoDia.filter((r) => horaValor(r.hora) >= horaValor(horaInicio) && horaValor(r.hora) < horaValor(horaFim));
      const esperadasDoPeriodo = esperadas.filter((e) => horaValor(e.horaInicio) >= horaValor(horaInicio) && horaValor(e.horaInicio) < horaValor(horaFim));
      const naoFinalizados = separarNaoFinalizados(esperadasDoPeriodo, todasDoDiaBruta);

      // Mesma janela de horário, mas de ONTEM — pra "COMPARATIVO COM ONTEM"
      // dentro do informativo hora a hora.
      const dataOntemHora = diaAnterior(data);
      const todasDoDiaOntemHoraBruta = await supabaseService.listWhere(COLLECTION, [["data", "==", dataOntemHora]]);
      let todasDoDiaOntemHora = todasDoDiaOntemHoraBruta;
      if (supervisor) {
        const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
        todasDoDiaOntemHora = todasDoDiaOntemHoraBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
      }
      const doPeriodoOntem = todasDoDiaOntemHora.filter((r) => horaValor(r.hora) >= horaValor(horaInicio) && horaValor(r.hora) < horaValor(horaFim));

      texto = montarHora(doPeriodo, horaInicio, horaFim, naoFinalizados, doPeriodoOntem);
    }
  }

  await enviarParaSeatalkEmPartes(texto);
  res.json({ enviado: true, tamanho: texto.length, preview: texto });
}

// Bot "Shôdisponível" — pergunta quem está disponível pra suporte, só
// durante o turno da madrugada (19h-04h). Antes era um workflow do GitHub
// Actions com `schedule:` cron; o cron nunca disparou sozinho de verdade (só
// via "Run workflow" manual — 1 execução total, a do teste), então passou a
// ser chamado daqui, pelo MESMO Apps Script que já dispara
// /api/reports/seatalk de hora em hora com sucesso comprovado. Servidor não
// tenta adivinhar a hora do Brasil (Render roda em UTC) — quem manda
// `horaLocal` é o Apps Script (Session.getScriptTimeZone(), mesma lógica já
// usada em enviarReportSeatalk).
const MENSAGENS_SUPORTE = [
  "Mais uma hora vencida, faltam menos pra bater o turno. Bora com tudo!",
  "Quem segura a peteca agora ganha o crédito depois. Coragem!",
  "De madrugada é quando os fortes aparecem.",
  "Um passo de cada vez — o suporte de agora evita o perrengue de amanhã.",
  "Cansaço é temporário, o trabalho bem feito fica.",
  "Ninguém disse que ia ser fácil, só disse que ia valer a pena.",
  "O turno da madrugada separa quem só reclama de quem resolve.",
  "Respira fundo, foca no próximo hub, o resto se resolve.",
  "Toda operação difícil também passa.",
  "Hoje é mais um dia que vai provar do que você é capaz.",
  "Força não é não cansar, é continuar mesmo cansado.",
  "Cada hora de suporte é um problema a menos amanhã.",
  "O sol vai nascer e vocês vão estar de pé — isso já é vitória.",
  "Trabalho em equipe é isso: alguém sempre aparece quando precisa.",
  "Menos uma hora pro fim do turno, bora fechar com chave de ouro.",
  "Quem chega até aqui já mostrou que aguenta o tranco.",
  "A madrugada é curta pra quem tá ocupado ajudando alguém.",
  "Não é sobre não cair, é sobre continuar levantando.",
  "Vocês são a base que segura a operação de pé. Valeu por isso.",
  "Mais um round vencido. Segue o jogo!",
];

function diaDoAno(d) {
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - inicio) / 86400000);
}

async function enviarSuporteNoturno(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!seatalkReportToken || token !== seatalkReportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  if (!seatalkSuporteWebhookUrl) {
    return res.status(500).json({ error: "config", message: "SEATALK_SUPORTE_WEBHOOK_URL não configurado." });
  }
  const horaLocal = Number(req.body.horaLocal);
  if (!Number.isInteger(horaLocal) || horaLocal < 0 || horaLocal > 23) {
    return res.status(400).json({ error: "bad_request", message: "horaLocal (0-23, hora local de Brasília) é obrigatório." });
  }
  // Turno 19h-04h — fora disso, não é erro, só não tem nada pra perguntar.
  if (horaLocal >= 5 && horaLocal < 19) {
    return res.json({ enviado: false, motivo: "fora do turno (19h-04h)" });
  }

  const indice = (diaDoAno(new Date()) + horaLocal) % MENSAGENS_SUPORTE.length;
  const proximaHora = (horaLocal + 1) % 24;
  const janela = `${String(horaLocal).padStart(2, "0")}:00 - ${String(proximaHora).padStart(2, "0")}:00`;
  const texto = `📢 SUPORTE NOTURNO | ${janela}\n\nQuem tá disponível pra dar suporte agora? Levanta a mão aqui no tópico! 🙋‍♂️🙋‍♀️\n\n💪 ${MENSAGENS_SUPORTE[indice]}`;

  await enviarParaSeatalk(texto, seatalkSuporteWebhookUrl);
  res.json({ enviado: true, tamanho: texto.length, preview: texto });
}

module.exports = { enviarReportSeatalk, enviarSuporteNoturno, montarFechamento, montarHora, montarAnaliseDiaria, montarRelatorioSemanal, montarAlertaPrioridade, operacoesEsperadas, separarNaoFinalizados };
