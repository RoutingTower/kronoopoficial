const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");
const { escolherRaioX, duracaoEmSegundos } = require("../services/planilhaMatching");

const COLLECTION = "raioX";
const MIN_OBSERVACAO_LEN = 150;

// raioX cresce sem limite (1 registro por finalização de operação, de toda
// a equipe, pra sempre) — sem filtro no próprio Firestore, uma coleção
// grande faz cada carga de página contar 1 leitura por documento já
// existente, não só pelos novos. Quando o caller não pede um "inicio",
// aplicamos um default de 30 dias (mesma janela do filtro de Ocorrências no
// frontend) pra manter esse custo limitado — quem precisar de um histórico
// mais antigo tem que pedir explicitamente via ?inicio=.
const DEFAULT_JANELA_DIAS = 30;
function inicioPadrao() {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_JANELA_DIAS);
  return d.toISOString().slice(0, 10);
}

// Colunas de "campos=leve" — tudo que Resultado SPR/Tempo de Execução
// (render-supervisor.js: sprResultadoBody/tempoExecucaoBody) precisam pra
// calcular médias/tendência, sem a "observacao": texto livre (≥150
// caracteres por registro) que não entra em nenhuma conta ali, só é
// mostrada em telas que olham raio-x recente de verdade (Ocorrências,
// timeline do analista) — essas continuam pedindo sem "campos=leve", com a
// janela padrão (curta) de qualquer forma. Ver docs do ajuste de egress.
const CAMPOS_LEVE = [
  "id", "analistaId", "operacao", "ciclo", "hora", "data", "estrelas",
  "sprRoteirizado", "sprMeta", "semRoteirizacao", "orfaos",
  "pedRoteirizados", "rotasFinal",
  "duracaoSegundos", "duracaoOrigem", "ts",
];

async function listRaioX(req, res) {
  const { analistaId, inicio, fim, campos } = req.query;
  const inicioEfetivo = inicio || inicioPadrao();
  const colunas = campos === "leve" ? CAMPOS_LEVE : undefined;
  let rows = await supabaseService.listWhere(COLLECTION, [["data", ">=", inicioEfetivo]], colunas);
  if (analistaId) rows = rows.filter((r) => r.analistaId === analistaId);
  if (fim) rows = rows.filter((r) => (r.data || "") <= fim);
  res.json(rows);
}

