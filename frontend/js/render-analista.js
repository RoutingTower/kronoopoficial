/* Telas do papel Analista: programação, caixa de entrada e lembretes. */

// Tempo de Execução — área de ação do flashcard, com 2 estados possíveis:
// 1) já finalizado (raio-x existe) — mostra o resumo, com a duração (vem da
//    planilha de roteirização importada, ver planilhaImport.controller.js —
//    não tem mais cronômetro Iniciar/Finalizar dentro do Kronos);
// 2) ainda não — botão pra enviar o Raio-X (estrelas, observação, SPR).
function renderExecucaoActions(it, dateStr, analistaId, sprMeta, souEu){
  const raiox = encontrarRaioX(analistaId, it.operacao, it.horaInicio, dateStr);
  if(raiox){
    // Início/fim reais vêm da planilha de roteirização (hora_inicio_real/
    // hora_fim_real) — registro anterior a essa importação não tem, aí
    // mostra só a duração.
    const horarioReal = (raiox.horaInicioReal && raiox.horaFimReal) ? `${raiox.horaInicioReal}–${raiox.horaFimReal} · ` : '';
    const duracaoHtml = raiox.duracaoSegundos!=null
      ? ` · ${icon('timer',11)} ${horarioReal}${formatarDuracao(raiox.duracaoSegundos)}${raiox.duracaoSegundos>SLA_TEMPO_EXECUCAO_SEGUNDOS ? ' <span style="color:var(--alert);font-weight:600;">acima do SLA</span>' : ''}`
      : '';
    // Editar: o próprio analista (preenchimento incorreto — ex.: SPR e
    // Órfãos trocados de campo) ou o supervisor da equipe podem corrigir
    // (ver raioX.controller.js, updateRaioX/assertPodeEditarRaioX). Excluir
    // continua só pro supervisor por aqui — mais destrutivo, sem pedido pra
    // liberar pro próprio analista.
    const acoesRaioX = `<div class="flash-actions" style="margin-top:6px;">
        <button class="btn" data-editar-raiox="${raiox.id}">${icon('pencil',12)} Editar</button>
        ${!souEu ? `<button class="btn btn-danger" data-excluir-raiox="${raiox.id}">${icon('trash-2',12)} Excluir</button>` : ''}
      </div>`;
    // Órfãos é independente de semRoteirizacao (pode ter órfão registrado
    // mesmo sem roteirização) — nulo é "não informado", não mostra nada.
    const orfaosHtml = raiox.orfaos!=null ? ` · Órfãos ${raiox.orfaos}` : '';
    return `<div class="flash-meta" style="margin-top:6px;">Raio-X: ${starDisplay(raiox.estrelas)}${raiox.semRoteirizacao ? ' · Sem roteirização' : raiox.sprRoteirizado!=null ? ` · SPR lançado ${escapeHtml(String(raiox.sprRoteirizado))}` : ''}${orfaosHtml}${duracaoHtml}</div>${acoesRaioX}`;
  }
  if(!souEu) return ''; // sem raio-x ainda: enviar só faz sentido pra quem executa
  // Ainda sem Raio-X — a planilha de roteirização pode já ter registrado o
  // início real mesmo assim (roteirizacao_status, ver
  // planilhaImport.controller.js, identifica o analista pelo e-mail da
  // própria planilha). Cronômetro ao vivo com base nesse horário, não num
  // clique dentro do Kronos (não existe mais).
  const emAndamento = DB.roteirizacaoStatus.find(s=>s.analistaId===analistaId && s.operacao===it.operacao && s.data===dateStr && s.horaInicioReal && !s.horaFimReal);
  // Sem confirmação real da planilha, não estima nada a partir do horário
  // programado — só o botão de Enviar Raio-X abaixo, sem número que possa
  // não refletir a realidade (a operação pode nem ter começado ainda).
  const timerHtml = emAndamento ? `<div class="timer-live" data-timer-desde="${slotTimestamp(dateStr, emAndamento.horaInicioReal)}">
      <span class="timer-dot"></span><span class="timer-num mono">00:00</span><span class="timer-tag">em andamento</span>
    </div>` : '';
  const dataAttrs = `data-finalizar-op="${escapeHtml(it.operacao)}" data-hora="${it.horaInicio}" data-data="${dateStr}" data-ciclo="${escapeHtml(it.ciclo)}" data-spr-meta="${sprMeta!=null?sprMeta:''}"`;
  return `${timerHtml}<div class="flash-actions"><button class="btn btn-brand" ${dataAttrs}>${icon('send',12)} Enviar Raio-X</button></div>`;
}

// showLembretes só é true na própria Programação do analista (renderAnalista) —
// a "Programação Analista" do supervisor reusa esta mesma função pra ver a
// rota de qualquer analista da equipe, e lembretes são um to-do pessoal
// (origem:self), não algo que deva aparecer na visão do supervisor.
// opFiltro (fixa/cobertura/folga) também só vem preenchido da própria
// Programação do analista — ver categoriaOperacao() em utils.js.
// Constrói os cards (operação + reunião + lembrete) de UMA hora — extraído
// pra ser reaproveitado tanto pelo kanban horizontal quanto pela lista
// vertical (ver renderFlashcardRow abaixo), sem duplicar a lógica de
// status/execução/particularidade.
function buildHourCardsHtml(items, rns, lembretes, ctx){
  const {analistaId, dateStr, supervisorId} = ctx;
  let cardsHtml = items.map(it=>{
      const status = computeStatus(it.horaInicio, dateStr, analistaId, it.operacao, it.isOff);
      const spr = getSPR(supervisorId, it.operacao, it.ciclo);
      // "Ciente" da particularidade é por analista+operação+data (uma
      // cobertura específica), não pela nota em si (que é compartilhada) —
      // ver particularidade_ciente no schema. Mostrado mesmo pra quem só
      // está olhando (ex.: supervisor na Programação Analista), mas só quem
      // está cobrindo consegue de fato confirmar (ver events.js).
      const ciente = it.isCobertura && DB.particularidadeCiente.some(c=>c.analistaId===analistaId && c.operacao===it.operacao && c.data===dateStr);
      // Enviar Raio-X só é meu de verdade — a "Programação Analista" do
      // supervisor reusa esta função pra ver a rota de qualquer analista, e
      // ninguém envia Raio-X alheio. Supervisor vendo a operação de outra
      // pessoa (souEuExec=false) não vê o botão de enviar, mas o resumo do
      // Raio-X já enviado aparece pra ele o tempo todo, com Editar/Excluir —
      // quem chega aqui já é da própria equipe (supProgramacao escopa por
      // myAnalistas).
      const souEu = !it.isOff && analistaId===session?.userId;
      const souEuExec = souEu;
      const raioxDaOperacao = !it.isOff && DB.raioX.some(r=>r.analistaId===analistaId && r.operacao===it.operacao && r.hora===it.horaInicio && r.data===dateStr);
      const mostrarExec = souEuExec || (!souEu && session.role==='supervisor' && raioxDaOperacao);
      return `<div class="flash-card flash-card-${categoriaOperacao(it)}${status==='atraso'?' flash-card-atraso':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
          <span class="flash-sigla">${it.operacao}</span>${statusPill(status, true)}
        </div>
        <div class="flash-meta">${it.ciclo} · ${it.horaInicio}–${it.horaFim}${spr!=null ? ` · SPR REF ${escapeHtml(String(spr))}` : ''}</div>
        <div class="flash-meta">${it.isSuplente ? 'Suplente' : 'Titular'}: ${it.responsavelNome}</div>
        ${it.isOff ? `<div class="flash-cover">${it.tipo==='ferias'?icon('palmtree',12)+' Férias':icon('moon',12)+' Folga'} do titular</div>`
          : it.isCobertura ? `<div class="flash-cover">${icon('repeat',12)} Cobrindo ${it.tipo==='ferias'?'férias':'folga'} de ${it.responsavelNome}</div>` : ''}
        ${mostrarExec ? renderExecucaoActions(it, dateStr, analistaId, spr, souEu) : ''}
        <div class="flash-actions" style="margin-top:8px;">
          <button class="btn btn-particularidade" data-particularidade-op="${escapeHtml(it.operacao)}" data-particularidade-sup="${supervisorId||''}" data-particularidade-cobertura="${it.isCobertura?'1':'0'}" data-particularidade-analista="${analistaId}" data-particularidade-data="${dateStr}" data-ciente="${ciente?'1':'0'}">${icon('settings',12)} Ver Particularidade${(it.isCobertura && !ciente) ? '<span class="badge-alerta-ciente" title="Ainda sem confirmação de ciência"></span>' : ''}</button>
        </div>
      </div>`;
    }).join('');
    cardsHtml += rns.map(r=>{
      // Confirmar presença é sempre em nome de quem está vendo a própria
      // agenda — no "Programação Analista" do supervisor (analistaId !==
      // session.userId) o botão não aparece, só o link.
      const souEu = analistaId===session?.userId;
      const presente = souEu && DB.reuniaoPresenca.some(p=>p.reuniaoId===r.id && p.analistaId===session.userId);
      // Check-in só libera depois do horário de início de verdade (mesma
      // conta de slotTimestamp usada pro status das operações) — antes
      // disso mostra o botão desabilitado, pra não dar check-in adiantado.
      const jaComecou = Date.now() >= slotTimestamp(dateStr, r.hora);
      return `<div class="flash-card reuniao">
      <div class="flash-sigla">${icon('calendar',12)} Reunião</div>
      <div class="flash-meta">${escapeHtml(r.titulo)}</div>
      <div class="flash-meta">${r.tipo==='grupo'?'Grupo':'Individual'} · ${r.horaFim?`${r.hora}–${r.horaFim}`:r.hora}</div>
      ${r.link ? `<div class="flash-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <a class="btn btn-brand" href="${escapeHtml(normalizeUrl(r.link))}" target="_blank" rel="noopener noreferrer">Entrar na reunião</a>
        ${souEu ? (presente ? `<span class="btn btn-brand" style="cursor:default;opacity:0.75;">${icon('check',12)} Check-in</span>`
          : jaComecou ? `<button class="btn btn-brand" data-marcar-presenca="${r.id}">Check-in</button>`
          : `<span class="btn" style="opacity:0.5;cursor:not-allowed;" title="Libera a partir de ${r.hora}">Check-in</span>`) : ''}
      </div>` : ''}
    </div>`;
    }).join('');
  cardsHtml += lembretes.map(lembreteCardHTML).join('');
  return cardsHtml;
}

