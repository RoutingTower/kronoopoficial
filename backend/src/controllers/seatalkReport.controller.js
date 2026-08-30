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

function montarFechamento(rows, horaFechamento) {
  const analisados = rows.length;
  const roteirizados = rows.filter((r) => r.duracaoSegundos != null).length;
  const comSpr = rows.filter((r) => !r.semRoteirizacao && r.sprRoteirizado != null);
  const sprMedio = comSpr.length ? Math.round(comSpr.reduce((s, r) => s + r.sprRoteirizado, 0) / comSpr.length) : 0;
  const totalOrfaos = rows.reduce((s, r) => s + (r.orfaos || 0), 0);

  const ofensores = rows.filter((r) => r.duracaoSegundos != null && r.duracaoSegundos > SLA_SEGUNDOS).sort((a, b) => b.duracaoSegundos - a.duracaoSegundos);
  const sprAlto = comSpr.filter((r) => r.sprRoteirizado >= LIMITE_SPR_ALTO).sort((a, b) => b.sprRoteirizado - a.sprRoteirizado);
  const sprBaixo = comSpr.filter((r) => r.sprRoteirizado < LIMITE_SPR_BAIXO).sort((a, b) => a.sprRoteirizado - b.sprRoteirizado);
  const comOrfaos = rows.filter((r) => (r.orfaos || 0) > LIMITE_ORFAOS).sort((a, b) => b.orfaos - a.orfaos);

  const linhas = [];
  linhas.push(`📢 REPORT DE FECHAMENTO | ${horaFechamento}`, "");
  linhas.push("📊 CONSOLIDADO GERAL", "");
  linhas.push(`• Hubs analisados: ${analisados}`);
  linhas.push(`• Hubs roteirizados: ${roteirizados}`);
  linhas.push(`• SPR médio: ${sprMedio}`);
  linhas.push(`• Total de órfãos: ${formatarNumero(totalOrfaos)}`, "");

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

  const tiposComAlerta = [ofensores.length > 0, sprAlto.length > 0, sprBaixo.length > 0, comOrfaos.length > 0].filter(Boolean).length;
  linhas.push(
    tiposComAlerta > 0
      ? `Status: Fechamento concluído com ${tiposComAlerta} tipo${tiposComAlerta > 1 ? "s" : ""} de alerta operacional identificado${tiposComAlerta > 1 ? "s" : ""}.`
      : "Status: Fechamento concluído sem nenhum alerta operacional."
  );
  return linhas.join("\n");
}

function montarHora(rows, horaInicio, horaFim) {
  const linhas = [];
  linhas.push(`📢 INFORMATIVO OPERACIONAL | ${horaInicio.slice(0, 2)}h às ${horaFim.slice(0, 2)}h`, "");
  if (rows.length === 0) {
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
        if (!r.semRoteirizacao && r.sprRoteirizado != null) segs.push(`SPR ${r.sprRoteirizado}`);
        segs.push(`Órf ${r.orfaos ?? 0}`);
        linhas.push(`✅ ${r.operacao} - ${segs.join(" | ")}`);
      });
  }
  linhas.push("", "Status: Todos os hubs foram finalizados sem intercorrências.");
  return linhas.join("\n");
}

// POST /api/reports/seatalk — fora do requireAuth (ver routes/index.js),
// autenticado pelo token compartilhado (mesmo esquema do planilha-import).
// Body: { tipo:'fechamento', data } ou { tipo:'hora', data, horaInicio, horaFim }.
async function enviarReportSeatalk(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!seatalkReportToken || token !== seatalkReportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const { tipo, data, horaInicio, horaFim } = req.body;
  if (!data || (tipo !== "fechamento" && tipo !== "hora")) {
    return res.status(400).json({ error: "bad_request", message: "tipo ('fechamento' ou 'hora') e data são obrigatórios." });
  }

  const todasDoDia = await supabaseService.listWhere(COLLECTION, [["data", "==", data]]);

  let texto;
  if (tipo === "fechamento") {
    texto = montarFechamento(todasDoDia, req.body.horaFechamento || "05h");
  } else {
    if (!horaInicio || !horaFim) {
      return res.status(400).json({ error: "bad_request", message: "horaInicio e horaFim são obrigatórios pra tipo='hora'." });
    }
    const doPeriodo = todasDoDia.filter((r) => horaValor(r.hora) >= horaValor(horaInicio) && horaValor(r.hora) < horaValor(horaFim));
    texto = montarHora(doPeriodo, horaInicio, horaFim);
  }

  await enviarParaSeatalk(texto);
  res.json({ enviado: true, tamanho: texto.length, preview: texto });
}

module.exports = { enviarReportSeatalk, montarFechamento, montarHora };
