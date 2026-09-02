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
const { seatalkReportToken, seatalkWebhookUrl } = require("../config/env");

const COLLECTION = "raioX";

// Mesmo SLA de 1h já usado no resto do app pra "Tempo de Execução" (ver
// SLA_TEMPO_EXECUCAO_SEGUNDOS, frontend/js/utils.js) — hub "ofensor" é o
// mesmo critério de "acima do SLA" que já aparece nos cards.
const SLA_SEGUNDOS = 3600;
const LIMITE_SPR_ALTO = 120;
const LIMITE_SPR_BAIXO = 60;
const LIMITE_ORFAOS = 40;

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

function diaAnterior(dataStr) {
  const d = new Date(dataStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
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

async function enviarParaSeatalk(texto) {
  if (!seatalkWebhookUrl) throw new Error("SEATALK_REPORT_WEBHOOK_URL não configurado.");
  const res = await fetch(seatalkWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag: "text", text: { content: texto } }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`SeaTalk respondeu ${res.status}: ${corpo}`);
  }
}

function montarFechamento(rows, horaFechamento, nomeSupervisor, naoFinalizados) {
  naoFinalizados = naoFinalizados || [];
  const analisados = rows.length;
  const roteirizados = rows.filter((r) => r.duracaoSegundos != null).length;
  const comSpr = rows.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const sprMedio = comSpr.length ? Math.round(comSpr.reduce((s, r) => s + r.sprRoteirizado, 0) / comSpr.length) : 0;
  const totalOrfaos = rows.reduce((s, r) => s + (r.orfaos || 0), 0);

  const ofensores = rows.filter((r) => r.duracaoSegundos != null && r.duracaoSegundos > SLA_SEGUNDOS).sort((a, b) => b.duracaoSegundos - a.duracaoSegundos);
  const sprAlto = comSpr.filter((r) => r.sprRoteirizado >= LIMITE_SPR_ALTO).sort((a, b) => b.sprRoteirizado - a.sprRoteirizado);
  const sprBaixo = comSpr.filter((r) => r.sprRoteirizado < LIMITE_SPR_BAIXO).sort((a, b) => a.sprRoteirizado - b.sprRoteirizado);
  const comOrfaos = rows.filter((r) => (r.orfaos || 0) > LIMITE_ORFAOS).sort((a, b) => b.orfaos - a.orfaos);
  const pendentes = naoFinalizados.slice().sort((a, b) => horaValor(a.horaInicio) - horaValor(b.horaInicio));

  const linhas = [];
  linhas.push(`📢 REPORT DE FECHAMENTO | ${horaFechamento}`, "");
  linhas.push(`📊 CONSOLIDADO ${nomeSupervisor ? nomeSupervisor.toUpperCase() : "GERAL"}`, "");
  linhas.push(`• Hubs analisados: ${analisados}`);
  linhas.push(`• Hubs roteirizados: ${roteirizados}`);
  linhas.push(`• SPR médio: ${sprMedio}`);
  linhas.push(`• Total de órfãos: ${formatarNumero(totalOrfaos)}`, "");

  linhas.push("⏳ HUBS AINDA SEM RAIO-X", "");
  if (pendentes.length === 0) {
    linhas.push("✅ Todos os hubs programados do turno já têm Raio-X.");
  } else {
    pendentes.forEach((p) => linhas.push(`⏳ ${p.operacao} (${p.responsavelNome}) — previsto p/ ${p.horaInicio}`));
  }
  linhas.push("");

  linhas.push("🚨 HUBS OFENSORES — OPERAÇÃO SUPERIOR A 1 HORA", "");
  if (ofensores.length === 0) {
    linhas.push("✅ Nenhum hub passou de 1 hora de operação.");
  } else {
    ofensores.forEach((r) => {
      linhas.push(`🔴 ${r.operacao}`);
      linhas.push(`🕒 ${r.horaInicioReal || r.hora} às ${r.horaFimReal || "—"} | Tempo: ${formatarDuracao(r.duracaoSegundos)}`);
      linhas.push(`SPR ${r.sprRoteirizado} | Órf ${r.orfaos ?? 0}`, "");
    });
  }

  linhas.push(`📈 HUBS COM SPR ${LIMITE_SPR_ALTO}+`, "");
  if (sprAlto.length === 0) {
    linhas.push(`✅ Nenhum hub com SPR igual ou acima de ${LIMITE_SPR_ALTO}.`);
  } else {
    sprAlto.forEach((r) => linhas.push(`🟠 ${r.operacao} | SPR ${r.sprRoteirizado}`));
  }
  linhas.push("");

  linhas.push(`📉 HUBS COM SPR ABAIXO DE ${LIMITE_SPR_BAIXO}`, "");
  if (sprBaixo.length === 0) {
    linhas.push(`✅ Nenhum hub ficou com SPR abaixo de ${LIMITE_SPR_BAIXO}.`);
  } else {
    sprBaixo.forEach((r) => linhas.push(`🟡 ${r.operacao} | SPR ${r.sprRoteirizado}`));
  }
  linhas.push("");

  linhas.push(`📦 HUBS COM MAIS DE ${LIMITE_ORFAOS} ÓRFÃOS`, "");
  if (comOrfaos.length === 0) {
    linhas.push(`✅ Nenhum hub com mais de ${LIMITE_ORFAOS} órfãos.`);
  } else {
    comOrfaos.forEach((r) => linhas.push(`🔵 ${r.operacao} | Órf ${formatarNumero(r.orfaos)}`));
  }
  linhas.push("");

  const tiposComAlerta = [pendentes.length > 0, ofensores.length > 0, sprAlto.length > 0, sprBaixo.length > 0, comOrfaos.length > 0].filter(Boolean).length;
  linhas.push(
    tiposComAlerta > 0
      ? `Status: Fechamento concluído com ${tiposComAlerta} tipo${tiposComAlerta > 1 ? "s" : ""} de alerta operacional identificado${tiposComAlerta > 1 ? "s" : ""}.`
      : "Status: Fechamento concluído sem nenhum alerta operacional."
  );
  return linhas.join("\n");
}

