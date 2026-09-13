// Import da planilha "Kronos x Fluxo" (fonte: IMPORTRANGE de ROFI_3.0, Apps
// Script externo não versionado neste repo) — reaproveita o casamento por
// data+operação+ciclo/horário (planilhaMatching.js). Faz o trabalho dos
// DOIS imports que existiam antes, numa planilha só:
// - sprRoteirizado/orfaos do Raio-X (spr_final, orfaos_iniciais) — o
//   analista parou de digitar isso, só a planilha alimenta;
// - horaInicioReal/horaFimReal/duracaoSegundos — antes só vinha da planilha
//   de roteirização separada (planilhaImport.controller.js); "inicio"/"fim"
//   aqui já vêm com o mesmo horário real completo, então dá pra aposentar
//   aquele import assim que este estiver validado.
//
// Cada linha é salva por inteiro em fluxo_operacional (fonte persistida,
// não um rascunho descartável — também serve de base pra métricas de
// rotas/volume por hub mais adiante) e, se já existir um Raio-X casando
// com ela, atualiza os campos acima na hora — SEMPRE sobrescrevendo
// (decisão do usuário: a planilha é fonte da verdade, mesmo retroativa a
// um valor já digitado à mão antes desta feature existir). Se o Raio-X
// ainda não existir: fica em fluxo_operacional (createRaioX, em
// raioX.controller.js, consome a linha solta na hora da finalização) e,
// se o e-mail bater com um analista, também alimenta roteirizacao_status
// — o mesmo rascunho "ao vivo" que mostra o cronômetro "iniciado às X"
// antes do Raio-X existir (mesma ideia de planilhaImport.controller.js).
const supabaseService = require("../services/supabaseService");
const { planilhaImportToken } = require("../config/env");
const {
  paraDataISO,
  paraHoraMinuto,
  duracaoEmSegundos,
  dataOperacionalDaExpedicao,
  escolherRaioX,
  dataDiasAtras,
  diaAdjacente,
} = require("../services/planilhaMatching");