// Kanban horizontal tradicional (uma coluna por hora) OU lista vertical
// (uma linha por horário com conteúdo), alternável por
// uiState.analistaDiariaLayout — ver toggle em renderAnalista(). Nos dois
// casos, horas sem nada (operação/reunião/lembrete) somem da tela em vez
// de virar coluna "Sem operação" à toa; a hora atual fica sempre visível
// enquanto o turno estiver rolando, mesmo vazia, pra ancorar a linha
// "agora" e deixar claro que não tem nada previsto pra esse momento.
function renderFlashcardRow(analistaId, dateStr, showLembretes, opFiltro){
  const supervisorId = userById(analistaId)?.supervisorId;
  let slots = filtrarSlotsAgenda(analistaId, dateStr, opFiltro);
  const reunioes = getReunioesForDate(analistaId, dateStr);
  const lembretesDoDia = showLembretes ? getLembretesForAnalista(analistaId).filter(l=>(l.data||todayISO())===dateStr) : [];
  const semHora = lembretesDoDia.filter(l=>!l.hora);
  const mostrarSemHora = showLembretes && semHora.length>0;
  const semHoraCol = mostrarSemHora ? `<div class="flash-col"><div class="flash-time">Sem hora</div>${semHora.map(lembreteCardHTML).join('')}</div>` : '';

  // Linha do tempo estilo Google Agenda: só faz sentido "agora" quando o
  // turno DESSA data está rolando neste exato momento — turno futuro
  // (ainda não começou) ou passado (navegando pra um dia anterior) não tem
  // "agora" pra marcar, então a tira nem aparece.
  const turnoInicio = slotTimestamp(dateStr, HOURS[0]);
  const turnoFim = slotTimestamp(dateStr, HOURS[HOURS.length-1]) + 60*60*1000;
  const agora = Date.now();
  const turnoAtivo = agora>=turnoInicio && agora<turnoFim;
  const horaAtual = turnoAtivo ? HOURS.find(h=> agora>=slotTimestamp(dateStr,h) && agora<slotTimestamp(dateStr,h)+60*60*1000) : null;

  const ctx = {analistaId, dateStr, supervisorId};
  const horasInfo = HOURS.map(hour=>{
    const items = slots.filter(s=>s.horaInicio===hour);
    // Reunião casa com a coluna pelo prefixo da hora (ex.: "19:20" cai na
    // coluna "19:00") — o horário de início dela é livre de 20 em 20
    // minutos (ver REUNIAO_HORAS em state.js), mais granular que as colunas
    // do kanban, que seguem HOURS (hora a hora).
    const rns = reunioes.filter(r=>r.hora.slice(0,2)===hour.slice(0,2));
    const lembretes = lembretesDoDia.filter(l=>l.hora===hour);
    const temConteudo = items.length>0 || rns.length>0 || lembretes.length>0;
    return { hour, temConteudo, isAgora: hour===horaAtual, cardsHtml: temConteudo ? buildHourCardsHtml(items, rns, lembretes, ctx) : '' };
  });
  const horasVisiveis = horasInfo.filter(h=>h.temConteudo || h.isAgora);

  if(uiState.analistaDiariaLayout==='lista'){
    const linhas = horasVisiveis.filter(h=>h.temConteudo).map(h=>`
      <div class="flash-list-row${h.isAgora?' flash-col-agora':''}">
        <div class="flash-time">${h.hour}${h.isAgora ? ' <span class="timeline-badge-agora">agora</span>' : ''}</div>
        <div class="flash-list-cards">${h.cardsHtml}</div>
      </div>`).join('');
    const semHoraLista = mostrarSemHora ? `<div class="flash-list-row"><div class="flash-time">Sem hora</div><div class="flash-list-cards">${semHora.map(lembreteCardHTML).join('')}</div></div>` : '';
    const vazio = !linhas && !mostrarSemHora;
    return `<div class="flash-list">${semHoraLista}${linhas || (vazio ? '<div class="empty">Nada previsto pra esse dia.</div>' : '')}</div>`;
  }

  // A tira "agora" vive dentro do MESMO .flash-outer que rola junto com
  // .flash-row — por isso o offset é calculado em px batendo com
  // min-width/gap de .flash-col no CSS (220px + 14px), não em % do
  // container (que desalinha com "Sem hora" no meio). Usa o índice dentro
  // de horasVisiveis (não HOURS) porque colunas vazias agora somem —
  // senão a bolinha "agora" cairia na posição errada.
  const FLASH_COL_W = 220, FLASH_GAP = 14, FLASH_STEP = FLASH_COL_W + FLASH_GAP;
  const semHoraOffsetPx = mostrarSemHora ? FLASH_STEP : 0;
  const trackWidthPx = horasVisiveis.length*FLASH_COL_W + Math.max(0, horasVisiveis.length-1)*FLASH_GAP;
  let dotOffsetPx = 0, colBasePx = 0, horaInicioTs = 0;
  if(turnoAtivo){
    const idx = horasVisiveis.findIndex(h=>h.hour===horaAtual);
    if(idx>=0){
      colBasePx = idx*FLASH_STEP;
      horaInicioTs = slotTimestamp(dateStr,horaAtual);
      const fracNaHora = Math.min(1, Math.max(0, (agora - horaInicioTs) / (60*60*1000)));
      dotOffsetPx = colBasePx + fracNaHora*FLASH_COL_W;
    }
  }
  // data-timeline-*: o ponteiro "agora" só recalcula de verdade num
  // renderMain() inteiro (troca de aba, ação, refresh periódico dos dados)
  // — sem isso, quem fica parado na tela vê a bolinha congelada, cada vez
  // mais atrasada em relação ao horário real. setInterval em main.js
  // recalcula a posição a partir desses atributos sem precisar
  // re-renderizar nada (mesmo padrão do timer do cronômetro).
  const timelineHtml = turnoAtivo ? `
  <div class="timeline-overlay-wrap" data-timeline-hora-inicio="${horaInicioTs}" data-timeline-base-px="${colBasePx}" data-timeline-col-w="${FLASH_COL_W}" style="margin-left:${semHoraOffsetPx}px;width:${trackWidthPx}px;">
    <div class="timeline-track">
      <div class="timeline-fill" style="width:${dotOffsetPx}px;"></div>
      <div class="timeline-now" style="left:${dotOffsetPx}px;" title="Agora: ${new Date(agora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}"></div>
    </div>
  </div>` : '';

  const colunas = horasVisiveis.map(h=>{
    const horaLabel = `${h.hour}${h.isAgora ? ' <span class="timeline-badge-agora">agora</span>' : ''}`;
    const colAttrs = `class="flash-col${h.isAgora?' flash-col-agora':''}"`;
    if(!h.temConteudo){
      return `<div ${colAttrs}><div class="flash-time">${horaLabel}</div><div class="flash-card off"><div style="color:var(--text-faint);font-size:12px;">Sem operação</div></div></div>`;
    }
    return `<div ${colAttrs}><div class="flash-time">${horaLabel}</div>${h.cardsHtml}</div>`;
  }).join('');
  if(!colunas && !mostrarSemHora){
    return `<div class="flash-outer"><div class="empty">Nada previsto pra esse dia.</div></div>`;
  }

  return `<div class="flash-outer">${timelineHtml}<div class="flash-row">${semHoraCol}${colunas}</div></div>`;
}


