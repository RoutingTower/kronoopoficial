// Utilitários de casamento entre uma linha de planilha externa (Apps
// Script) e um Raio-X já existente — extraído de planilhaImport.controller.js
// (import da planilha de roteirização) pra ser reaproveitado tal e qual por
// fluxoImport.controller.js (import da planilha "Kronos x Fluxo"). Extração
// pura: mesmo comportamento de antes, só compartilhado entre os dois.

// A planilha manda a data como texto — aceita tanto "DD/MM/YYYY" (o que as
// abas realmente usam) quanto "YYYY-MM-DD" (caso um dia a formatação
// mude), sempre devolvendo ISO pra bater com a coluna raio_x.data.
function paraDataISO(valor) {
  const s = String(valor || "").trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

// Aceita "HH:MM" ou "HH:MM:SS" (as planilhas mandam com segundos).
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
// só pra exibição. A duração continua com precisão de segundos, guardada
// à parte (quem precisa dela usa duracaoEmSegundos diretamente).
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
// agendado (ver escolherRaioX abaixo: casar direto pela data operacional
// evita o bug de indexar pelo horário AGENDADO do Raio-X, que é fixo e não
// reflete a variação real dia a dia — via Hub_SP_Araraquara em produção,
// agendado 01:00 mas a execução real de um dia caiu antes da virada e a de
// outro depois, e indexar pelo agendado jogava as duas linhas da planilha
// pro MESMO Raio-X, deixando o outro Raio-X inalcançável pra sempre).
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
// direito entre um turno que já cruzou a virada e o horário agendado.
function segundosAjustados(segundos) {
  return segundos < 7 * 3600 ? segundos + 24 * 3600 : segundos;
}

// Casa o nome da operação ignorando acento e maiúscula/minúscula — dados
// vindos de planilha externa são o tipo de texto mais propenso a chegar
// diferente entre os dois lados (sem acento, capitalização diferente),
// fazendo a comparação exata falhar silenciosamente mesmo com o Raio-X já
// finalizado (achado real: "Hub_MA_São Luís_02" nunca recebia hora/duração
// real). Usado só como CHAVE de cruzamento — o valor `operacao` gravado no
// Raio-X nunca muda, continua com a grafia cadastrada no Kronos.
function normalizarOperacao(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Janela de tolerância pra casar por horário quando o ciclo não bate — 3h
// cobre a folga normal entre horário agendado e início real sem risco de
// confundir com outro ciclo do mesmo hub mais tarde no dia (esses costumam
// ficar bem mais distantes que isso).
const TOLERANCIA_HORARIO_SEG = 3 * 60 * 60;

// Acha, entre candidatos da mesma operação+data (todos os ciclos), qual é
// o certo pra uma linha de planilha: 1) ciclo bate exato (caminho normal —
// registro antigo sem ciclo gravado conta como "qualquer ciclo"); 2) senão,
// cai pro horário — se o início real cai perto o bastante
// (TOLERANCIA_HORARIO_SEG) do horário de UM único candidato, considera esse
// mesmo com o rótulo do ciclo não batendo. Só aceita se o mais próximo
// estiver claramente à frente do segundo colocado — candidatos igualmente
// próximos (ex.: dois ciclos no mesmo horário) continuam null (ambíguo),
// não arrisca escolher errado. Candidatos precisam ter `.ciclo` e `.hora`
// (string "HH:MM"/"HH:MM:SS") — quem chama com outro nome de campo (ex.:
// fluxo_operacional.horaInicio) mapeia pra esse shape antes de chamar.
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

// Janela do rascunho "ao vivo" (roteirizacao_status) — quem chama pede só
// os últimos N dias pra não carregar histórico à toa (o timer só importa
// pra operação em curso ou recém-terminada).
function dataDiasAtras(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

// dataISO +/- N dias — usado pelo fallback de casamento da Kronos x Fluxo
// (ver fluxoImport.controller.js/raioX.controller.js): a planilha-fonte
// (ROFI_3.0) às vezes registra `data_expedicao` da MESMA operação com 1 dia
// de diferença entre a chegada do horário real (bate com o dia certo do
// turno) e a chegada do SPR/Pedidos/Rotas já fechados (chega com a data um
// dia à frente) — achado real em produção, confirmado comparando
// hora_inicio_real. Sem esse ajuste, a segunda chegada nunca encontra o
// Raio-X certo e fica "solta" pra sempre.
function diaAdjacente(dataISO, deltaDias) {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDias);
  return dt.toISOString().slice(0, 10);
}

module.exports = {
  paraDataISO,
  paraSegundosDoDia,
  duracaoEmSegundos,
  paraHoraMinuto,
  dataOperacionalDoSheet,
  segundosAjustados,
  normalizarOperacao,
  TOLERANCIA_HORARIO_SEG,
  escolherRaioX,
  dataDiasAtras,
  diaAdjacente,
};