// Espelha o processo de finalização obrigatório do card de operação no
// kanban do analista (frontend/js/events.js): nota de 1 a 5 estrelas, uma
// observação com no mínimo 150 caracteres, e o SPR roteirizado (real) da
// operação — ver frontend/js/utils.js (isOperacaoFinalizada, RAIOX_MIN_OBS_LEN).
// Finalização é sempre auto-declarada pelo próprio analista (ver
// frontend/js/events.js) — ninguém finaliza operação de outra pessoa.
async function createRaioX(req, res) {
  const { analistaId, operacao, ciclo, hora, data, estrelas, observacao, sprRoteirizado, sprMeta, semRoteirizacao, orfaos } = req.body;
  if (!analistaId || !operacao || !hora || !data) {
    return res.status(400).json({
      error: "bad_request",
      message: "analistaId, operacao, hora e data são obrigatórios",
    });
  }
  const caller = await getCaller(req);
  if (!caller?.isAdmin && analistaId !== req.user.uid) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode finalizar operações em seu próprio nome." });
  }
  const nota = Number(estrelas);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ error: "bad_request", message: "estrelas deve ser um inteiro de 1 a 5" });
  }
  // Órfãos: opcional de verdade (diferente do SPR) — nulo é "não informado",
  // não "zero". Quem marca "Sem órfãos" no front manda 0 explicitamente.
  let orfaosFinal = null;
  if (orfaos !== undefined && orfaos !== null && orfaos !== "") {
    const n = Number(orfaos);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: "bad_request", message: "orfaos deve ser um número inteiro maior ou igual a 0" });
    }
    orfaosFinal = n;
  }

  // Ciclo sem roteirização nesse horário: SPR e observação deixam de ser
  // obrigatórios (não tem o que lançar/comparar). sprMeta é ignorado e
  // sempre gravado como null pra esse registro nunca entrar nas contas de
  // "bateu a meta" do Resultado SPR (ver sprResultadoBody, render-supervisor.js,
  // e analistaDesempenho, render-analista.js — ambos filtram por sprMeta!=null).
  let observacaoFinal, sprRealFinal, sprMetaFinal;
  if (semRoteirizacao) {
    observacaoFinal = (observacao || "").trim() || "Sem roteirização nesse horário.";
    sprRealFinal = 0;
    sprMetaFinal = null;
  } else {
    if (!observacao || observacao.trim().length < MIN_OBSERVACAO_LEN) {
      return res.status(400).json({
        error: "bad_request",
        message: `observacao é obrigatória, com no mínimo ${MIN_OBSERVACAO_LEN} caracteres`,
      });
    }
    observacaoFinal = observacao.trim();
    sprMetaFinal = sprMeta === undefined || sprMeta === null || sprMeta === "" ? null : Number(sprMeta);
    // sprRoteirizado não é mais digitado pelo analista — vem da planilha
    // Kronos x Fluxo (ver fluxoImport.controller.js), aplicado logo abaixo
    // se já tiver chegado, ou mais tarde pelo próximo import. Se mesmo
    // assim vier no corpo (compatibilidade), respeita o valor mandado.
    if (sprRoteirizado === undefined || sprRoteirizado === null || sprRoteirizado === "") {
      sprRealFinal = null;
    } else {
      const sprReal = Number(sprRoteirizado);
      if (Number.isNaN(sprReal)) {
        return res.status(400).json({ error: "bad_request", message: "sprRoteirizado precisa ser um número" });
      }
      sprRealFinal = sprReal;
    }
  }

  // Kronos x Fluxo pode já ter chegado ANTES desta finalização — se
  // sprRoteirizado e/ou orfaos ainda não vieram no corpo, procura uma
  // linha do fluxo pra essa operação+ciclo+data ainda sem Raio-X vinculado
  // (mesmo casamento por ciclo/horário de escolherRaioX, só que aqui os
  // "candidatos" são linhas do fluxo, não Raio-X) e usa ela agora — sem
  // isso, um dado que chegou cedo demais nunca seria aproveitado (o
  // próximo import só sabe ATUALIZAR um Raio-X que já existe).
  let fluxoEncontrado = null;
  if (!semRoteirizacao && (sprRealFinal === null || orfaosFinal === null)) {
    const candidatosFluxo = (await supabaseService.listWhere("fluxoOperacional", [
      ["dataExpedicao", "==", data],
      ["operacao", "==", operacao],
    ])).filter((f) => !f.raioXId);
    fluxoEncontrado = candidatosFluxo.length
      ? escolherRaioX(candidatosFluxo.map((f) => ({ ...f, hora: f.horaInicio })), ciclo, hora)
      : null;
    if (fluxoEncontrado) {
      if (sprRealFinal === null) sprRealFinal = fluxoEncontrado.sprFinal ?? null;
      if (orfaosFinal === null && (orfaos === undefined || orfaos === null || orfaos === "")) {
        orfaosFinal = fluxoEncontrado.orfaosIniciais ?? null;
      }
    }
  }
  // Pedidos roteirizados/rotas final e horário real/duração — mesma linha
  // de fluxo (se achada acima), independente de SPR/Órfãos já terem vindo
  // no corpo ou não (esses dois campos nunca vêm do front, só da planilha).
  const pedRoteirizadosFinal = fluxoEncontrado ? fluxoEncontrado.pedRoteirizados ?? null : null;
  const rotasFinalFinal = fluxoEncontrado ? fluxoEncontrado.rotasFinal ?? null : null;
  const orfaosClustersOfensoresFinal = fluxoEncontrado ? fluxoEncontrado.orfaosClustersOfensores || null : null;
  const horaInicioRealFinal = fluxoEncontrado ? fluxoEncontrado.horaInicio ?? null : null;
  const horaFimRealFinal = fluxoEncontrado ? fluxoEncontrado.horaFim ?? null : null;
  const duracaoSegundosFinal = fluxoEncontrado && fluxoEncontrado.horaInicio && fluxoEncontrado.horaFim
    ? duracaoEmSegundos(fluxoEncontrado.horaInicio, fluxoEncontrado.horaFim)
    : null;

  // Evita duplicar quando o analista reenvia o mesmo Raio-X (ex.: achou que
  // não tinha ido da primeira vez e clicou de novo minutos depois) — cada
  // duplicata some com a visibilidade da Grade/Programação, porque o front
  // acha só UM registro por analista+operação+hora+data e não sabe qual dos
  // vários escolher (visto em produção: Hub_SP_Piracicaba chegou a ter 7
  // linhas pro mesmo horário). Se já existe, devolve o existente em vez de
  // criar outro.
  const existentes = await supabaseService.listWhere(COLLECTION, [
    ["analistaId", "==", analistaId],
    ["operacao", "==", operacao],
    ["hora", "==", hora],
    ["data", "==", data],
  ]);
  if (existentes.length > 0) {
    return res.status(200).json(existentes[0]);
  }

  const entry = await supabaseService.create(COLLECTION, {
    analistaId,
    operacao,
    ciclo: ciclo || null,
    hora,
    data,
    estrelas: nota,
    observacao: observacaoFinal,
    sprRoteirizado: sprRealFinal,
    sprMeta: sprMetaFinal,
    semRoteirizacao: !!semRoteirizacao,
    orfaos: orfaosFinal,
    pedRoteirizados: pedRoteirizadosFinal,
    rotasFinal: rotasFinalFinal,
    orfaosClustersOfensores: orfaosClustersOfensoresFinal,
    // Preenchido depois pela planilha de roteirização/Kronos x Fluxo
    // importada (ver planilhaImport.controller.js/fluxoImport.controller.js,
    // que casam por data+operação+ciclo) — ou já agora mesmo, se a linha do
    // fluxo já tiver chegado antes desta finalização (fluxoEncontrado acima).
    duracaoSegundos: duracaoSegundosFinal,
    duracaoOrigem: duracaoSegundosFinal != null ? "planilha" : null,
    horaInicioReal: horaInicioRealFinal,
    horaFimReal: horaFimRealFinal,
    ts: Date.now(),
  });
  // Vincula a linha do fluxo que já foi consumida acima — sem isso ela
  // ficaria "solta" (sem raioXId) e um import futuro podia tentar casar
  // ela de novo com outro Raio-X por engano.
  if (fluxoEncontrado) {
    await supabaseService.update("fluxoOperacional", fluxoEncontrado.id, { raioXId: entry.id });
  }
  res.status(201).json(entry);
}