// Visão integrada da Programação Analista do supervisor: todos os analistas
// da equipe numa única grade (uma régua de horário e uma linha "agora"
// compartilhadas), em vez de um flash-row inteiro empilhado por analista
// (cada um repetindo a régua). Analista sem nenhuma operação própria/
// cobertura no dia (só folga) fica de fora da lista — pedido do supervisor
// pra não ocupar espaço com quem não tem nada pra acompanhar.
function renderProgramacaoIntegrada(lista, dateStr){
  const turnoInicio = slotTimestamp(dateStr, HOURS[0]);
  const turnoFim = slotTimestamp(dateStr, HOURS[HOURS.length-1]) + 60*60*1000;
  const agora = Date.now();
  const turnoAtivo = agora>=turnoInicio && agora<turnoFim;
  const horaAtual = turnoAtivo ? HOURS.find(h=> agora>=slotTimestamp(dateStr,h) && agora<slotTimestamp(dateStr,h)+60*60*1000) : null;
  const fracAgora = turnoAtivo ? Math.min(1, Math.max(0, (agora-turnoInicio)/(turnoFim-turnoInicio))) : 0;

  // Domingo é dia de DSR: o hub fixo de quem está de folga sempre aparece
  // como "folga" (coberto por outra pessoa) na agenda dele, mas isso não
  // interessa pro supervisor acompanhar nesse dia — só o que a pessoa vai
  // efetivamente cobrir (categoria "cobertura"). Nos outros dias da semana
  // continua mostrando o "folga" normalmente.
  const domingo = isDomingo(dateStr);

  // Arrastar-e-soltar (mover operação entre escalas) é só do supervisor de
  // verdade — a "Programação Geral" do analista delegado reaproveita essa
  // mesma função (renderProgramacaoGeralAnalista chama supProgramacao) e
  // precisa continuar só leitura, sem depender de travar botão por botão.
  const podeEditar = session.role==='supervisor';
  const movesTodos = podeEditar ? uiState.progMoves : [];
  const moves = movesTodos.filter(m=>m.data===dateStr);
  const movesPorOrigem = {}, movesPorDestino = {};
  moves.forEach(m=>{
    (movesPorOrigem[m.origemAnalistaId] = movesPorOrigem[m.origemAnalistaId]||[]).push(m);
    (movesPorDestino[m.destinoAnalistaId] = movesPorDestino[m.destinoAnalistaId]||[]).push(m);
  });

  const linhas = [];
  const folgaNomes = [];
  lista.forEach(a=>{
    const slotsOriginais = filtrarSlotsAgenda(a.id, dateStr);
    let slots = slotsOriginais;
    if(domingo) slots = slots.filter(s=>categoriaOperacao(s)!=='folga');
    // Prévia de arrastar-e-soltar: some da linha de quem foi tirado, aparece
    // (como card "pendente", ainda sem gravar nada) na linha de quem
    // recebeu — ver "Salvar alterações" em events.js pra quando isso vira
    // ausência de verdade.
    const saidas = movesPorOrigem[a.id] || [];
    if(saidas.length) slots = slots.filter(s=> !saidas.some(m=>m.bmId===s.id && m.categoria===categoriaOperacao(s)));
    const entradas = movesPorDestino[a.id] || [];
    if(entradas.length){
      slots = [...slots, ...entradas.map(m=>({
        id:m.bmId, operacao:m.operacao, ciclo:m.ciclo, horaInicio:m.horaInicio, horaFim:m.horaFim,
        isOff:false, isCobertura:true, isSuplente:false,
        responsavelNome: userById(m.titularId)?.name || '—', responsavelId:m.titularId,
        _pendente:m,
      }))];
    }
    const trabalha = slots.some(s=>categoriaOperacao(s)!=='folga');
    if(!trabalha){
      // Só conta como "de folga" quem tem operação fixa de verdade coberta
      // hoje (categoriaOperacao 'folga') — quem simplesmente não tem nada
      // agendado (sem baseMestra pra essa data) não entra nessa contagem.
      if(slotsOriginais.some(s=>categoriaOperacao(s)==='folga')) folgaNomes.push(a.name);
      return;
    }
    linhas.push({ analista:a, slots });
  });

  const statusLabels = { wait:['pill-wait','clock','A Iniciar'], live:['pill-live','circle-play','Em Andamento'], done:['pill-done','circle-check-big','Finalizada'], atraso:['pill-atraso','octagon-alert','Não Finalizado'] };
  const filtro = uiState.progStatusFiltro;

  // Card minimalista de propósito: só hub + ciclo, pra grade ficar limpa e
  // alinhada com muitos analistas na tela — hora da janela/SPR REF/cobertura
  // ainda dá pra ver passando o mouse (title), particularidade e reunião
  // saíram daqui (quem quiser isso entra na Programação individual do
  // analista). Status é só pelo relógio (computeStatus, utils.js) — não
  // tem mais cronômetro Iniciar/Finalizar dentro do Kronos.
  //
  // Tempo de execução: vem do duracaoSegundos do Raio-X, preenchido pela
  // planilha de roteirização importada (ver planilhaImport.controller.js),
  // não mais por um cronômetro clicado dentro do Kronos.
  const cardHtml = (it, hour, analistaId)=>{
    const status = computeStatus(hour, dateStr, analistaId, it.operacao, it.isOff);
    const dim = filtro && filtro!==status;
    const [,iconStatus,labelStatus] = statusLabels[status] || [];
    const detalhe = `${it.operacao} — ${it.ciclo} · ${it.horaInicio}–${it.horaFim}${labelStatus ? ` · ${labelStatus}` : ''}` +
      (it.isCobertura ? ` · Cobrindo ${it.responsavelNome}` : it.isOff ? ` · Coberto por ${it.responsavelNome}` : '');
    // Card pendente ainda não é real (não tem Raio-X nem nunca vai ter,
    // porque a operação nunca rodou nesse titular) — não faz sentido
    // acender "Não finalizado" nele antes de salvar.
    const borda = status==='atraso' && !it._pendente ? ' flash-card-atraso' : '';

    // raio_x não grava ciclo (bug de longa data no backend — ver ciclo
    // ausente na tabela, cicloDaOperacaoHistorico em utils.js), então o
    // cruzamento com o Raio-X é só por analista+operação+hora+data (sem
    // ciclo, que aqui sempre viria vazio e nunca bateria).
    const rx = encontrarRaioX(analistaId, it.operacao, hour, dateStr);
    // Horário e duração em linhas separadas (não um texto só) — combinados
    // não cabiam na largura do card e estouravam pra fora (ex.: "22:32–
    // 23:59 · 1h18min" é comprido demais pra uma coluna de ~96px).
    let horarioLabel = '', tempoLabel = '', tempoCor = '', timerHtml = '';
    if(rx && rx.duracaoSegundos!=null && !rx.semRoteirizacao){
      tempoLabel = formatarDuracaoCompacta(rx.duracaoSegundos);
      // Início/fim reais vêm da planilha de roteirização (hora_inicio_real/
      // hora_fim_real) — registro anterior a essa importação ter esses
      // campos não tem, aí mostra só a duração.
      if(rx.horaInicioReal && rx.horaFimReal) horarioLabel = `${rx.horaInicioReal}–${rx.horaFimReal}`;
      // Até 30min verde, 31-60min amarelo, acima de 1h vermelho — mesmo
      // esquema de cor do resto do app (var(--done)/--folga/--alert).
      tempoCor = rx.duracaoSegundos<=1800 ? 'var(--done)' : rx.duracaoSegundos<=3600 ? 'var(--folga)' : 'var(--alert)';
    } else if(!rx){
      // Ainda sem Raio-X — a planilha pode já ter registrado o início real
      // mesmo assim (roteirizacao_status, ver planilhaImport.controller.js).
      // Cronômetro ao vivo com base nesse horário, não num clique dentro do
      // Kronos (não existe mais).
      const emAndamento = DB.roteirizacaoStatus.find(s=>s.analistaId===analistaId && s.operacao===it.operacao && s.data===dateStr && s.horaInicioReal && !s.horaFimReal);
      if(emAndamento){
        const desde = slotTimestamp(dateStr, emAndamento.horaInicioReal);
        timerHtml = `<div class="timer-live" data-timer-desde="${desde}" title="Início real (planilha): ${emAndamento.horaInicioReal}">
          <span class="timer-dot"></span><span class="timer-num mono">00:00</span>
        </div>`;
      }
      // Sem confirmação real da planilha, não estima nada a partir do
      // horário agendado — só o alerta de "não finalizado" abaixo, sem
      // número que possa não refletir a realidade (a operação pode nem ter
      // começado ainda).
    }
    // Selo fixo de "não finalizado" — a borda vermelha sozinha (flash-card-
    // atraso) estava passando despercebida no meio das cores de categoria
    // (fixa/cobertura/folga), então além dela o card ganha uma etiqueta que
    // não depende de reparar na cor.
    const alertaHtml = status==='atraso' && !it._pendente ? `<span class="pill pill-atraso prog-alerta">${icon('octagon-alert',10)} Não finalizado</span>` : '';

    // SPR e Órfãos vêm do próprio Raio-X (preenchido pelo analista), não da
    // planilha — por isso aparecem mesmo quando ainda não há duracaoSegundos
    // (rx existe mas a planilha não trouxe fim ainda). Órfãos é opcional de
    // verdade: nulo é "não informado", não mostra nada (não é "zero").
    const sprLabel = rx && !rx.semRoteirizacao && rx.sprRoteirizado!=null ? `SPR ${rx.sprRoteirizado}` : '';
    const orfaosLabel = rx && rx.orfaos!=null ? `Órf ${rx.orfaos}` : '';
    const sprOrfaosLabel = [sprLabel, orfaosLabel].filter(Boolean).join(' · ');

    // Passar o mouse no card dá acesso ao texto do Raio-X (observação) sem
    // precisar abrir Editar — hoje esse texto só aparece ali, e o card
    // compacto da Grade não tem espaço pra mostrar de cara. Vai no "title"
    // nativo (não um tooltip próprio): testado visualmente e um balão CSS
    // próprio fica cortado nas primeiras linhas da grade (o scroll
    // horizontal do container força corte vertical também — regra de
    // overflow do CSS). O nativo não sofre disso, e quebra linha sozinho.
    const obsTexto = rx && rx.observacao ? rx.observacao.trim() : '';
    const resumoRaiox = obsTexto
      ? `\n\n${'★'.repeat(Math.max(0,Math.min(5,rx.estrelas||0)))}${rx.semRoteirizacao ? ' · Sem roteirização' : rx.sprRoteirizado!=null ? ` · SPR ${rx.sprRoteirizado}` : ''}${rx.orfaos!=null ? ` · Órfãos ${rx.orfaos}` : ''}\n${obsTexto}`
      : '';

    // Arrastar-e-soltar: só "fixa" (operação própria) e "cobertura" fazem
    // sentido mover — "folga" é o card do dia em que o titular NÃO está
    // trabalhando (outra pessoa já cobre), não tem o que arrastar dali. O
    // card pendente (it._pendente) carrega a categoria ORIGINAL da
    // operação (antes do drag) — é ela que decide, no salvar, se cria uma
    // ausência nova ou só reatribui uma existente (ver btnSalvarProgMoves,
    // events.js), mesmo que visualmente ele já apareça como "cobertura" na
    // linha de quem recebeu.
    const catOriginal = it._pendente ? it._pendente.categoria : categoriaOperacao(it);
    // Cobertura avulsa (Suplências ad-hoc, sem base_mestra por trás — ver
    // coberturaAdhoc em getDaySlots) usa outra tabela (suplencias) e não dá
    // pra mover por aqui (o id do card nem é um baseMestraId nesse caso);
    // só entra quem tem tipo 'folga'/'ferias' de verdade (ausência real).
    const ehAdhoc = catOriginal==='cobertura' && !it._pendente && it.tipo==='cobertura';
    const arrastavel = podeEditar && !ehAdhoc && (catOriginal==='fixa' || catOriginal==='cobertura');
    const titularIdDrag = it._pendente ? it._pendente.titularId : (catOriginal==='fixa' ? analistaId : it.responsavelId);
    const dragAttrs = arrastavel ? ` draggable="true" data-drag-categoria="${catOriginal}" data-drag-bmid="${it.id}" data-drag-titularid="${titularIdDrag}" data-drag-origemid="${analistaId}" data-drag-operacao="${escapeHtml(it.operacao)}" data-drag-ciclo="${escapeHtml(it.ciclo)}" data-drag-horainicio="${it.horaInicio}" data-drag-horafim="${it.horaFim}" data-drag-data="${dateStr}"` : '';
    const pendenteHtml = it._pendente ? `
      <span class="prog-pendente-badge" title="${it._pendente.conflito ? escapeHtml(it._pendente.conflito) : 'Pendente — ainda não salvo'}">${it._pendente.conflito ? icon('triangle-alert',10) : icon('move',10)} Pendente</span>
      <button class="prog-pendente-remover" data-remove-move="${it._pendente.id}" title="Desfazer esse movimento">${icon('x',11)}</button>` : '';

    return `<div class="flash-card flash-card-${categoriaOperacao(it)}${borda}${dim?' prog-dim':''}${arrastavel?' prog-arrastavel':''}${it._pendente?' prog-card-pendente':''}" title="${escapeHtml(detalhe+resumoRaiox)}"${dragAttrs}>
      <span class="flash-sigla">${iconStatus?icon(iconStatus,11)+' ':''}${escapeHtml(it.operacao)}</span>
      <span class="prog-ciclo">${escapeHtml(it.ciclo)}</span>
      ${horarioLabel ? `<span class="prog-horario mono">${horarioLabel}</span>` : ''}
      ${tempoLabel ? `<span class="prog-horario mono"${tempoCor?` style="color:${tempoCor};"`:''}>${tempoLabel}</span>` : ''}
      ${sprOrfaosLabel ? `<span class="prog-horario mono">${sprOrfaosLabel}</span>` : ''}
      ${pendenteHtml}
      ${timerHtml}
      ${alertaHtml}
    </div>`;
  };

  // Régua + linha "agora" — mesma marca registrada da Programação individual
  // do analista (renderFlashcardRow): barrinha de progresso na régua e a
  // coluna inteira da hora atual destacada em todas as linhas, não só o
  // rótulo da régua.
  //
  // Grade única: cabeçalho e todas as linhas de analista são filhos diretos
  // do MESMO grid (não um grid por linha) — é o que garante que as colunas
  // fiquem exatamente alinhadas de cima a baixo, sem depender de cada linha
  // arredondar a largura de "1fr" do mesmo jeito.
  const headHtml = `<div class="prog-corner">Analista</div>` + HOURS.map(h=>
    `<div class="prog-tick mono${h===horaAtual?' prog-tick-agora':''}">${h}${h===horaAtual?' <span class="timeline-badge-agora">agora</span>':''}</div>`
  ).join('');

  const timelineHtml = `<div class="prog-timeline-wrap" style="grid-column:1/-1;">${turnoAtivo ? `<div class="prog-timeline-track"><div class="prog-timeline-fill" style="width:${fracAgora*100}%;"></div><div class="prog-timeline-now" style="left:${fracAgora*100}%;" title="Agora"></div></div>` : ''}</div>`;
  const guideHtml = turnoAtivo ? `<div class="prog-now-guide" style="left:calc(184px + (100% - 184px) * ${fracAgora});"></div>` : '';

  // A linha inteira (rótulo + todas as células) é a zona de soltar — a
  // operação não muda de horário ao mover, só de dono, então não faz
  // sentido restringir o drop a uma célula/hora específica.
  const dropAttrs = a => podeEditar ? ` data-drop-analista="${a.id}"` : '';
  const rowsHtml = linhas.map(({analista,slots})=>{
    const qtd = slots.length;
    const label = `<div class="prog-row-label"${dropAttrs(analista)}><div class="nm">${escapeHtml(analista.name)}</div><div class="prog-row-count">${qtd} operaç${qtd===1?'ão':'ões'}</div></div>`;
    const cellsHtml = HOURS.map(hour=>{
      const items = slots.filter(s=>s.horaInicio===hour);
      const conteudo = items.map(it=>cardHtml(it, hour, analista.id)).join('');
      return `<div class="prog-cell${hour===horaAtual?' prog-cell-agora':''}"${dropAttrs(analista)}>${conteudo}</div>`;
    }).join('');
    return label + cellsHtml;
  }).join('');

  // Barra de ações pendentes: some das outras datas do lote pra caber o
  // contador certo (movesTodos, não só o "moves" filtrado por esse dia) —
  // dá pra ir arrastando em vários dias antes de salvar tudo de uma vez. O
  // "Ver detalhes" lista TODAS as pendências (de qualquer data), cada uma
  // com seu próprio X — dá pra revisar e desfazer um item específico de um
  // dia que nem está na tela agora, sem precisar navegar até lá.
  const datasEnvolvidas = [...new Set(movesTodos.map(m=>m.data))];
  const barraMovesHtml = podeEditar && movesTodos.length>0 ? `
    <div class="prog-moves-bar">
      <span>${icon('move',14)} <b>${movesTodos.length}</b> alteraç${movesTodos.length>1?'ões':'ão'} pendente${movesTodos.length>1?'s':''}${datasEnvolvidas.length>1?` em ${datasEnvolvidas.length} dias`:''}${movesTodos.some(m=>m.conflito) ? ` · ${movesTodos.filter(m=>m.conflito).length} com aviso` : ''}</span>
      <button class="btn" id="btnToggleProgMoves">${uiState.progMovesExpandido?'Ocultar':'Ver'} detalhes</button>
      <button class="btn" id="btnDescartarProgMoves">Descartar</button>
      <button class="btn btn-brand" id="btnSalvarProgMoves">Salvar alterações</button>
    </div>
    ${uiState.progMovesExpandido ? `<div class="prog-moves-lista">
      ${movesTodos.slice().sort((a,b)=>a.data.localeCompare(b.data)).map(m=>`
        <div class="prog-moves-item${m.conflito?' prog-moves-item-conflito':''}">
          <span class="mono prog-moves-data">${m.data.slice(8,10)}/${m.data.slice(5,7)}</span>
          <span class="prog-moves-op">${escapeHtml(m.operacao)} <span class="mono" style="color:var(--text-muted);">${m.horaInicio}–${m.horaFim}</span></span>
          <span class="prog-moves-fluxo">${escapeHtml(userById(m.origemAnalistaId)?.name||'—')} <span style="color:var(--text-muted);">→</span> <b>${escapeHtml(m.destinoNome)}</b></span>
          ${m.conflito ? `<span class="prog-moves-aviso" title="${escapeHtml(m.conflito)}">${icon('triangle-alert',12)}</span>` : '<span></span>'}
          <button class="prog-moves-remover" data-remove-move="${m.id}" title="Desfazer esse movimento">${icon('x',12)}</button>
        </div>`).join('')}
    </div>` : ''}` : '';

  if(linhas.length===0){
    return `${barraMovesHtml}<div class="empty">Nenhum analista com operação neste dia</div>`;
  }

  const legendHtml = `<div class="status-legend">
    <span class="status-legend-label">Destacar por status</span>
    ${Object.entries(statusLabels).map(([key,[cls,ic,label]])=>
      `<span class="pill ${cls}${filtro===key?' active':''}${filtro && filtro!==key?' inactive':''}" data-status-filtro="${key}">${icon(ic,12)} ${label}</span>`
    ).join('')}
    ${filtro ? `<button class="btn" id="btnLimparStatusFiltro">Limpar</button>` : ''}
    <span class="pill pill-done pill-info" title="Analistas com operação hoje">${icon('users',12)} ${linhas.length} ativos</span>
    <span class="pill pill-wait pill-info" title="Soma de operações de todos os analistas exibidos">${icon('clipboard-list',12)} ${linhas.reduce((s,l)=>s+l.slots.length,0)} operações</span>
    ${folgaNomes.length>0 ? `<span class="pill pill-off pill-info pill-folga-info">${icon('moon',12)} ${folgaNomes.length} de folga
      <span class="folga-tip"><b>De folga hoje</b><br>${folgaNomes.map(escapeHtml).join('<br>')}</span>
    </span>` : ''}
  </div>`;

  return `${barraMovesHtml}${legendHtml}<div class="prog-card-outer">
    <div class="prog-grid">
      ${headHtml}
      ${timelineHtml}
      ${rowsHtml}
      ${guideHtml}
    </div>
  </div>`;
}


