/**
 * Apps Script da planilha "Kronos x Fluxo" — lê as linhas da aba e manda
 * pro Kronos via POST /api/fluxo-import (backend/src/controllers/
 * fluxoImport.controller.js), pra preencher SPR roteirizado e Órfãos no
 * Raio-X automaticamente, sem o analista digitar.
 *
 * COMO INSTALAR
 * 1. Na planilha "Kronos x Fluxo": Extensões > Apps Script.
 * 2. Cole este arquivo inteiro (substitui o Code.gs padrão, ou adicione
 *    como um arquivo novo — tanto faz).
 * 3. Configure as Propriedades do Script (⚙️ Configurações do projeto >
 *    Propriedades do script > Adicionar propriedade):
 *      BACKEND_URL             = https://kronoopoficial.onrender.com/api/fluxo-import
 *      PLANILHA_IMPORT_TOKEN   = <o mesmo valor que já está configurado
 *                                 no Render como PLANILHA_IMPORT_TOKEN —
 *                                 pegue com quem administra o backend,
 *                                 NUNCA cole o token direto no código>
 *    (Guardar o token nas Propriedades do Script em vez de no código evita
 *    expor ele se alguém compartilhar a planilha ou o link do projeto.)
 * 4. Rode a função `criarGatilhoHorario` uma vez (menu Executar, ou
 *    selecione ela no dropdown de funções e clique ▶). Isso autoriza o
 *    script (vai pedir permissão — é o próprio dono da planilha
 *    autorizando, normal) e cria o gatilho de hora em hora.
 * 5. Pra testar manualmente sem esperar o gatilho, rode `importarKronosXFluxo`
 *    direto e olhe o log (Ver > Registros de execução).
 *
 * A aba precisa ter esse cabeçalho na primeira linha (a ordem das colunas
 * não importa, é lido pelo NOME do cabeçalho — só o texto exato precisa
 * bater):
 *   data_expedicao | hub | hub_nome | analista | ciclo | inicio | fim |
 *   ped_roteirizados | rotas_final | spr_final | orfaos_iniciais |
 *   orfaos_clusters_ofensores
 */

// Nome exato da aba com os dados — ajuste se a aba tiver outro nome.
var NOME_ABA = "Kronos x Fluxo";

// Só manda linhas cuja data_expedicao caia dentro dessa janela (dias pra
// trás, a partir de hoje) — evita reenviar toda a história a cada rodada
// (a aba só cresce) e ainda cobre o caso de uma correção retroativa
// recente (o backend SEMPRE sobrescreve o valor do Raio-X quando a linha
// bate, mesmo que já tivesse um valor antes — ver fluxoImport.controller.js).
// Se precisar corrigir algo mais antigo que isso, aumente o número
// temporariamente, rode `importarKronosXFluxo` manualmente uma vez, e
// volte pro valor padrão depois.
var JANELA_DIAS = 5;

// Tamanho de cada lote enviado por requisição — a aba pode ter dezenas de
// milhares de linhas de histórico; manda em lotes pra não passar do limite
// de tempo/tamanho do UrlFetchApp.
var TAMANHO_LOTE = 300;

var CABECALHOS_ESPERADOS = [
  "data_expedicao", "hub", "hub_nome", "analista", "ciclo", "inicio", "fim",
  "ped_roteirizados", "rotas_final", "spr_final", "orfaos_iniciais",
  "orfaos_clusters_ofensores",
];