function montarHora(rows, horaInicio, horaFim, naoFinalizados) {
  naoFinalizados = naoFinalizados || [];
  const linhas = [];
  linhas.push(`📢 INFORMATIVO OPERACIONAL | ${horaInicio.slice(0, 2)}h às ${horaFim.slice(0, 2)}h`, "");
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
        if (!r.semRoteirizacao && r.sprRoteirizado != null) {
          if (r.sprMeta != null) {
            const delta = r.sprRoteirizado - r.sprMeta;
            segs.push(`SPR ${r.sprRoteirizado} (meta ${r.sprMeta}, ${delta >= 0 ? "+" : ""}${delta})`);
          } else {
            segs.push(`SPR ${r.sprRoteirizado}`);
          }
        }
        segs.push(`Órf ${r.orfaos ?? 0}`);
        linhas.push(`✅ ${r.operacao} - ${segs.join(" | ")}`);
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

// Compara hoje com ontem — sempre dia contra dia (não semana), pedido
// explícito. Só usa o que já existe no Raio-X (SPR lançado/meta), sem
// depender de pedidos/rotas. A atribuição por UF (qual estado puxou a alta
// ou a queda) é aritmética pura (soma/média por grupo, maior/menor delta)
// — não é uma IA "opinando", só uma regra bem desenhada.
function montarAnaliseDiaria(rowsHoje, rowsOntem, dataHoje, dataOntem, nomeSupervisor) {
  const comSprHoje = rowsHoje.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const comSprOntem = rowsOntem.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const sprMedioHoje = comSprHoje.length ? comSprHoje.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprHoje.length : 0;
  const sprMedioOntem = comSprOntem.length ? comSprOntem.reduce((s, r) => s + r.sprRoteirizado, 0) / comSprOntem.length : 0;
  const deltaGeral = sprMedioHoje - sprMedioOntem;
  const deltaPct = sprMedioOntem ? (deltaGeral / sprMedioOntem) * 100 : null;

  const abaixoMetaHoje = comSprHoje.filter((r) => r.sprMeta != null && r.sprRoteirizado < r.sprMeta).length;
  const abaixoMetaOntem = comSprOntem.filter((r) => r.sprMeta != null && r.sprRoteirizado < r.sprMeta).length;

  // Por operação — casa só quem finalizou nos DOIS dias (média do dia, pro
  // caso raro de mais de uma finalização da mesma operação no mesmo dia).
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

  // Por UF — só entram no ranking os estados com amostra mínima nos DOIS
  // dias (ver LIMITE_MIN_AMOSTRA_UF).
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

  const linhas = [];
  linhas.push(`📊 ANÁLISE DIÁRIA DE SPR | CONSOLIDADO ${nomeSupervisor ? nomeSupervisor.toUpperCase() : "GERAL"}`, "");
  linhas.push(`📅 ${formatarDataBR(dataHoje)} (vs. ${formatarDataBR(dataOntem)})`, "");
  linhas.push(`• SPR médio: ${sprMedioHoje.toFixed(1)} (dia anterior: ${sprMedioOntem.toFixed(1)}) → ${deltaPct != null ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"} ${deltaGeral >= 0 ? "📈" : "📉"}`);
  linhas.push(`• Hubs analisados: ${rowsHoje.length} (dia anterior: ${rowsOntem.length})`);
  linhas.push(`• Hubs abaixo da meta: ${abaixoMetaHoje} — dia anterior: ${abaixoMetaOntem}`, "");

  linhas.push("🏆 MAIOR EVOLUÇÃO", "");
  if (maiorEvolucao.length === 0) {
    linhas.push("Nenhuma operação com SPR maior que ontem.");
  } else {
    maiorEvolucao.forEach((d) => linhas.push(`🟢 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (+${d.delta.toFixed(0)})`));
  }
  linhas.push("");

  linhas.push("⚠️ MAIOR QUEDA", "");
  if (maiorQueda.length === 0) {
    linhas.push("Nenhuma operação com SPR menor que ontem.");
  } else {
    maiorQueda.forEach((d) => linhas.push(`🔴 ${d.operacao} — SPR ${d.ontem.toFixed(0)} → ${d.hoje.toFixed(0)} (${d.delta.toFixed(0)})`));
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
  const TIPOS_VALIDOS = ["fechamento", "hora", "analise_diaria"];
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
  } else {
    const esperadas = await operacoesEsperadas(data, supervisor?.id || null);
    if (tipo === "fechamento") {
      const naoFinalizados = separarNaoFinalizados(esperadas, todasDoDiaBruta);
      texto = montarFechamento(todasDoDia, req.body.horaFechamento || "05h", supervisor?.name, naoFinalizados);
    } else {
      if (!horaInicio || !horaFim) {
        return res.status(400).json({ error: "bad_request", message: "horaInicio e horaFim são obrigatórios pra tipo='hora'." });
      }
      const doPeriodo = todasDoDia.filter((r) => horaValor(r.hora) >= horaValor(horaInicio) && horaValor(r.hora) < horaValor(horaFim));
      const esperadasDoPeriodo = esperadas.filter((e) => horaValor(e.horaInicio) >= horaValor(horaInicio) && horaValor(e.horaInicio) < horaValor(horaFim));
      const naoFinalizados = separarNaoFinalizados(esperadasDoPeriodo, todasDoDiaBruta);
      texto = montarHora(doPeriodo, horaInicio, horaFim, naoFinalizados);
    }
  }

  await enviarParaSeatalk(texto);
  res.json({ enviado: true, tamanho: texto.length, preview: texto });
}

module.exports = { enviarReportSeatalk, montarFechamento, montarHora, montarAnaliseDiaria, operacoesEsperadas, separarNaoFinalizados };