// Data curta (dd/mm) pros cards de "próxima cobertura/folga" — mesmo
// padrão de toLocaleDateString já usado no calendário (renderAnalistaSemanal).
function formatarDataCurta(d){
  return new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

// Primeiro dia (a partir de hoje, hoje incluso) que satisfaz predicate(d) —
// usado pra achar a próxima cobertura/folga do analista. maxDias limita a
// busca (não faz sentido varrer indefinidamente se não há nada agendado).
function proximaOcorrencia(predicate, maxDias){
  const hoje = hojeAgendaISO();
  for(let i=0;i<=maxDias;i++){
    const d = addDaysISO(hoje, i);
    if(predicate(d)) return {data:d, diasFaltando:i};
  }
  return null;
}

// Card de contagem regressiva (próxima cobertura/folga): número grande é
// os dias faltando ("Hoje" se for hoje mesmo), com a data e o emoji no
// rótulo. Sem nada encontrado na janela de busca, mostra "—" com o aviso.
function statCardContagem(proxima, iconHtml, label, semLabel){
  if(!proxima) return `<div class="stat-card"><div class="stat-num">—</div><div class="stat-label">${iconHtml} ${semLabel}</div></div>`;
  const sufixoDias = proxima.diasFaltando>0 ? ` (${proxima.diasFaltando} dia${proxima.diasFaltando>1?'s':''})` : '';
  return `<div class="stat-card"><div class="stat-num">${proxima.diasFaltando===0?'Hoje':proxima.diasFaltando}</div><div class="stat-label">${iconHtml} ${label} · ${formatarDataCurta(proxima.data)}${sufixoDias}</div></div>`;
}

// Aba extra de quem foi delegado pelo supervisor (ver
// renderDelegacaoProgramacao, ui.js) — mesma tela do supervisor
// (supProgramacao), só que escopada pela equipe do supervisor QUE delegou,
// não por session.userId (que aqui é o analista, não um supervisor de
// verdade). Continua só leitura sem esforço extra: os únicos botões
// daquela tela (Editar/Excluir Raio-X de colega) já são travados por
// session.role==='supervisor' dentro de renderExecucaoActions — o analista
// delegado mantém role 'analista', então nunca aparecem, mesmo olhando a
// operação de outra pessoa.
function renderProgramacaoGeralAnalista(){
  const sup = meuSupervisorDelegante();
  if(!sup){
    return `<div class="page-head"><div><h1 class="page-title">Programação Geral</h1></div></div>
      <div class="empty">Seu supervisor desativou esse acesso.</div>`;
  }
  const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===sup.id);
  return `<div class="page-head"><div><h1 class="page-title">Programação Geral</h1><div class="page-desc">Cobrindo ${escapeHtml(sup.name)} · somente leitura</div></div></div>${supProgramacao(myAnalistas)}`;
}

