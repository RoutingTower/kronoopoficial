// Analista envia uma operação SUA do dia (titular ou cobertura) pra outro
// analista ativo da própria equipe; quem recebe fica com a resposta
// pendente até aceitar ou recusar (o modal bloqueante fica no frontend,
// ver render-analista.js/main.js) — aceitar de fato muda quem executa a
// operação, recusar não muda nada. Sem limite de agenda de propósito:
// aceitar nunca é bloqueado por conflito de horário aqui no backend — o
// aviso ("você já tem outra operação nesse horário") é só no frontend,
// antes de confirmar (ver conflitoAoMoverPara, utils.js), e mesmo com
// aviso o aceite segue em frente se a pessoa confirmar.
const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");
const { notificar } = require("../services/notificar");

const COLLECTION = "operacaoTransferencias";
const CATEGORIAS = ["fixa", "cobertura", "avulsa"];

// Analista vê as próprias (enviadas OU recebidas); supervisor vê tudo da
// equipe (auditoria) — mesmo espírito de "escopo já resolvido no backend"
// do resto do app.
async function listTransferencias(req, res) {
  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden" });
  const rows = await supabaseService.listAll(COLLECTION);
  if (caller.isAdmin) return res.json(rows);
  if (caller.role === "supervisor") {
    const equipe = await supabaseService.listWhere("users", [["supervisorId", "==", caller.id]]);
    const ids = new Set(equipe.map((u) => u.id));
    return res.json(rows.filter((r) => ids.has(r.origemAnalistaId) || ids.has(r.destinoAnalistaId)));
  }
  res.json(rows.filter((r) => r.origemAnalistaId === caller.id || r.destinoAnalistaId === caller.id));
}

async function createTransferencia(req, res) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "analista") {
    return res.status(403).json({ error: "forbidden", message: "Só analistas podem enviar uma operação pra outro analista." });
  }
  const { destinoAnalistaId, categoria, bmId, operacao, ciclo, horaInicio, horaFim, data } = req.body;
  let { titularId } = req.body;
  if (!destinoAnalistaId || !categoria || !bmId || !operacao || !horaInicio || !horaFim || !data) {
    return res.status(400).json({ error: "bad_request", message: "destinoAnalistaId, categoria, bmId, operacao, horaInicio, horaFim e data são obrigatórios." });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: "bad_request", message: "categoria inválida." });
  }
  if (destinoAnalistaId === caller.id) {
    return res.status(400).json({ error: "bad_request", message: "Não dá pra enviar uma operação pra você mesmo." });
  }
  const destino = await supabaseService.getById("users", destinoAnalistaId);
  if (!destino || destino.role !== "analista" || !destino.active || destino.supervisorId !== caller.supervisorId) {
    return res.status(400).json({ error: "bad_request", message: "O destinatário precisa ser um analista ativo da sua própria equipe." });
  }

  // Confere que quem está enviando REALMENTE está com essa operação agora
  // (não confia no que o frontend mandou) — mesmo espírito da checagem de
  // createAusencia (ausencias.controller.js): a tela pode estar
  // desatualizada (a operação já foi repassada por outro caminho enquanto
  // essa aba ficava aberta).
  if (categoria === "fixa") {
    const bm = await supabaseService.getById("baseMestra", bmId);
    if (!bm || bm.analistaId !== caller.id) {
      return res.status(400).json({ error: "bad_request", message: "Essa operação não é mais sua — atualize a página e confira." });
    }
    titularId = caller.id; // fixa: o titular é sempre quem está enviando, nunca confia no client aqui.
  } else if (categoria === "cobertura") {
    if (!titularId) return res.status(400).json({ error: "bad_request", message: "titularId é obrigatório pra categoria 'cobertura'." });
    const ausenciaAtual = await supabaseService.listWhere("ausencias", [
      ["baseMestraId", "==", bmId], ["data", "==", data], ["analistaId", "==", titularId], ["suplenteId", "==", caller.id],
    ]);
    if (ausenciaAtual.length === 0) {
      return res.status(400).json({ error: "bad_request", message: "Você não está cobrindo essa operação — atualize a página e confira." });
    }
  } else {
    const suplencia = await supabaseService.getById("suplencias", bmId);
    if (!suplencia || suplencia.suplente !== caller.name || suplencia.dataCobertura !== data) {
      return res.status(400).json({ error: "bad_request", message: "Você não está cobrindo essa operação — atualize a página e confira." });
    }
  }

  // Trava duplicidade: já existe um envio pendente pra essa MESMA operação
  // (mesma categoria+bmId+data) partindo de quem está chamando — evita
  // reenviar em cima de uma resposta ainda em aberto (cancela a anterior
  // antes, se quiser mudar de destinatário).
  const jaPendente = await supabaseService.listWhere(COLLECTION, [
    ["origemAnalistaId", "==", caller.id], ["bmId", "==", bmId], ["categoria", "==", categoria],
    ["data", "==", data], ["status", "==", "pendente"],
  ]);
  if (jaPendente.length > 0) {
    return res.status(409).json({ error: "conflict", message: "Já existe um envio pendente pra essa operação — cancele antes de enviar de novo." });
  }

  const entry = await supabaseService.create(COLLECTION, {
    origemAnalistaId: caller.id,
    destinoAnalistaId,
    categoria,
    bmId,
    titularId: titularId || null,
    operacao,
    ciclo: ciclo || "",
    horaInicio,
    horaFim,
    data,
    status: "pendente",
    criadoEm: Date.now(),
    respondidoEm: null,
  });
  await notificar(destinoAnalistaId, "agenda", `${caller.name} quer te passar a operação ${operacao} (${horaInicio}–${horaFim}) de ${data}. Responda na Programação.`);
  // Supervisor sempre é avisado de toda a movimentação (pedido explícito —
  // ele fica de fora da negociação em si, mas nunca sem saber que ela
  // aconteceu), nas 4 transições possíveis: enviado, cancelado, recusado
  // e aceito (ver os outros notificar(caller.supervisorId, ...) abaixo).
  await notificar(caller.supervisorId, "agenda", `${caller.name} está enviando a operação ${operacao} (${data}) pra ${destino.name} — aguardando resposta.`);
  res.status(201).json(entry);
}

