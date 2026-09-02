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
  if (!data || (tipo !== "fechamento" && tipo !== "hora")) {
    return res.status(400).json({ error: "bad_request", message: "tipo ('fechamento' ou 'hora') e data são obrigatórios." });
  }

  // Bruta (sem filtro de equipe) fica reservada pra achar "não finalizados"
  // — um Raio-X pode ter sido enviado por alguém de OUTRA equipe cobrindo
  // um hub que é seu (ex.: suplência entre supervisores), e nesse caso
  // `todasDoDia` (escopada por quem SUBMETEU) não incluiria essa linha,
  // fazendo um hub já finalizado aparecer como pendente à toa.
  const todasDoDiaBruta = await supabaseService.listWhere(COLLECTION, [["data", "==", data]]);
  let todasDoDia = todasDoDiaBruta;
  let supervisor = null;

  if (supervisorEmail) {
    const usuarios = await supabaseService.listAll("users");
    supervisor = usuarios.find((u) => (u.email || "").toLowerCase() === supervisorEmail.toLowerCase());
    if (!supervisor) {
      return res.status(400).json({ error: "bad_request", message: `Nenhum usuário encontrado com o e-mail ${supervisorEmail}.` });
    }
    // analistaId -> supervisorId, pra filtrar o raio-x (que só guarda
    // analistaId, não supervisorId) pela equipe de quem pediu.
    const supervisorPorAnalista = new Map(usuarios.map((u) => [u.id, u.supervisorId]));
    todasDoDia = todasDoDiaBruta.filter((r) => supervisorPorAnalista.get(r.analistaId) === supervisor.id);
  }

  const esperadas = await operacoesEsperadas(data, supervisor?.id || null);

  let texto;
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

  await enviarParaSeatalk(texto);
  res.json({ enviado: true, tamanho: texto.length, preview: texto });
}

module.exports = { enviarReportSeatalk, montarFechamento, montarHora, operacoesEsperadas, separarNaoFinalizados };
