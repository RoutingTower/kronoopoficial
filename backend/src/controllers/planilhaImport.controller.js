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
// só pra exibição (início/fim reais no card da Grade Integrada). A
// duração continua com precisão de segundos, guardada à parte.
function paraHoraMinuto(valor) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(valor || "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// raio_x.data é o "dia operacional" do turno (o turno inteiro conta pro
// dia em que começou, mesmo virando a madrugada — mesma convenção de
// hourSortValue/slotTimestamp no frontend), mas a planilha registra a data
// literal do relógio: uma operação de madrugada que o Kronos guarda como
// "21/08" (turno começou dia 21) aparece na planilha como "22/08" (a hora
// real já é depois da meia-noite). Sem esse ajuste, toda operação de
// madrugada nunca batia com o Raio-X correspondente.
function dataCalendarioDoRaioX(dataOperacional, hora) {
  const h = parseInt(String(hora).split(":")[0], 10);
  if (h >= 7) return dataOperacional; // turno começou de dia, mesma data nos dois
  const [y, m, d] = dataOperacional.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// Corta listas de diagnóstico grandes (a planilha real manda dezenas de
// milhares de linhas de histórico) — sem isso a resposta HTTP e o
// Logger.log do Apps Script (que trunca saída grande) ficam inúteis.
function resumir(lista, limite = 20) {
  return { total: lista.length, amostra: lista.slice(0, limite) };
}

// Chamado pelo Apps Script da planilha de roteirização (fora do requireAuth
// — ver routes/index.js), não por um usuário logado no Kronos. Por isso se
// autentica com um token fixo (PLANILHA_IMPORT_TOKEN) em vez de um Supabase
// ID token. Substitui o tempo de execução (duracao_segundos/duracao_origem
// e o início/fim reais, hora_inicio_real/hora_fim_real — usados pro card da
// Grade Integrada mostrar o horário de verdade) do Raio-X já existente pra
// cada linha — nunca CRIA um Raio-X novo (a finalização em si continua
// exigindo o fluxo normal, com estrelas e observação; isso só corrige o
// tempo depois que ela já existe).
async function importarPlanilha(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!planilhaImportToken || token !== planilhaImportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas : [];
  const todosRaioX = await supabaseService.listAll("raioX");

  // Índice por data (a que aparece na planilha, não a operacional — ver
  // dataCalendarioDoRaioX) + operação. A planilha manda dezenas de milhares
  // de linhas de histórico; varrer o array inteiro pra cada uma delas seria
  // lento demais dentro do tempo de uma requisição HTTP.
  const porDataOperacao = new Map();
  for (const r of todosRaioX) {
    const chave = `${dataCalendarioDoRaioX(r.data, r.hora)}|${r.operacao}`;
    if (!porDataOperacao.has(chave)) porDataOperacao.set(chave, []);
    porDataOperacao.get(chave).push(r);
  }

  let atualizados = 0;
  let semDadosSuficientes = 0; // fim/início em branco (operação ainda em curso na planilha) — não é erro
  const naoEncontrados = [];
  const ambiguos = [];
  const invalidos = []; // data/horário que não bateu em nenhum formato conhecido

  for (const linha of linhas) {
    const operacao = String(linha.operacao || "").trim();
    const ciclo = String(linha.ciclo || "").trim();
    const inicioTxt = String(linha.inicio || "").trim();
    const fimTxt = String(linha.fim || "").trim();
    const dataTxt = String(linha.data || "").trim();

    if (!operacao || !dataTxt || !inicioTxt || !fimTxt) {
      semDadosSuficientes++;
      continue;
    }

    const dataISO = paraDataISO(dataTxt);
    const duracaoSegundos = duracaoEmSegundos(inicioTxt, fimTxt);
    if (!dataISO || duracaoSegundos == null) {
      invalidos.push({ data: dataTxt, operacao, ciclo, inicio: inicioTxt, fim: fimTxt });
      continue;
    }

    // Ciclo é o desempate quando o mesmo hub roda mais de uma vez no dia —
    // registro antigo (sem ciclo gravado, ver comentário em raio_x no
    // supabase-schema.sql) conta como "qualquer ciclo" pra não deixar de
    // achar um Raio-X real só porque ele é anterior à correção do bug.
    const mesmaDataOperacao = porDataOperacao.get(`${dataISO}|${operacao}`) || [];
    const candidatos = mesmaDataOperacao.filter((r) => !ciclo || !r.ciclo || r.ciclo === ciclo);
    if (candidatos.length === 0) {
      naoEncontrados.push({ data: dataISO, operacao, ciclo });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({ data: dataISO, operacao, ciclo, qtd: candidatos.length });
      continue;
    }

    await supabaseService.update("raioX", candidatos[0].id, {
      duracaoSegundos,
      duracaoOrigem: "planilha",
      ciclo: ciclo || candidatos[0].ciclo || null,
      horaInicioReal: paraHoraMinuto(inicioTxt),
      horaFimReal: paraHoraMinuto(fimTxt),
    });
    atualizados++;
  }

  res.json({
    recebidas: linhas.length,
    atualizados,
    semDadosSuficientes,
    naoEncontrados: resumir(naoEncontrados),
    ambiguos: resumir(ambiguos),
    invalidos: resumir(invalidos),
  });
}

module.exports = { importarPlanilha };