function renderAnalista(){
  const dateStr = uiState.analistaDate;
  const todaySlots = getDaySlots(session.userId, dateStr);

  // "Próxima cobertura/folga" sempre a partir de HOJE de verdade, não da
  // data selecionada no calendário (dateStr) — o card não deve mudar só
  // porque o analista está navegando pra outro mês.
  const proxCobertura = proximaOcorrencia(d=> getDaySlots(session.userId, d).some(s=>categoriaOperacao(s)==='cobertura'), 90);
  // isFolgaDSR() já expressa exatamente "dia totalmente livre" (nenhuma
  // operação própria sem cobertura, nenhuma cobertura de terceiro, sem
  // plantão) — o nome vem do uso específico de domingo (ver
  // filtrarSlotsAgenda), mas a definição vale pra qualquer dia da semana.
  const proxFolga = proximaOcorrencia(d=> isFolgaDSR(session.userId, d), 90);

  // Tira de foco no topo (SPR + Tempo de Execução, últimos 30 dias, mesma
  // janela padrão do Resultado SPR/Tempo de Execução) — os dois indicadores
  // da área, pra não precisar sair da própria Programação pra ver "como eu
  // tô indo". O resto da tela (operações do dia, coberturas) continua igual.
  const janela30 = addDaysISO(todayISO(), -30);
  const raioxRecente = DB.raioX.filter(r=>r.analistaId===session.userId && (r.data||'')>=janela30);
  const comMetaRecente = raioxRecente.filter(r=>r.sprMeta!=null);
  const sprLancadoMedio = comMetaRecente.length ? comMetaRecente.reduce((s,r)=>s+r.sprRoteirizado,0)/comMetaRecente.length : null;
  const sprRefMedio = comMetaRecente.length ? comMetaRecente.reduce((s,r)=>s+r.sprMeta,0)/comMetaRecente.length : null;
  const comTempoRecente = raioxRecente.filter(r=>r.duracaoSegundos!=null);
  const tempoMedioRecente = comTempoRecente.length ? comTempoRecente.reduce((s,r)=>s+r.duracaoSegundos,0)/comTempoRecente.length : null;

  return `
  ${plantaoBannerFor(session.userId, dateStr)}
  ${passagemBastaoBannerFor(session.userId, dateStr)}
  <div class="page-head">
    <div>
      <h1 class="page-title">Programação</h1>
      <div class="page-desc">Flashcards da sua rota — visão ${uiState.analistaView==='diaria'?'diária':uiState.analistaView==='semanal'?'semanal':'mensal'}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <div class="toggle-group" data-scope="analista">
        <button data-view="diaria" class="${uiState.analistaView==='diaria'?'active':''}">Diária</button>
        <button data-view="semanal" class="${uiState.analistaView==='semanal'?'active':''}">Semanal</button>
        <button data-view="mensal" class="${uiState.analistaView==='mensal'?'active':''}">Mensal</button>
      </div>
      ${uiState.analistaView==='diaria' ? `<div class="toggle-group" data-scope="analista-layout">
        <button data-layout="kanban" class="${uiState.analistaDiariaLayout==='kanban'?'active':''}" title="Colunas por horário, rolagem horizontal">${icon('layout-grid',12)} Kanban</button>
        <button data-layout="lista" class="${uiState.analistaDiariaLayout==='lista'?'active':''}" title="Lista vertical, sem rolagem horizontal">${icon('list',12)} Lista</button>
      </div>` : ''}
    </div>
  </div>
  <div class="grid-2" style="margin-bottom:14px;">
    <div class="stat-card">
      <div class="stat-num">${sprLancadoMedio!=null ? sprLancadoMedio.toFixed(1) : '—'}</div>
      <div class="stat-label">${icon('target',12)} SPR Lançado${sprRefMedio!=null?` <span style="color:var(--text-faint);">(REF ${sprRefMedio.toFixed(1)})</span>`:''} <span style="color:var(--text-faint);">· 30 dias</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:${tempoMedioRecente!=null && tempoMedioRecente>SLA_TEMPO_EXECUCAO_SEGUNDOS?'var(--alert)':'var(--done)'};">${tempoMedioRecente!=null ? formatarDuracao(Math.round(tempoMedioRecente)) : '—'}</div>
      <div class="stat-label">${icon('hourglass',12)} Tempo médio de execução <span style="color:var(--text-faint);">(SLA 1h · 30 dias)</span></div>
    </div>
  </div>
  <div class="grid-3" style="margin-bottom:22px;">
    <div class="stat-card"><div class="stat-num">${todaySlots.length}</div><div class="stat-label">${icon('clipboard-list',12)} Operações do dia</div></div>
    ${statCardContagem(proxCobertura, icon('repeat',12), 'Próxima cobertura', 'Sem cobertura agendada')}
    ${statCardContagem(proxFolga, icon('moon',12), 'Próxima folga', 'Sem folga agendada')}
  </div>
  <div class="filter-row" style="align-items:center;margin-bottom:16px;">
    <input type="date" id="analistaDatePick" value="${dateStr}" class="mono" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:8px;">
    <select data-opfiltro="status">
      <option value="all" ${uiState.analistaOpFiltro==='all'?'selected':''}>Todas as operações</option>
      <option value="fixa" ${uiState.analistaOpFiltro==='fixa'?'selected':''}>Operação fixa</option>
      <option value="cobertura" ${uiState.analistaOpFiltro==='cobertura'?'selected':''}>Estou cobrindo</option>
      <option value="folga" ${uiState.analistaOpFiltro==='folga'?'selected':''}>Estou sendo coberto (folga)</option>
    </select>
    <button class="btn btn-brand" id="btnAddLembreteModal">+ Adicionar lembrete</button>
  </div>
  ${uiState.analistaView==='diaria' ? renderFlashcardRow(session.userId, dateStr, true, uiState.analistaOpFiltro)
    : uiState.analistaView==='semanal' ? renderAnalistaSemanal(session.userId, dateStr, uiState.analistaOpFiltro)
    : renderAnalistaMensal(session.userId, dateStr, uiState.analistaOpFiltro)}
  `;
}