function importarKronosXFluxo() {
  var props = PropertiesService.getScriptProperties();
  var backendUrl = props.getProperty("BACKEND_URL");
  var token = props.getProperty("PLANILHA_IMPORT_TOKEN");
  if (!backendUrl || !token) {
    throw new Error(
      "Configure BACKEND_URL e PLANILHA_IMPORT_TOKEN em Configurações do projeto > Propriedades do script."
    );
  }

  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA);
  if (!aba) throw new Error('Aba "' + NOME_ABA + '" não encontrada.');

  var valores = aba.getDataRange().getValues();
  if (valores.length < 2) {
    Logger.log("Sem linhas de dados (só cabeçalho ou aba vazia).");
    return;
  }

  var cabecalho = valores[0];
  var indice = {};
  CABECALHOS_ESPERADOS.forEach(function (nome) {
    var pos = cabecalho.indexOf(nome);
    if (pos === -1) throw new Error('Coluna "' + nome + '" não encontrada no cabeçalho da aba.');
    indice[nome] = pos;
  });

  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var limiteData = new Date();
  limiteData.setDate(limiteData.getDate() - JANELA_DIAS);

  var linhas = [];
  for (var i = 1; i < valores.length; i++) {
    var linha = valores[i];
    var dataExpedicaoRaw = linha[indice.data_expedicao];
    if (!dataExpedicaoRaw) continue; // linha vazia/incompleta, ignora

    var dataExpedicaoDate = dataExpedicaoRaw instanceof Date ? dataExpedicaoRaw : null;
    if (dataExpedicaoDate && dataExpedicaoDate < limiteData) continue; // fora da janela, pula

    linhas.push({
      data_expedicao: formatarData(dataExpedicaoRaw, tz),
      hub: String(linha[indice.hub] || "").trim(),
      hub_nome: String(linha[indice.hub_nome] || "").trim(),
      analista: String(linha[indice.analista] || "").trim(),
      ciclo: String(linha[indice.ciclo] || "").trim(),
      inicio: formatarHora(linha[indice.inicio], tz),
      fim: formatarHora(linha[indice.fim], tz),
      ped_roteirizados: numeroOuNulo(linha[indice.ped_roteirizados]),
      rotas_final: numeroOuNulo(linha[indice.rotas_final]),
      spr_final: numeroOuNulo(linha[indice.spr_final]),
      orfaos_iniciais: numeroOuNulo(linha[indice.orfaos_iniciais]),
      orfaos_clusters_ofensores: String(linha[indice.orfaos_clusters_ofensores] || "").trim(),
    });
  }

  if (!linhas.length) {
    Logger.log("Nenhuma linha dentro da janela de " + JANELA_DIAS + " dia(s) pra enviar.");
    return;
  }

  Logger.log("Enviando " + linhas.length + " linha(s) em lotes de " + TAMANHO_LOTE + "...");
  for (var offset = 0; offset < linhas.length; offset += TAMANHO_LOTE) {
    var lote = linhas.slice(offset, offset + TAMANHO_LOTE);
    enviarLote(backendUrl, token, lote);
  }
  Logger.log("Concluído.");
}

function enviarLote(backendUrl, token, linhas) {
  var resposta = UrlFetchApp.fetch(backendUrl, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ linhas: linhas }),
    muteHttpExceptions: true,
  });
  var codigo = resposta.getResponseCode();
  var corpo = resposta.getContentText();
  if (codigo !== 200) {
    Logger.log("ERRO (HTTP " + codigo + ") lote de " + linhas.length + " linha(s): " + corpo);
    throw new Error("Falha ao importar lote — HTTP " + codigo + ": " + corpo);
  }
  Logger.log("Lote de " + linhas.length + " linha(s) OK: " + corpo);
}

// Datas/horas digitadas em colunas formatadas como Data/Hora no Sheets
// chegam como objeto Date no Apps Script, não como texto — formata pro
// texto que o backend espera (paraDataISO/paraHoraMinuto em
// planilhaMatching.js). Se a coluna for texto puro (ex.: já digitada como
// "10/09/2026"), só devolve o texto como está.
function formatarData(valor, tz) {
  if (valor instanceof Date) return Utilities.formatDate(valor, tz, "dd/MM/yyyy");
  return String(valor || "").trim();
}

function formatarHora(valor, tz) {
  if (!valor) return "";
  if (valor instanceof Date) return Utilities.formatDate(valor, tz, "HH:mm:ss");
  return String(valor).trim();
}

function numeroOuNulo(valor) {
  if (valor === "" || valor === null || valor === undefined) return null;
  var n = Number(valor);
  return isNaN(n) ? null : n;
}

// Roda uma vez pra criar o gatilho de hora em hora (mesmo intervalo do
// Apps Script da planilha de roteirização, que já alimenta o Kronos hoje).
// Rodar de novo é seguro — remove um gatilho antigo desta função antes de
// criar outro, pra nunca duplicar.
function criarGatilhoHorario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "importarKronosXFluxo") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("importarKronosXFluxo").timeBased().everyHours(1).create();
  Logger.log("Gatilho de hora em hora criado.");
}
