const supabaseService = require("../services/supabaseService");
const { getCaller, supervisorIdDoAnalista } = require("../services/authz");

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

async function listRaioX(req, res) {
  const { analistaId, inicio, fim } = req.query;
  const inicioEfetivo = inicio || inicioPadrao();
  let rows = await supabaseService.listWhere(COLLECTION, [["data", ">=", inicioEfetivo]]);
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
    const sprReal = Number(sprRoteirizado);
    if (sprRoteirizado === undefined || sprRoteirizado === null || sprRoteirizado === "" || Number.isNaN(sprReal)) {
      return res.status(400).json({ error: "bad_request", message: "sprRoteirizado é obrigatório e precisa ser um número" });
    }
    observacaoFinal = observacao.trim();
    sprRealFinal = sprReal;
    sprMetaFinal = sprMeta === undefined || sprMeta === null || sprMeta === "" ? null : Number(sprMeta);
  }

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
    // Preenchido depois pela planilha de roteirização importada (ver
    // planilhaImport.controller.js, que casa por data+operação+ciclo).
    duracaoSegundos: null,
    duracaoOrigem: null,
    ts: Date.now(),
  });
  res.status(201).json(entry);
}

// Correção de preenchimento incorreto ou roteirização cancelada depois do
// fato — diferente de createRaioX (auto-declarado pelo próprio analista no
// momento em que fecha a operação), esse update é uma correção feita pelo
// supervisor da equipe (ou admin), não pelo analista. Não mexe em
// duracaoSegundos/duracaoOrigem (Tempo de Execução) de propósito — quem
// corrige isso é a planilha de roteirização importada (planilhaImport.
// controller.js), não a edição manual do Raio-X.
async function assertSupervisorDaEquipe(req, existing) {
  const [caller, supervisorId] = await Promise.all([getCaller(req), supervisorIdDoAnalista(existing.analistaId)]);
  if (!caller) return null;
  const pode = caller.isAdmin || (caller.role === "supervisor" && supervisorId === caller.id);
  return pode ? caller : null;
}

async function updateRaioX(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await assertSupervisorDaEquipe(req, existing);
  if (!caller) {
    return res.status(403).json({ error: "forbidden", message: "Só o supervisor da equipe (ou admin) pode editar uma finalização." });
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
  const souDono = existing.analistaId === req.user.uid;
  if (!souDono && !(await assertSupervisorDaEquipe(req, existing))) {
    return res.status(403).json({ error: "forbidden", message: "Você só pode excluir finalizações em seu próprio nome ou da sua equipe (supervisor)." });
  }
  await supabaseService.remove(COLLECTION, req.params.id);
  res.status(204).send();
}

module.exports = { listRaioX, createRaioX, updateRaioX, deleteRaioX };