// Grid de calendário (7 colunas) em vez do kanban de rolagem horizontal —
// mesmos 7 dias de sempre (a partir de dateStr), só a apresentação muda.
// opFiltro reusado tanto aqui quanto em renderAnalistaMensal e
// renderFlashcardRow (ver categoriaOperacao() em utils.js).

// Chips extras (plantão, reuniões, lembretes) pros grids semanal/mensal —
// mesma informação que já aparece na visão diária (renderFlashcardRow),
// só resumida. Sem isso a visão semanal ficava com muito espaço vazio no
// dia (normalmente só 1 operação), já que cada .cal-day-cell tem altura
// mínima fixa (ver style.css).
function extraChipsForDay(analistaId, ds){
  const chips = [];
  if(analistaEmPlantao(analistaId, ds)) chips.push(`<div class="cal-chip cal-chip-plantao" title="Escalado em plantão nesse dia">${icon('bell',11)} Plantão</div>`);
  // isFolgaDSR() já é "dia totalmente livre": todas as operações do dia
  // cobertas por outra pessoa, nenhuma operação própria sem cobertura e
  // sem plantão — exatamente o critério de "folgando".
  else if(isFolgaDSR(analistaId, ds)) chips.push(`<div class="cal-chip cal-chip-folga-dia" title="Dia de folga">${icon('moon',11)} Folgando</div>`);
  getReunioesForDate(analistaId, ds).forEach(r=>{
    const faixa = r.horaFim ? `${r.hora}–${r.horaFim}` : r.hora;
    chips.push(`<div class="cal-chip cal-chip-reuniao" title="${escapeHtml(r.titulo)} · ${r.tipo==='grupo'?'Grupo':'Individual'} · ${faixa}">${icon('calendar',11)} ${r.hora} ${escapeHtml(r.titulo)}</div>`);
  });
  getLembretesForAnalista(analistaId).filter(l=>(l.data||todayISO())===ds).forEach(l=>{
    chips.push(`<div class="cal-chip cal-chip-lembrete${l.done?' cal-chip-done':''}" title="${escapeHtml(l.texto)}">${icon('sticky-note',11)} ${l.hora?l.hora+' ':''}${escapeHtml(l.texto)}</div>`);
  });
  return chips;
}

function renderAnalistaSemanal(analistaId, dateStr, opFiltro){
  const todayStr = hojeAgendaISO();
  // O cabeçalho abaixo é fixo (Dom Seg Ter Qua Qui Sex Sáb) — pra bater
  // com as datas de cada coluna, a semana sempre tem que começar no
  // domingo, senão a coluna 1 mostra "Dom" mas o card é de outro dia da
  // semana (achado real: clicar numa terça no calendário Mensal fazia a
  // visão Semanal começar naquela terça, com "terça" embaixo de "Dom").
  const diaDaSemana = new Date(dateStr+'T00:00:00').getDay();
  const inicioSemana = addDaysISO(dateStr, -diaDaSemana);
  const header = WEEKDAY_LABELS.map(w=>`<div class="cal-weekday-header">${w}</div>`).join('');
  const cells = Array.from({length:7}, (_,i)=>{
    const ds = addDaysISO(inicioSemana, i);
    let slots = filtrarSlotsAgenda(analistaId, ds, opFiltro);
    const dd = new Date(ds+'T00:00:00');
    const label = dd.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
    const isToday = ds===todayStr;
    const extras = extraChipsForDay(analistaId, ds);
    return `<div class="cal-day-cell${isToday?' today':''}">
      <div class="cal-day-num${isToday?' today':''}" data-daypick="${ds}">${label}</div>
      ${extras.join('')}
      ${slots.length===0 && extras.length===0 ? `<span style="color:var(--text-faint);font-size:11px;">Sem operação</span>` :
        slots.map(s=>`<div class="cal-chip cal-chip-${categoriaOperacao(s)}" title="${s.operacao} · ${s.horaInicio}–${s.horaFim}${s.isOff?' · Folga · cobre: '+s.responsavelNome:s.isCobertura?' · Cobrindo '+s.responsavelNome:''}">${s.horaInicio} ${s.operacao}</div>`).join('')}
    </div>`;
  }).join('');
  return `<div class="cal-grid" style="margin-bottom:6px;">${header}</div><div class="cal-grid cal-grid-semanal">${cells}</div>`;
}