// Só quem enviou cancela, e só enquanto ainda está pendente — desiste sem
// esperar a outra pessoa responder (ex.: mandou pra pessoa errada).
async function cancelarTransferencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller || existing.origemAnalistaId !== caller.id) {
    return res.status(403).json({ error: "forbidden", message: "Só quem enviou pode cancelar." });
  }
  if (existing.status !== "pendente") {
    return res.status(409).json({ error: "conflict", message: "Esse envio já foi respondido." });
  }
  const updated = await supabaseService.update(COLLECTION, req.params.id, { status: "cancelado", respondidoEm: Date.now() });
  const destino = await supabaseService.getById("users", existing.destinoAnalistaId);
  await notificar(caller.supervisorId, "agenda", `${caller.name} cancelou o envio da operação ${existing.operacao} (${existing.data}) que tinha mandado pra ${destino?.name || "—"}.`);
  res.json(updated);
}

async function responderTransferencia(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const caller = await getCaller(req);
  if (!caller || existing.destinoAnalistaId !== caller.id) {
    return res.status(403).json({ error: "forbidden", message: "Só quem recebeu pode responder." });
  }
  if (existing.status !== "pendente") {
    return res.status(409).json({ error: "conflict", message: "Esse envio já foi respondido." });
  }
  const { aceito } = req.body;
  if (typeof aceito !== "boolean") {
    return res.status(400).json({ error: "bad_request", message: "aceito (true/false) é obrigatório." });
  }

  const origem = await supabaseService.getById("users", existing.origemAnalistaId);

  if (!aceito) {
    const updated = await supabaseService.update(COLLECTION, req.params.id, { status: "recusado", respondidoEm: Date.now() });
    await notificar(existing.origemAnalistaId, "agenda", `${caller.name} recusou a operação ${existing.operacao} de ${existing.data}.`);
    await notificar(caller.supervisorId, "agenda", `${caller.name} recusou a operação ${existing.operacao} (${existing.data}) que ${origem?.name || "alguém"} tinha enviado.`);
    return res.json({ transferencia: updated, resultado: null });
  }

  // Mesma mutação de dado que o "Salvar" do arrastar-e-soltar do
  // supervisor já faz por categoria (ver btnSalvarProgMoves, events.js) —
  // só que disparada pelo aceite do destinatário, com autoridade do
  // backend (analista não tem permissão direta de escrever em
  // ausencias/suplencias — só supervisor, ver ausencias.controller.js).
  const destinoNome = caller.name;
  let resultado = null;
  if (existing.categoria === "fixa") {
    // Mesma trava de duplicidade do createAusencia (ausencias.controller.js)
    // — sem isso, aceitar duas transferências "fixa" da mesma operação+data
    // (ex.: enviada de novo pra outra pessoa antes da primeira ausência ser
    // corrigida) cria duas linhas de ausência com suplentes diferentes pro
    // mesmo titular, e a operação passa a aparecer na agenda dos dois.
    const jaExiste = await supabaseService.listWhere("ausencias", [["baseMestraId", "==", existing.bmId], ["data", "==", existing.data]]);
    if (jaExiste.length > 0) {
      return res.status(409).json({ error: "conflict", message: "Já existe uma ausência registrada pra essa operação nessa data — não dá pra aceitar essa transferência agora." });
    }
    resultado = await supabaseService.create("ausencias", {
      analistaId: existing.titularId,
      baseMestraId: existing.bmId,
      operacao: existing.operacao,
      ciclo: existing.ciclo,
      horaInicio: existing.horaInicio,
      horaFim: existing.horaFim,
      data: existing.data,
      tipo: "folga",
      suplenteId: existing.destinoAnalistaId,
      suplenteNome: destinoNome,
    });
  } else if (existing.categoria === "cobertura") {
    const ausenciaOriginal = await supabaseService.listWhere("ausencias", [
      ["baseMestraId", "==", existing.bmId], ["data", "==", existing.data], ["analistaId", "==", existing.titularId],
    ]);
    const alvo = ausenciaOriginal[0];
    if (!alvo) {
      return res.status(409).json({ error: "conflict", message: "A ausência original dessa cobertura não existe mais (pode já ter sido alterada por outra pessoa)." });
    }
    resultado = await supabaseService.update("ausencias", alvo.id, { suplenteId: existing.destinoAnalistaId, suplenteNome: destinoNome });
  } else {
    resultado = await supabaseService.update("suplencias", existing.bmId, { suplente: destinoNome });
  }

  const updated = await supabaseService.update(COLLECTION, req.params.id, { status: "aceito", respondidoEm: Date.now() });
  await notificar(existing.origemAnalistaId, "agenda", `${destinoNome} aceitou a operação ${existing.operacao} de ${existing.data} — ela já é dele(a) agora.`);
  await notificar(caller.supervisorId, "agenda", `${destinoNome} aceitou a operação ${existing.operacao} (${existing.data}) que ${origem?.name || "alguém"} tinha enviado — já mudou de titular/suplente.`);
  res.json({ transferencia: updated, resultado });
}

module.exports = { listTransferencias, createTransferencia, cancelarTransferencia, responderTransferencia };
