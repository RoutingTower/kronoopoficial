/* Telas do papel Analista: programação, caixa de entrada e lembretes. */

// Tempo de Execução — área de ação do flashcard, com 5 estados possíveis:
// 1) já finalizado (raio-x existe) — mostra o resumo, com a duração;
// 2) cronômetro rodando (clicou Iniciar) — timer ao vivo + Finalizar;
// 3) liberado manual pelo supervisor (esqueceu de iniciar) — Finalizar pede
//    início/fim digitados;
// 4) janela de Iniciar fechada (passou 1h do horário, nunca iniciou) —
//    trava, pede pra contatar o supervisor;
// 5) dentro da janela (de 1h antes até 1h depois do horário), sem nada
//    ainda — botão Iniciar.
function renderExecucaoActions(it, dateStr, analistaId, sprMeta){
  const raiox = DB.raioX.find(r=>r.analistaId===analistaId && r.operacao===it.operacao && r.hora===it.horaInicio && r.data===dateStr);
  if(raiox){
    const duracaoHtml = raiox.duracaoSegundos!=null
      ? ` · ⏱ ${formatarDuracao(raiox.duracaoSegundos)}${raiox.duracaoSegundos>SLA_TEMPO_EXECUCAO_SEGUNDOS ? ' <span style="color:var(--alert);font-weight:600;">acima do SLA</span>' : ''}`
      : '';
    return `<div class="flash-meta" style="margin-top:6px;">Raio-X: ${starDisplay(raiox.estrelas)}${raiox.semRoteirizacao ? ' · Sem roteirização' : raiox.sprRoteirizado!=null ? ` · SPR lançado ${escapeHtml(String(raiox.sprRoteirizado))}` : ''}${duracaoHtml}</div>`;
  }
  const dataAttrs = `data-finalizar-op="${escapeHtml(it.operacao)}" data-hora="${it.horaInicio}" data-data="${dateStr}" data-ciclo="${escapeHtml(it.ciclo)}" data-spr-meta="${sprMeta!=null?sprMeta:''}"`;
  const exec = execucaoInicioPara(analistaId, it.operacao, it.ciclo, it.horaInicio, dateStr);
  if(exec && exec.iniciadoEm!=null){
    return `<div class="timer-live" data-timer-desde="${exec.iniciadoEm}">
        <span class="timer-dot"></span><span class="timer-num mono">00:00</span><span class="timer-tag">em andamento</span>
      </div>
      <div class="flash-actions"><button class="btn btn-brand" ${dataAttrs}>■ Finalizar operação</button></div>`;
  }
  if(exec && exec.liberadoManual){
    return `<div class="flash-meta" style="color:var(--folga);font-weight:600;">🔓 Liberado pelo supervisor — informe início e fim ao finalizar</div>
      <div class="flash-actions"><button class="btn btn-brand" ${dataAttrs} data-manual="1">■ Finalizar operação</button></div>`;
  }
  if(janelaIniciarFechada(dateStr, it.horaInicio)){
    return `<div class="flash-meta" style="color:var(--alert);font-weight:600;">🔒 Não iniciado — contate seu supervisor pra liberar o preenchimento</div>`;
  }
  return `<div class="flash-actions"><button class="btn btn-brand" data-iniciar-op="${escapeHtml(it.operacao)}" data-hora="${it.horaInicio}" data-data="${dateStr}" data-ciclo="${escapeHtml(it.ciclo)}">▶ Iniciar operação</button></div>`;
}