// Correção de preenchimento incorreto ou roteirização cancelada depois do
// fato — tanto o supervisor da equipe (ou admin) quanto o PRÓPRIO analista
// dono do Raio-X podem editar (ex.: digitou o SPR no campo de Órfãos por
// engano). Não mexe em duracaoSegundos/duracaoOrigem (Tempo de Execução)
// de propósito — quem corrige isso é a planilha de roteirização importada
// (planilhaImport.controller.js), não a edição manual do Raio-X.
async function assertPodeEditarRaioX(req, existing) {
  const caller = await getCaller(req);
  if (!caller) return null;
  if (caller.isAdmin || caller.id === existing.analistaId) return caller;
  const supervisorId = await supervisorIdDoAnalista(existing.analistaId);
  return caller.role === "supervisor" && supervisorId === caller.id ? caller : null;
}

async function updateRaioX(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await assertPodeEditarRaioX(req, existing);
  if (!caller) {
    return res.status(403).json({ error: "forbidden", message: "Só o próprio analista ou o supervisor da equipe (ou admin) pode editar uma finalização." });
  }

  const { estrelas, observacao, sprRoteirizado, sprMeta, semRoteirizacao, orfaos } = req.body;
  const patch = {};
  if (estrelas !== undefined) {
    const nota = Number(estrelas);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ error: "bad_request", message: "estrelas deve ser um inteiro de 1 a 5" });
    }
    patch.estrelas = nota;
  }
  const semRotFinal = semRoteirizacao !== undefined ? !!semRoteirizacao : existing.semRoteirizacao;
  if (semRoteirizacao !== undefined) patch.semRoteirizacao = semRotFinal;
  if (semRotFinal) {
    if (observacao !== undefined) patch.observacao = (observacao || "").trim() || "Sem roteirização nesse horário.";
    if (sprRoteirizado !== undefined || semRoteirizacao === true) patch.sprRoteirizado = 0;
    if (sprMeta !== undefined || semRoteirizacao === true) patch.sprMeta = null;
  } else {
    if (observacao !== undefined) {
      if (!observacao || observacao.trim().length < MIN_OBSERVACAO_LEN) {
        return res.status(400).json({
          error: "bad_request",
          message: `observacao é obrigatória, com no mínimo ${MIN_OBSERVACAO_LEN} caracteres`,
        });
      }
      patch.observacao = observacao.trim();
    }
    if (sprRoteirizado !== undefined) {
      const sprReal = Number(sprRoteirizado);
      if (sprRoteirizado === null || sprRoteirizado === "" || Number.isNaN(sprReal)) {
        return res.status(400).json({ error: "bad_request", message: "sprRoteirizado precisa ser um número" });
      }
      patch.sprRoteirizado = sprReal;
    }
    if (sprMeta !== undefined) patch.sprMeta = sprMeta === null || sprMeta === "" ? null : Number(sprMeta);
  }
  // Órfãos é independente de semRoteirizacao (dá pra corrigir sem mexer no
  // resto) — mesma regra de opcional-de-verdade do createRaioX: "" ou null
  // volta a ser "não informado", nunca zero.
  if (orfaos !== undefined) {
    if (orfaos === null || orfaos === "") {
      patch.orfaos = null;
    } else {
      const n = Number(orfaos);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: "bad_request", message: "orfaos deve ser um número inteiro maior ou igual a 0" });
      }
      patch.orfaos = n;
    }
  }

  const updated = await supabaseService.update(COLLECTION, req.params.id, patch);
  res.json(updated);
}

async function deleteRaioX(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (!(await assertPodeEditarRaioX(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir finalizações em seu próprio nome ou da sua equipe (supervisor)." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listRaioX, createRaioX, updateRaioX, deleteRaioX };