// Grid de calendário de verdade (semanas em linhas, domingo a sábado) —
// células vazias de preenchimento no início/fim.
function renderAnalistaMensal(analistaId, dateStr, opFiltro){
  const todayStr = hojeAgendaISO();
  const ref = new Date(dateStr+'T00:00:00');
  const year = ref.getFullYear(), month = ref.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevDate = dateToISO(new Date(year, month-1, 1));
  const nextDate = dateToISO(new Date(year, month+1, 1));
  let cells = '';
  for(let i=0;i<startWeekday;i++){
    cells += `<div class="cal-day-cell empty-cell"></div>`;
  }
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    let slots = filtrarSlotsAgenda(analistaId, ds, opFiltro);
    const isToday = ds===todayStr;
    cells += `<div class="cal-day-cell${isToday?' today':''}">
      <div class="cal-day-num${isToday?' today':''}" data-daypick="${ds}">${day}</div>
      ${extraChipsForDay(analistaId, ds).join('')}
      ${slots.map(s=>`<div class="cal-chip cal-chip-${categoriaOperacao(s)}" title="${s.operacao} · ${s.horaInicio}–${s.horaFim}${s.isOff?' · Folga · cobre: '+s.responsavelNome:s.isCobertura?' · Cobrindo '+s.responsavelNome:''}">${s.horaInicio} ${s.operacao}</div>`).join('')}
    </div>`;
  }
  const trailing = (7 - ((startWeekday+daysInMonth) % 7)) % 7;
  for(let i=0;i<trailing;i++){
    cells += `<div class="cal-day-cell empty-cell"></div>`;
  }
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <button class="btn" data-monthnav="${prevDate}">‹ Mês anterior</button>
    <div class="section-title" style="margin:0;">${MONTH_NAMES[month]} ${year}</div>
    <button class="btn" data-monthnav="${nextDate}">Próximo mês ›</button>
  </div>
  <div class="cal-grid" style="margin-bottom:6px;">${WEEKDAY_LABELS.map(w=>`<div class="cal-weekday-header">${w}</div>`).join('')}</div>
  <div class="cal-grid">${cells}</div>`;
}


// Só a tela de envio — o analista não vê os feedbacks que já mandou
// (nem os de outros); só o próprio supervisor tem uma tela de listagem
// (ver supFeedbacks em render-supervisor.js).
function renderFeedbackAnalista(){
  return `
  <div class="page-head"><div><h1 class="page-title">Feedback</h1><div class="page-desc">Sugestões e melhorias pra ferramenta — só o seu supervisor lê</div></div></div>
  <div class="card" style="max-width:560px;">
    <div id="feedbackMsg" class="login-error"></div>
    <div class="field">
      <label>Sua mensagem</label>
      <textarea id="feedbackTxt" rows="6" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;" placeholder="O que poderia melhorar no Kronos? Conte um problema, uma ideia, o que fizer sentido..."></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;">
      <button class="btn btn-brand" id="btnEnviarFeedback">Enviar feedback</button>
    </div>
  </div>`;
}

// Mesmo núcleo de Resultado SPR do supervisor/coordenador (sprResultadoBody,
// em render-supervisor.js), só que sempre escopado ao próprio analista —
// sem seletor de "quem" (picker vazio), só os hubs fixos dele mesmo.
function analistaResultadoSPR(){
  const me = userById(session.userId);
  return sprResultadoBody([me], '');
}

// Mesmo núcleo de Tempo de Execução do supervisor/coordenador
// (tempoExecucaoBody, em render-supervisor.js), sempre escopado ao próprio
// analista.
function analistaTempoExecucao(){
  const me = userById(session.userId);
  return tempoExecucaoBody([me], '');
}


// Formulários (Convocações): só mostra o que estiver "aberto" agora (ver
// formularioStatus, utils.js) — o que o supervisor programou/pausou nunca
// aparece aqui, sem precisar de nenhum filtro extra além do status.
// domingo_voluntariado/folga_escolha respondem na hora do clique (o chip já
// É a resposta); reconhecimento_mensal/ferias_solicitacao juntam campos
// antes de um botão "Enviar" (não faz sentido salvar a cada letra digitada).
function analistaFormularios(){
  const abertos = DB.formularios.filter(f=>formularioStatus(f)==='aberto');
  const conteudo = abertos.length===0
    ? '<div class="card"><div class="empty">Nenhuma convocação aberta no momento.</div></div>'
    : abertos.map(f=>analistaFormularioCardHtml(f)).join('');
  return `<div class="section-title">Formulários abertos</div>${conteudo}`;
}

function analistaFormularioCardHtml(f){
  const minha = minhaRespostaFormulario(f.id, session.userId);
  const cabecalho = `
    <div class="tag-row" style="margin-bottom:6px;"><span class="tag tag-tipo">${FORMULARIO_TIPO_LABEL[f.tipo]}</span></div>
    <div class="campaign-title">${escapeHtml(f.titulo||'')}</div>
    <p class="campaign-desc">${escapeHtml(f.descricao)}</p>
    <div class="help-text">Fecha em ${new Date(f.fechamento).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}.</div>`;

  if(f.tipo==='domingo_voluntariado'){
    const domingos = sundaysInRange(f.periodoInicio, f.periodoFim);
    const minhasDatas = minha?.payload?.datas || [];
    return `<div class="card">${cabecalho}
      <div class="formulario-chip-grid">
        ${domingos.map(d=>`<label class="formulario-chip ${minhasDatas.includes(d)?'checked':''}" data-formvol-fid="${f.id}" data-formvol-dia="${d}">${fmtDataCurta(d)}</label>`).join('')}
      </div>
    </div>`;
  }

  if(f.tipo==='folga_escolha'){
    const domingosTrab = domingosTrabalhados(session.userId, f.periodoInicio, f.periodoFim);
    const limiteFolgas = domingosTrab.length;
    if(limiteFolgas===0){
      return `<div class="card">${cabecalho}
        <div class="help-text" style="margin-top:-4px;">Você não está escalado em nenhum domingo desse período — sem direito a dia de folga por aqui.</div>
      </div>`;
    }
    // Seleção fica só local (uiState.folgaEscolhaDraft) até o analista
    // apertar "Enviar" — os cliques na grade só marcam/desmarcam o dia,
    // sem chamar a API a cada um. undefined = ainda não mexeu nesta
    // sessão, cai no que já está salvo; array (mesmo vazio) = rascunho.
    const salvas = minha?.payload?.datas || [];
    const draft = uiState.folgaEscolhaDraft[f.id];
    const minhasDatas = draft !== undefined ? draft : salvas;
    const alterado = draft !== undefined && JSON.stringify([...draft].sort())!==JSON.stringify([...salvas].sort());
    const celulas = gradeSemanalFolgaEscolha(f.periodoInicio, f.periodoFim);
    const todasRespostas = DB.formularioRespostas.filter(r=>r.formularioId===f.id);
    const atingiuLimite = minhasDatas.length >= limiteFolgas;
    const cabecalhoDias = WEEKDAY_LABELS.map(w=>`<div class="folga-cal-head">${w}</div>`).join('');
    const celulasHtml = celulas.map(d=>{
      if(!d) return `<div class="folga-cal-cell vazia"></div>`;
      if(isDomingo(d)) return `<div class="folga-cal-cell domingo" title="Domingo tem escala própria (Controle de Domingos) — não entra aqui"><span class="folga-cal-dia">${d.slice(8,10)}</span></div>`;
      // Vaga já ocupada por OUTRA pessoa considera só o que está salvo de
      // verdade (todasRespostas) — o rascunho de ninguém mais existe fora
      // da tela de quem está editando.
      const quem = todasRespostas.filter(r=>r.analistaId!==session.userId && (r.payload.datas||[]).includes(d));
      const marcado = minhasDatas.includes(d);
      const cheio = quem.length >= f.limitePorDia && !marcado;
      const bloqueado = cheio || (atingiuLimite && !marcado);
      return `<label class="folga-cal-cell selecionavel ${marcado?'checked':''} ${bloqueado?'disabled':''}" ${bloqueado?'':`data-formfolga-fid="${f.id}" data-formfolga-dia="${d}"`}>
        <span class="folga-cal-dia">${d.slice(8,10)}</span>
        <span class="folga-cal-vagas">${cheio?'lotado':`${quem.length}/${f.limitePorDia}`}</span>
      </label>`;
    }).join('');
    const domingosTexto = domingosTrab.map(d=>`${d.slice(8,10)}/${d.slice(5,7)}`).join(', ');
    return `<div class="card">${cabecalho}
      <div class="help-text" style="margin-top:-4px;margin-bottom:10px;">Você está escalado n${domingosTrab.length>1?'os domingos':'o domingo'} <b>${domingosTexto}</b> — tem direito a <b>${limiteFolgas}</b> dia${limiteFolgas>1?'s':''} de folga. <b>${minhasDatas.length}/${limiteFolgas}</b> selecionado(s). Domingo não participa (tem escala própria).</div>
      <div class="folga-cal-grid">${cabecalhoDias}${celulasHtml}</div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px;">
        ${alterado?'<span style="font-size:12px;color:var(--alert);">Seleção alterada — clique em Enviar pra confirmar.</span>':''}
        <button class="btn btn-brand btn-sm" data-formfolga-enviar="${f.id}" ${draft===undefined?'disabled':''}>${minha?'Atualizar seleção':'Enviar'}</button>
      </div>
    </div>`;
  }

  if(f.tipo==='reconhecimento_mensal'){
    const meuSupervisorId = userById(session.userId)?.supervisorId;
    const colegas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===meuSupervisorId && u.id!==session.userId);
    return `<div class="card">${cabecalho}
      <div class="grid-2" style="margin-top:10px;">
        <div class="field"><label>Quem você indica</label>
          <select data-formrec-fid="${f.id}" id="formRecIndicado-${f.id}">
            <option value="">Selecione...</option>
            ${colegas.map(c=>`<option value="${c.id}" ${minha?.payload?.indicadoId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:10px;"><label>Motivo</label><textarea id="formRecMotivo-${f.id}" rows="2" placeholder="Por que essa pessoa merece o destaque do mês?" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(minha?.payload?.motivo||'')}</textarea></div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;">
        <button class="btn btn-brand btn-sm" data-formrec-enviar="${f.id}">${minha?'Atualizar indicação':'Enviar indicação'}</button>
      </div>
    </div>`;
  }

  // ferias_solicitacao
  const statusLabel = {pendente:'⏳ Pendente de aprovação', aprovado:'✓ Aprovada', recusado:'✕ Recusada'};
  return `<div class="card">${cabecalho}
    ${minha ? `<div class="tag ${minha.status==='aprovado'?'status-aberto':minha.status==='recusado'?'status-encerrado':'status-agendado'}" style="margin-top:8px;">${statusLabel[minha.status]}</div>
      ${minha.status==='recusado' && minha.motivoRecusa ? `<div class="help-text">Motivo: ${escapeHtml(minha.motivoRecusa)}</div>` : ''}` : ''}
    <div class="grid-2" style="margin-top:10px;">
      <div class="field"><label>Início</label><input type="date" id="formFeriasInicio-${f.id}" value="${minha?.payload?.inicio||''}" min="${f.periodoInicio||''}" max="${f.periodoFim||''}"></div>
      <div class="field"><label>Fim</label><input type="date" id="formFeriasFim-${f.id}" value="${minha?.payload?.fim||''}" min="${f.periodoInicio||''}" max="${f.periodoFim||''}"></div>
    </div>
    <div class="field" style="margin-top:10px;"><label>Justificativa (opcional)</label><textarea id="formFeriasJust-${f.id}" rows="2" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(minha?.payload?.justificativa||'')}</textarea></div>
    <div style="display:flex;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-brand btn-sm" data-formferias-enviar="${f.id}">${minha?'Reenviar solicitação':'Enviar solicitação'}</button>
    </div>
  </div>`;
}