function numOuNull(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function resumir(lista, limite = 20) {
  return { total: lista.length, amostra: lista.slice(0, limite) };
}

// Mesmo helper de concorrência limitada do import de roteirização — o
// gargalo é a viagem de rede pro Supabase, não o tamanho do que a planilha
// manda.
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

async function importarFluxo(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!planilhaImportToken || token !== planilhaImportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas : [];

  const [todosRaioX, todosUsuarios, todoFluxo, todosStatus] = await Promise.all([
    supabaseService.listAll("raioX"),
    supabaseService.listAll("users"),
    supabaseService.listAll("fluxoOperacional"),
    supabaseService.listWhere("roteirizacaoStatus", [["data", ">=", dataDiasAtras(10)]]),
  ]);

  const raioXPorDataOperacao = new Map();
  for (const r of todosRaioX) {
    const chave = `${r.data}|${r.operacao}`;
    if (!raioXPorDataOperacao.has(chave)) raioXPorDataOperacao.set(chave, []);
    raioXPorDataOperacao.get(chave).push(r);
  }
  const idPorEmail = new Map(todosUsuarios.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));
  // Chave de upsert do fluxo — a planilha pode reenviar a mesma linha
  // corrigida, então isso evita duplicar em vez de sempre criar.
  const fluxoPorChave = new Map();
  for (const f of todoFluxo) {
    fluxoPorChave.set(`${f.dataExpedicao}|${f.operacao}|${f.ciclo || ""}|${f.horaInicio || ""}`, f);
  }
  const statusPorChave = new Map(); // analistaId|operacao|data (operacional) -> linha existente
  for (const s of todosStatus) {
    statusPorChave.set(`${s.analistaId}|${s.operacao}|${s.data}`, s);
  }

  let semDadosSuficientes = 0;
  const invalidos = [];
  const naoEncontrados = []; // sem Raio-X pra casar ainda — fica só em fluxo_operacional
  const ambiguos = [];
  const paraUpsertFluxo = [];
  const paraAtualizarRaioX = [];
  const paraStatus = []; // sem Raio-X ainda, mas com e-mail reconhecido — cronômetro "ao vivo"

  for (const linha of linhas) {
    // "hub_nome" é quem bate com `operacao` no resto do Kronos (padrão
    // "LM Hub_UF_Cidade") — "hub" é um código curto interno (ex.: LPA-03),
    // guardado só como referência, nunca usado pra casar.
    const operacao = String(linha.hub_nome || "").trim();
    const hubCodigo = String(linha.hub || "").trim();
    const ciclo = String(linha.ciclo || "").trim();
    const inicioTxt = String(linha.inicio || "").trim();
    const fimTxt = String(linha.fim || "").trim();
    const dataTxt = String(linha.data_expedicao || "").trim();
    const email = String(linha.analista || "").trim().toLowerCase();

    if (!operacao || !dataTxt || !inicioTxt) {
      semDadosSuficientes++;
      continue;
    }
    const dataISO = paraDataISO(dataTxt);
    if (!dataISO) {
      invalidos.push({ data: dataTxt, operacao, ciclo });
      continue;
    }
    const dataOperacional = dataOperacionalDaExpedicao(dataISO, inicioTxt);
    const analistaId = idPorEmail.get(email) || null;
    const horaInicio = paraHoraMinuto(inicioTxt);
    const temFim = !!fimTxt;
    const duracaoSegundos = temFim ? duracaoEmSegundos(inicioTxt, fimTxt) : null;

    const chaveFluxo = `${dataOperacional}|${operacao}|${ciclo}|${horaInicio || ""}`;
    const dadosFluxo = {
      dataExpedicao: dataOperacional,
      hubCodigo,
      operacao,
      analistaId,
      ciclo: ciclo || null,
      horaInicio,
      horaFim: fimTxt ? paraHoraMinuto(fimTxt) : null,
      pedRoteirizados: numOuNull(linha.ped_roteirizados),
      rotasFinal: numOuNull(linha.rotas_final),
      sprFinal: numOuNull(linha.spr_final),
      orfaosIniciais: numOuNull(linha.orfaos_iniciais),
      orfaosClustersOfensores: String(linha.orfaos_clusters_ofensores || "").trim(),
      atualizadoEm: Date.now(),
    };
    paraUpsertFluxo.push({ existente: fluxoPorChave.get(chaveFluxo) || null, dados: dadosFluxo, chaveFluxo });

    // Tenta casar com um Raio-X JÁ existente pra aplicar sprRoteirizado/
    // orfaos/horário real/duração agora — mesmo casamento (ciclo exato,
    // senão horário mais próximo) do import de roteirização.
    let candidatosRaioX = raioXPorDataOperacao.get(`${dataOperacional}|${operacao}`) || [];
    let escolhido = candidatosRaioX.length ? escolherRaioX(candidatosRaioX, ciclo, inicioTxt) : null;
    // Rede de segurança residual pra quando dataOperacionalDaExpedicao (acima)
    // ainda assim erra por 1 dia — ex.: horário mal formatado na planilha,
    // ou um caso real de anomalia na ROFI_3.0 além do deslocamento normal
    // já tratado. Só tenta o dia vizinho quando o dia exato não tem
    // CANDIDATO NENHUM, e só aceita um candidato cujo horaInicioReal JÁ
    // GRAVADO bate EXATO com o horário desta linha — critério bem mais
    // estreito que escolherRaioX (que aceita ciclo exato sozinho, sem olhar
    // hora — recorrência diária faria isso casar com QUALQUER dia vizinho
    // do mesmo ciclo, não só o certo). Sem horaInicioReal ainda gravado no
    // candidato, não arrisca — fica sem casar mesmo, mais seguro que
    // corromper o dia errado.
    if (!escolhido && candidatosRaioX.length === 0 && horaInicio) {
      for (const deltaDias of [-1, 1]) {
        const dataVizinha = diaAdjacente(dataOperacional, deltaDias);
        const candidatosVizinho = (raioXPorDataOperacao.get(`${dataVizinha}|${operacao}`) || []).filter(
          (r) => (!ciclo || r.ciclo === ciclo) && r.horaInicioReal === horaInicio
        );
        if (candidatosVizinho.length === 1) {
          escolhido = candidatosVizinho[0];
          break;
        }
      }
    }
    if (escolhido) {
      const patch = {
        sprRoteirizado: dadosFluxo.sprFinal,
        orfaos: dadosFluxo.orfaosIniciais,
        pedRoteirizados: dadosFluxo.pedRoteirizados,
        rotasFinal: dadosFluxo.rotasFinal,
        orfaosClustersOfensores: dadosFluxo.orfaosClustersOfensores || null,
        horaInicioReal: horaInicio,
      };
      if (temFim) {
        patch.duracaoSegundos = duracaoSegundos;
        patch.duracaoOrigem = "planilha";
        patch.horaFimReal = dadosFluxo.horaFim;
      }
      paraAtualizarRaioX.push({ id: escolhido.id, chaveFluxo, patch });
      continue;
    }
    if (candidatosRaioX.length > 1) {
      ambiguos.push({ data: dataOperacional, operacao, ciclo, qtd: candidatosRaioX.length });
      continue;
    }
    naoEncontrados.push({ data: dataOperacional, operacao, ciclo });

    // Sem Raio-X ainda — se o e-mail bater com um analista, alimenta o
    // cronômetro "ao vivo" (mesmo rascunho que planilhaImport.controller.js
    // já usa pra isso), pra o card mostrar "iniciado às X" antes da
    // finalização.
    if (analistaId) {
      const chaveStatus = `${analistaId}|${operacao}|${dataOperacional}`;
      paraStatus.push({
        chave: chaveStatus,
        existente: statusPorChave.get(chaveStatus) || null,
        dados: {
          analistaId,
          operacao,
          ciclo: ciclo || null,
          data: dataOperacional,
          horaInicioReal: horaInicio,
          horaFimReal: temFim ? dadosFluxo.horaFim : null,
          duracaoSegundos: temFim ? duracaoSegundos : null,
          atualizadoEm: Date.now(),
        },
      });
    }
  }

  const CONCORRENCIA = 20;
  // Atualiza os Raio-X e o cronômetro "ao vivo" em paralelo (são
  // independentes um do outro) — sempre sobrescrevendo o Raio-X, mesmo que
  // já tivesse um valor digitado à mão antes desta feature existir (decisão
  // do usuário). Guarda o id do Raio-X pra linkar a linha do fluxo depois.
  const raioXIdPorChave = new Map();
  const [errosRaioX, errosStatus] = await Promise.all([
    executarEmParalelo(paraAtualizarRaioX, CONCORRENCIA, async (item) => {
      await supabaseService.update("raioX", item.id, item.patch);
      raioXIdPorChave.set(item.chaveFluxo, item.id);
    }),
    executarEmParalelo(paraStatus, CONCORRENCIA, (item) =>
      item.existente
        ? supabaseService.update("roteirizacaoStatus", item.existente.id, item.dados)
        : supabaseService.create("roteirizacaoStatus", item.dados)
    ),
  ]);
  const errosFluxo = await executarEmParalelo(paraUpsertFluxo, CONCORRENCIA, async (item) => {
    const dados = { ...item.dados };
    const raioXId = raioXIdPorChave.get(item.chaveFluxo);
    if (raioXId) dados.raioXId = raioXId;
    if (item.existente) await supabaseService.update("fluxoOperacional", item.existente.id, dados);
    else await supabaseService.create("fluxoOperacional", { ...dados, criadoEm: Date.now() });
  });

  res.json({
    recebidas: linhas.length,
    atualizadosRaioX: paraAtualizarRaioX.length - errosRaioX.length,
    salvosFluxo: paraUpsertFluxo.length - errosFluxo.length,
    statusAoVivo: paraStatus.length - errosStatus.length,
    semDadosSuficientes,
    naoEncontrados: resumir(naoEncontrados),
    ambiguos: resumir(ambiguos),
    invalidos: resumir(invalidos),
    errosAtualizacao: resumir(errosRaioX),
    errosFluxo: resumir(errosFluxo),
    errosStatus: resumir(errosStatus),
  });
}

module.exports = { importarFluxo };