// showLembretes só é true na própria Programação do analista (renderAnalista) —
// a "Programação Analista" do supervisor reusa esta mesma função pra ver a
// rota de qualquer analista da equipe, e lembretes são um to-do pessoal
// (origem:self), não algo que deva aparecer na visão do supervisor.
// opFiltro (fixa/cobertura/folga) também só vem preenchido da própria
// Programação do analista — ver categoriaOperacao() em utils.js.
function renderFlashcardRow(analistaId, dateStr, showLembretes, opFiltro){
  const supervisorId = userById(analistaId)?.supervisorId;
  let slots = filtrarSlotsAgenda(analistaId, dateStr, opFiltro);
  const reunioes = getReunioesForDate(analistaId, dateStr);
  const lembretesDoDia = showLembretes ? getLembretesForAnalista(analistaId).filter(l=>(l.data||todayISO())===dateStr) : [];
  const semHora = lembretesDoDia.filter(l=>!l.hora);
  const semHoraCol = showLembretes ? `<div class="flash-col"><div class="flash-time">Sem hora</div>${semHora.length===0 ? `<div class="flash-card off"><div style="color:var(--text-faint);font-size:12px;">Sem lembrete</div></div>` : semHora.map(lembreteCardHTML).join('')}</div>` : '';

  // Linha do tempo estilo Google Agenda: só faz sentido "agora" quando o
  // turno DESSA data está rolando neste exato momento — turno futuro
  // (ainda não começou) ou passado (navegando pra um dia anterior) não tem
  // "agora" pra marcar, então a tira nem aparece.
  const turnoInicio = slotTimestamp(dateStr, HOURS[0]);
  const turnoFim = slotTimestamp(dateStr, HOURS[HOURS.length-1]) + 60*60*1000;
  const agora = Date.now();
  const turnoAtivo = agora>=turnoInicio && agora<turnoFim;
  const horaAtual = turnoAtivo ? HOURS.find(h=> agora>=slotTimestamp(dateStr,h) && agora<slotTimestamp(dateStr,h)+60*60*1000) : null;

  // A tira vive dentro do MESMO .flash-outer que rola junto com .flash-row
  // — por isso o offset é calculado em px batendo com min-width/gap de
  // .flash-col no CSS (220px + 14px), não em % do container (que desalinha
  // com "Sem hora" no meio e o scroll independente que existia antes).
  const FLASH_COL_W = 220, FLASH_GAP = 14, FLASH_STEP = FLASH_COL_W + FLASH_GAP;
  const semHoraOffsetPx = showLembretes ? FLASH_STEP : 0;
  const trackWidthPx = HOURS.length*FLASH_COL_W + (HOURS.length-1)*FLASH_GAP;
  let dotOffsetPx = 0;
  if(turnoAtivo){
    const idx = HOURS.indexOf(horaAtual);
    const fracNaHora = Math.min(1, Math.max(0, (agora - slotTimestamp(dateStr,horaAtual)) / (60*60*1000)));
    dotOffsetPx = idx*FLASH_STEP + fracNaHora*FLASH_COL_W;
  }
  const timelineHtml = turnoAtivo ? `
  <div class="timeline-overlay-wrap" style="margin-left:${semHoraOffsetPx}px;width:${trackWidthPx}px;">
    <div class="timeline-track">
      <div class="timeline-fill" style="width:${dotOffsetPx}px;"></div>
      <div class="timeline-now" style="left:${dotOffsetPx}px;" title="Agora: ${new Date(agora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}"></div>
    </div>
  </div>` : '';

  return `<div class="flash-outer">` + timelineHtml + `<div class="flash-row">` + semHoraCol + HOURS.map(hour=>{
    const isAgora = hour===horaAtual;
    // Sem id de propósito: "Todos os analistas" (supProgramacao) renderiza
    // essa função várias vezes na mesma página, um id fixo duplicaria — o
    // auto-scroll (ui.js, renderMain) usa a classe e rola cada linha.
    const colAttrs = `class="flash-col${isAgora?' flash-col-agora':''}"`;
    const items = slots.filter(s=>s.horaInicio===hour);
    // Reunião casa com a coluna pelo prefixo da hora (ex.: "19:20" cai na
    // coluna "19:00") — o horário de início dela é livre de 20 em 20
    // minutos (ver REUNIAO_HORAS em state.js), mais granular que as colunas
    // do kanban, que seguem HOURS (hora a hora).
    const rns = reunioes.filter(r=>r.hora.slice(0,2)===hour.slice(0,2));
    const lembretes = lembretesDoDia.filter(l=>l.hora===hour);
    const horaLabel = `${hour}${isAgora ? ' <span class="timeline-badge-agora">agora</span>' : ''}`;
    if(items.length===0 && rns.length===0 && lembretes.length===0){
      return `<div ${colAttrs}><div class="flash-time">${horaLabel}</div><div class="flash-card off"><div style="color:var(--text-faint);font-size:12px;">Sem operação</div></div></div>`;
    }
    let cardsHtml = items.map(it=>{
      const status = computeStatus(hour, dateStr, analistaId, it.operacao, it.isOff);
      const spr = getSPR(supervisorId, it.operacao, it.ciclo);
      // "Ciente" da particularidade é por analista+operação+data (uma
      // cobertura específica), não pela nota em si (que é compartilhada) —
      // ver particularidade_ciente no schema. Mostrado mesmo pra quem só
      // está olhando (ex.: supervisor na Programação Analista), mas só quem
      // está cobrindo consegue de fato confirmar (ver events.js).
      const ciente = it.isCobertura && DB.particularidadeCiente.some(c=>c.analistaId===analistaId && c.operacao===it.operacao && c.data===dateStr);
      // Tempo de Execução (Iniciar/Finalizar) só é meu de verdade — a
      // "Programação Analista" do supervisor reusa esta função pra ver a
      // rota de qualquer analista, e ninguém aciona cronômetro alheio.
      // podeIniciarOperacao (não status!=='wait') controla a janela: libera
      // 1h antes do horário, então precisa aparecer mesmo com o slot ainda
      // "A Iniciar" pela contagem normal.
      const souEuExec = !it.isOff && analistaId===session?.userId && podeIniciarOperacao(dateStr, it.horaInicio);
      return `<div class="flash-card flash-card-${categoriaOperacao(it)}${status==='atraso'?' flash-card-atraso':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
          <span class="flash-sigla">${it.operacao}</span>${statusPill(status, true)}
        </div>
        <div class="flash-meta">${it.ciclo} · ${it.horaInicio}–${it.horaFim}${spr!=null ? ` · SPR REF ${escapeHtml(String(spr))}` : ''}</div>
        <div class="flash-meta">${it.isSuplente ? 'Suplente' : 'Titular'}: ${it.responsavelNome}</div>
        ${it.isOff ? `<div class="flash-cover">${it.tipo==='ferias'?'🏖️ Férias':'🌙 Folga'} do titular</div>`
          : it.isCobertura ? `<div class="flash-cover">🔁 Cobrindo ${it.tipo==='ferias'?'férias':'folga'} de ${it.responsavelNome}</div>` : ''}
        ${souEuExec ? renderExecucaoActions(it, dateStr, analistaId, spr) : ''}
        <div class="flash-actions" style="margin-top:8px;">
          <button class="btn btn-particularidade" data-particularidade-op="${escapeHtml(it.operacao)}" data-particularidade-sup="${supervisorId||''}" data-particularidade-cobertura="${it.isCobertura?'1':'0'}" data-particularidade-analista="${analistaId}" data-particularidade-data="${dateStr}" data-ciente="${ciente?'1':'0'}">⚙️ Ver Particularidade${(it.isCobertura && !ciente) ? '<span class="badge-alerta-ciente" title="Ainda sem confirmação de ciência"></span>' : ''}</button>
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
      <div class="flash-sigla">📅 Reunião</div>
      <div class="flash-meta">${escapeHtml(r.titulo)}</div>
      <div class="flash-meta">${r.tipo==='grupo'?'Grupo':'Individual'} · ${r.horaFim?`${r.hora}–${r.horaFim}`:r.hora}</div>
      ${r.link ? `<div class="flash-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <a class="btn btn-brand" href="${escapeHtml(normalizeUrl(r.link))}" target="_blank" rel="noopener noreferrer">Entrar na reunião</a>
        ${souEu ? (presente ? `<span class="btn btn-brand" style="cursor:default;opacity:0.75;">✓ Check-in</span>`
          : jaComecou ? `<button class="btn btn-brand" data-marcar-presenca="${r.id}">Check-in</button>`
          : `<span class="btn" style="opacity:0.5;cursor:not-allowed;" title="Libera a partir de ${r.hora}">Check-in</span>`) : ''}
      </div>` : ''}
    </div>`;
    }).join('');
    cardsHtml += lembretes.map(lembreteCardHTML).join('');
    return `<div ${colAttrs}><div class="flash-time">${horaLabel}</div>${cardsHtml}</div>`;
  }).join('') + `</div></div>`;
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

  const linhas = [];
  const folgaNomes = [];
  lista.forEach(a=>{
    const slotsOriginais = filtrarSlotsAgenda(a.id, dateStr);
    let slots = slotsOriginais;
    if(domingo) slots = slots.filter(s=>categoriaOperacao(s)!=='folga');
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

  const statusLabels = { wait:['pill-wait','⏳','A Iniciar'], live:['pill-live','🏃','Em Andamento'], done:['pill-done','✅','Finalizada'], atraso:['pill-atraso','🚨','Pendente Raio-X'] };
  const filtro = uiState.progStatusFiltro;

  // Card minimalista de propósito: só hub + ciclo, pra grade ficar limpa e
  // alinhada com muitos analistas na tela — hora/SPR REF/cobertura ainda dá
  // pra ver passando o mouse (title), particularidade e reunião saíram
  // daqui (quem quiser isso entra na Programação individual do analista).
  const cardHtml = (it, hour, analistaId)=>{
    const status = computeStatus(hour, dateStr, analistaId, it.operacao, it.isOff);
    const dim = filtro && filtro!==status;
    const detalhe = `${it.operacao} — ${it.ciclo} · ${it.horaInicio}–${it.horaFim}` +
      (it.isCobertura ? ` · Cobrindo ${it.responsavelNome}` : it.isOff ? ` · Coberto por ${it.responsavelNome}` : '');
    return `<div class="flash-card flash-card-${categoriaOperacao(it)}${status==='atraso'?' flash-card-atraso':''}${dim?' prog-dim':''}" title="${escapeHtml(detalhe)}">
      <span class="flash-sigla">${escapeHtml(it.operacao)}</span>
      <span class="prog-ciclo">${escapeHtml(it.ciclo)}</span>
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

  const rowsHtml = linhas.map(({analista,slots})=>{
    const qtd = slots.length;
    const label = `<div class="prog-row-label"><div class="nm">${escapeHtml(analista.name)}</div><div class="prog-row-count">${qtd} operaç${qtd===1?'ão':'ões'}</div></div>`;
    const cellsHtml = HOURS.map(hour=>{
      const items = slots.filter(s=>s.horaInicio===hour);
      const conteudo = items.map(it=>cardHtml(it, hour, analista.id)).join('');
      return `<div class="prog-cell${hour===horaAtual?' prog-cell-agora':''}">${conteudo}</div>`;
    }).join('');
    return label + cellsHtml;
  }).join('');

  if(linhas.length===0){
    return `<div class="empty">Nenhum analista com operação neste dia</div>`;
  }

  const legendHtml = `<div class="status-legend">
    <span class="status-legend-label">Destacar por status</span>
    ${Object.entries(statusLabels).map(([key,[cls,emoji,label]])=>
      `<span class="pill ${cls}${filtro===key?' active':''}${filtro && filtro!==key?' inactive':''}" data-status-filtro="${key}">${emoji} ${label}</span>`
    ).join('')}
    ${filtro ? `<button class="btn" id="btnLimparStatusFiltro">Limpar</button>` : ''}
    <span class="pill pill-done pill-info" title="Analistas com operação hoje">🟢 ${linhas.length} ativos</span>
    ${folgaNomes.length>0 ? `<span class="pill pill-off pill-info pill-folga-info">🌙 ${folgaNomes.length} de folga
      <span class="folga-tip"><b>De folga hoje</b><br>${folgaNomes.slice(0,2).map(escapeHtml).join('<br>')}${folgaNomes.length>2 ? `<br><span style="opacity:.7;">+${folgaNomes.length-2} outro${folgaNomes.length-2>1?'s':''}</span>` : ''}</span>
    </span>` : ''}
  </div>`;

  return `${legendHtml}<div class="prog-card-outer">
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
function statCardContagem(proxima, emoji, label, semLabel){
  if(!proxima) return `<div class="stat-card"><div class="stat-num">—</div><div class="stat-label">${emoji} ${semLabel}</div></div>`;
  const sufixoDias = proxima.diasFaltando>0 ? ` (${proxima.diasFaltando} dia${proxima.diasFaltando>1?'s':''})` : '';
  return `<div class="stat-card"><div class="stat-num">${proxima.diasFaltando===0?'Hoje':proxima.diasFaltando}</div><div class="stat-label">${emoji} ${label} · ${formatarDataCurta(proxima.data)}${sufixoDias}</div></div>`;
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
    <div class="toggle-group" data-scope="analista">
      <button data-view="diaria" class="${uiState.analistaView==='diaria'?'active':''}">Diária</button>
      <button data-view="semanal" class="${uiState.analistaView==='semanal'?'active':''}">Semanal</button>
      <button data-view="mensal" class="${uiState.analistaView==='mensal'?'active':''}">Mensal</button>
    </div>
  </div>
  <div class="grid-2" style="margin-bottom:14px;">
    <div class="stat-card">
      <div class="stat-num">${sprLancadoMedio!=null ? sprLancadoMedio.toFixed(1) : '—'}</div>
      <div class="stat-label">🎯 SPR Lançado${sprRefMedio!=null?` <span style="color:var(--text-faint);">(REF ${sprRefMedio.toFixed(1)})</span>`:''} <span style="color:var(--text-faint);">· 30 dias</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:${tempoMedioRecente!=null && tempoMedioRecente>SLA_TEMPO_EXECUCAO_SEGUNDOS?'var(--alert)':'var(--done)'};">${tempoMedioRecente!=null ? formatarDuracao(Math.round(tempoMedioRecente)) : '—'}</div>
      <div class="stat-label">⏳ Tempo médio de execução <span style="color:var(--text-faint);">(SLA 1h · 30 dias)</span></div>
    </div>
  </div>
  <div class="grid-3" style="margin-bottom:22px;">
    <div class="stat-card"><div class="stat-num">${todaySlots.length}</div><div class="stat-label">📋 Operações do dia</div></div>
    ${statCardContagem(proxCobertura, '🔁', 'Próxima cobertura', 'Sem cobertura agendada')}
    ${statCardContagem(proxFolga, '🌙', 'Próxima folga', 'Sem folga agendada')}
  </div>
  <div class="filter-row" style="align-items:center;margin-bottom:16px;">
    <input type="date" id="analistaDatePick" value="${dateStr}" class="mono" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:8px;">
    <select data-opfiltro="status">
      <option value="all" ${uiState.analistaOpFiltro==='all'?'selected':''}>Todas as operações</option>
      <option value="fixa" ${uiState.analistaOpFiltro==='fixa'?'selected':''}>🟢 Operação fixa</option>
      <option value="cobertura" ${uiState.analistaOpFiltro==='cobertura'?'selected':''}>🔵 Estou cobrindo</option>
      <option value="folga" ${uiState.analistaOpFiltro==='folga'?'selected':''}>🟡 Estou sendo coberto (folga)</option>
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
  if(analistaEmPlantao(analistaId, ds)) chips.push(`<div class="cal-chip cal-chip-plantao" title="Escalado em plantão nesse dia">🔔 Plantão</div>`);
  // isFolgaDSR() já é "dia totalmente livre": todas as operações do dia
  // cobertas por outra pessoa, nenhuma operação própria sem cobertura e
  // sem plantão — exatamente o critério de "folgando".
  else if(isFolgaDSR(analistaId, ds)) chips.push(`<div class="cal-chip cal-chip-folga-dia" title="Dia de folga">🌙 Folgando</div>`);
  getReunioesForDate(analistaId, ds).forEach(r=>{
    const faixa = r.horaFim ? `${r.hora}–${r.horaFim}` : r.hora;
    chips.push(`<div class="cal-chip cal-chip-reuniao" title="${escapeHtml(r.titulo)} · ${r.tipo==='grupo'?'Grupo':'Individual'} · ${faixa}">📅 ${r.hora} ${escapeHtml(r.titulo)}</div>`);
  });
  getLembretesForAnalista(analistaId).filter(l=>(l.data||todayISO())===ds).forEach(l=>{
    chips.push(`<div class="cal-chip cal-chip-lembrete${l.done?' cal-chip-done':''}" title="${escapeHtml(l.texto)}">📝 ${l.hora?l.hora+' ':''}${escapeHtml(l.texto)}</div>`);
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
          <div style="font-size:12.5px;color:${lido?'var(--text-faint)':'var(--text)'};font-weight:${lido?'400':'600'};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.titulo || r.texto)}</div>
          <div style="font-size:10.5px;color:var(--text-faint);margin-top:5px;">${timeAgo(r.ts)}${r.editado?' · editado':''}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:26px;">
      ${!sel ? '<div class="empty">Selecione uma mensagem para ler</div>' : `
        <div class="msg-meta" style="font-size:12.5px;">${sel.from} · ${timeAgo(sel.ts)}${sel.editado?' · editado':''}</div>
        ${sel.titulo ? `<div style="font-weight:700;font-size:17px;margin-top:14px;">${escapeHtml(sel.titulo)}</div>` : ''}
        <div style="font-size:15px;line-height:1.65;margin-top:${sel.titulo?'8px':'16px'};">${escapeHtml(sel.texto)}</div>
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
    ${l.titulo ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${escapeHtml(l.texto)}</div>` : ''}
    ${l.observacoes ? `<div style="font-size:11.5px;color:var(--text-faint);margin-top:4px;white-space:pre-wrap;">${escapeHtml(l.observacoes)}</div>` : ''}
    <div class="flash-meta" style="color:${l.done?'var(--text-faint)':color};">${l.origem==='supervisor'?`De ${l.criadoPor}`:'Meu lembrete'}${l.hora?` · ${l.hora}`:''}</div>
  </div>`;
}


// A tela dedicada de Lembretes (calendário próprio, navegação por
// dia/semana/mês) foi removida — lembretes agora só aparecem inline no
// flashcard do dia (acima, via lembreteCardHTML) e o cadastro de um novo
// vira um botão + modal na própria Programação (ver btnAddLembreteModal em
// events.js), sem precisar de uma aba própria pra isso.