function renderRecadosAnalista(){
  const my = recadosParaAnalista(session.userId).sort((a,b)=>b.ts-a.ts);
  if(!uiState.inboxSelected || !my.find(m=>m.id===uiState.inboxSelected)) uiState.inboxSelected = my[0]?.id || null;
  const sel = my.find(m=>m.id===uiState.inboxSelected);
  const naoLidas = my.filter(r=>!(r.lidoPor||[]).includes(session.userId)).length;
  return `
  ${naoLidas>0 ? `<div class="banner">🔒 As outras abas ficam bloqueadas até você confirmar a leitura de ${naoLidas===1?'este recado':`todos os ${naoLidas} recados pendentes`}.</div>` : ''}
  <div class="page-head"><div><h1 class="page-title">Caixa de Entrada</h1><div class="page-desc">${naoLidas>0?`${naoLidas} mensagem(ns) não lida(s) · `:''}Mensagens recebidas do seu supervisor ou coordenador</div></div></div>
  <div class="card" style="padding:0;overflow:hidden;">
  <div style="display:grid;grid-template-columns:300px 1fr;min-height:460px;">
    <div style="border-right:1px solid var(--border);max-height:560px;overflow-y:auto;">
      ${my.length===0 ? '<div class="empty">Nenhum recado recebido ainda.</div>' : my.map(r=>{
        const lido = (r.lidoPor||[]).includes(session.userId);
        const active = r.id===uiState.inboxSelected;
        return `<div data-inbox-row="${r.id}" style="padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:${active?'var(--bg-2)':'transparent'};">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${lido?'transparent':'var(--brand)'};"></span>
            <span style="font-size:13px;font-weight:${lido?'400':'700'};color:${lido?'var(--text-muted)':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.from}</span>
          </div>
          <div style="font-size:12.5px;color:${lido?'var(--text-faint)':'var(--text)'};font-weight:${lido?'400':'600'};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.titulo || stripHtmlPreview(r.texto, 80))}</div>
          <div style="font-size:10.5px;color:var(--text-faint);margin-top:5px;">${timeAgo(r.ts)}${r.editado?' · editado':''}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:26px;">
      ${!sel ? '<div class="empty">Selecione uma mensagem para ler</div>' : `
        <div class="msg-meta" style="font-size:12.5px;">${sel.from} · ${timeAgo(sel.ts)}${sel.editado?' · editado':''}</div>
        ${sel.titulo ? `<div style="font-weight:700;font-size:17px;margin-top:14px;">${escapeHtml(sel.titulo)}</div>` : ''}
        <div style="font-size:15px;line-height:1.65;margin-top:${sel.titulo?'8px':'16px'};white-space:pre-wrap;">${sel.texto}</div>
        ${sel.observacoes ? `<div style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-top:10px;white-space:pre-wrap;">${escapeHtml(sel.observacoes)}</div>` : ''}
        <div style="margin-top:22px;">${(sel.lidoPor||[]).includes(session.userId) ? '<span class="pill pill-done">✓ Leitura confirmada</span>' : `<button class="btn btn-brand" data-confirmar-leitura="${sel.id}">Confirmar leitura</button>`}</div>
      `}
    </div>
  </div>
  </div>`;
}

function lembreteCardHTML(l){
  const color = l.origem==='supervisor' ? 'var(--suplente)' : 'var(--brand)';
  return `<div class="flash-card${l.done?' off':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
      <span data-lembrete-toggle="${l.id}" style="cursor:pointer;font-size:13px;font-weight:600;${l.done?'text-decoration:line-through;color:var(--text-faint);':''}">${l.titulo ? escapeHtml(l.titulo) : escapeHtml(l.texto)}</span>
      ${l.origem==='self' ? `<span data-lembrete-del="${l.id}" style="cursor:pointer;color:var(--text-faint);flex-shrink:0;">×</span>` : ''}
    </div>
    ${l.titulo ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;white-space:pre-wrap;">${escapeHtml(l.texto)}</div>` : ''}
    ${l.observacoes ? `<div style="font-size:11.5px;color:var(--text-faint);margin-top:4px;white-space:pre-wrap;">${escapeHtml(l.observacoes)}</div>` : ''}
    <div class="flash-meta" style="color:${l.done?'var(--text-faint)':color};">${l.origem==='supervisor'?`De ${l.criadoPor}`:'Meu lembrete'}${l.hora?` · ${l.hora}`:''}</div>
  </div>`;
}


// A tela dedicada de Lembretes (calendário próprio, navegação por
// dia/semana/mês) foi removida — lembretes agora só aparecem inline no
// flashcard do dia (acima, via lembreteCardHTML) e o cadastro de um novo
// vira um botão + modal na própria Programação (ver btnAddLembreteModal em
// events.js), sem precisar de uma aba própria pra isso.
