/* Telas do papel Coordenador: visão executiva da operação. */

// Histórico de um analista (escala fixa, folgas/férias, Raio-X, coberturas
// dadas) numa lista só, em ordem cronológica — junta o que hoje fica
// espalhado em telas separadas. Aberto via clique em qualquer nome de
// analista marcado com data-analista-timeline (ver events.js). Limitado a
// 60 eventos mais recentes pra não pesar o modal com histórico muito longo.
function analistaTimelineModal(analistaId){
  const a = userById(analistaId);
  if(!a) return;
  const eventos = [];
  DB.baseMestra.filter(b=>b.analistaId===analistaId).forEach(b=>{
    eventos.push({ data: b.dataInicio, texto: `📌 Escala fixa: ${escapeHtml(b.operacao)} (${b.horaInicio}–${b.horaFim}), vigência até ${b.dataFim}` });
  });
  DB.ausencias.filter(x=>x.analistaId===analistaId).forEach(x=>{
    eventos.push({ data: x.data, texto: `${x.tipo==='ferias'?'🏖️ Férias':'🌙 Folga'}${x.suplenteNome?` — coberto por ${escapeHtml(x.suplenteNome)}`:''}` });
  });
  DB.raioX.filter(r=>r.analistaId===analistaId).forEach(r=>{
    eventos.push({ data: r.data, texto: `${starDisplay(r.estrelas)} Raio-X ${escapeHtml(r.operacao)} ${r.hora}${r.observacao?` — ${escapeHtml(r.observacao)}`:''}` });
  });
  // "Cobriu" (passado) só depois que a data da cobertura já passou — antes
  // disso ainda não aconteceu, é "A cobrir" (futuro/hoje em aberto).
  const hoje = todayISO();
  DB.ausencias.filter(x=>x.suplenteId===analistaId).forEach(x=>{
    const verbo = x.data < hoje ? 'Cobriu' : 'A cobrir';
    eventos.push({ data: x.data, texto: `🤝 ${verbo} ${x.tipo==='ferias'?'férias':'folga'} de ${escapeHtml(userById(x.analistaId)?.name||'—')}` });
  });
  DB.suplencias.filter(s=>s.suplente===a.name).forEach(s=>{
    const verbo = s.dataCobertura < hoje ? 'Cobriu' : 'A cobrir';
    eventos.push({ data: s.dataCobertura, texto: `🤝 ${verbo} suplência: ${escapeHtml(s.operacao)} (${s.horaInicio}–${s.horaFim})` });
  });
  eventos.sort((x,y)=> (y.data||'').localeCompare(x.data||''));

  openModal(`<h3>Histórico — ${escapeHtml(a.name)}</h3>
    <div class="help-text" style="margin-top:2px;">${escapeHtml(a.email)} · ${userById(a.supervisorId)?.name ? `equipe de ${escapeHtml(userById(a.supervisorId).name)}` : 'sem supervisor'}</div>
    <div style="max-height:60vh;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:8px;">
    ${eventos.length===0 ? '<div class="empty">Nenhum evento registrado.</div>' : eventos.slice(0,60).map(e=>`<div class="msg-item"><div class="msg-meta">${e.data}</div><div style="margin-top:2px;">${e.texto}</div></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" data-modal-cancel>Fechar</button></div>`);
  const cancelBtn = document.querySelector('[data-modal-cancel]');
  if(cancelBtn) cancelBtn.onclick = closeModal;
}

function renderCoordenador(){
  const tabLabel = NAV.coordenador.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='acessos') content = coordAcessos();
  else if(activeNavKey==='dashboard') content = coordDashboard();
  else if(activeNavKey==='comunicados') content = coordComunicados();
  else if(activeNavKey==='painel') content = coordPainelHoraAHora();
  else if(activeNavKey==='status') content = coordStatus();
  else if(activeNavKey==='anomalias') content = coordAnomalias();
  else if(activeNavKey==='metricas') content = coordMetricas();
  else if(activeNavKey==='resultadospr') content = coordResultadoSPR();
  return `<div class="page-head"><div><h1 class="page-title">${tabLabel}</h1><div class="page-desc">Visão executiva de toda a operação</div></div></div>${content}`;
}


// Mesmo núcleo de cálculo/gráficos do supervisor (metricasBody, em
// render-supervisor.js), mas filtrando por Supervisor em vez de Analista —
// cada supervisor selecionado expande pra equipe dele inteira.
function coordMetricas(){
  const flt = uiState.metricasFiltro;
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const selecionados = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));
  const picker = `<div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnMetricasSupervisorToggle">
        <span>${flt.supervisores.length===0 ? 'Todos os supervisores' : `${flt.supervisores.length} supervisor(es) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.metricasSupervisorDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="metricasSupervisorTodos" ${flt.supervisores.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${sups.map(s=>`<label><input type="checkbox" class="metricasSupervisorChk" value="${s.id}" ${flt.supervisores.includes(s.id)?'checked':''}> ${escapeHtml(s.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum supervisor cadastrado</div>'}
      </div>` : ''}
    </div>`;
  return metricasBody(selecionados, picker, flt.supervisores.length===1 ? ' (equipe selecionada)' : '');
}

// Mesmo núcleo de Resultado SPR do supervisor (sprResultadoBody, em
// render-supervisor.js), filtrando por Supervisor em vez de Analista.
function coordResultadoSPR(){
  const flt = uiState.sprFiltro;
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const selecionados = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));
  const picker = `<div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnSprSupervisorToggle">
        <span>${flt.supervisores.length===0 ? 'Todos os supervisores' : `${flt.supervisores.length} supervisor(es) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.sprSupervisorDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="sprSupervisorTodos" ${flt.supervisores.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${sups.map(s=>`<label><input type="checkbox" class="sprSupervisorChk" value="${s.id}" ${flt.supervisores.includes(s.id)?'checked':''}> ${escapeHtml(s.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum supervisor cadastrado</div>'}
      </div>` : ''}
    </div>`;
  return sprResultadoBody(selecionados, picker);
}

// Reexecuta a classificação (mesma de metricasBody, em render-supervisor.js)
// só pra montar a planilha — metricasChartData guarda só o que os gráficos
// precisam (ranking truncado em 10, sem status por pessoa).
let metricasExportAnalistas = [];
function exportarMetricas(){
  const flt = uiState.metricasFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -7);
  const fim = flt.fim || todayISO();
  const linhas = metricasExportAnalistas.map(a=>{
    const status = classificarAnalistaNoPeriodo(a.id, inicio, fim);
    const coberturas = DB.ausencias.filter(x=>x.suplenteId===a.id && x.data>=inicio && x.data<=fim).length
      + DB.suplencias.filter(s=>s.suplente===a.name && s.dataCobertura>=inicio && s.dataCobertura<=fim).length;
    return [a.name, status, coberturas];
  });
  exportarRelatorioExcel(`metricas_${inicio}_a_${fim}.xlsx`, ['Analista','Status','Coberturas'], linhas);
}

// Quem cobre e em qual dia da semana, pros 10 analistas que mais cobrem
// (ausencias.suplenteId + suplencias.suplente) dentro da seleção atual —
// útil pra achar sobrecarga (ex.: sempre a mesma pessoa cobrindo domingo).
// Só conta cobertura já realizada (data no passado) — igual à mesma regra
// aplicada em analistaDesempenho() e na timeline por analista.
function coberturaHeatmap(analistas){
  const nomes = new Map(analistas.map(a=>[a.id, a.name]));
  const nomesValidos = new Set(nomes.values());
  const hojeStr = todayISO();
  const porPessoa = {};
  function bump(nome, dataStr){
    if(!nome || !dataStr || !nomesValidos.has(nome) || dataStr>=hojeStr) return;
    const dow = new Date(dataStr+'T00:00:00').getDay();
    if(!porPessoa[nome]) porPessoa[nome] = [0,0,0,0,0,0,0];
    porPessoa[nome][dow]++;
  }
  DB.ausencias.forEach(a=>{ if(a.suplenteId && nomes.has(a.suplenteId)) bump(nomes.get(a.suplenteId), a.data); });
  DB.suplencias.forEach(s=> bump(s.suplente, s.dataCobertura));

  const linhas = Object.entries(porPessoa)
    .map(([name,dias])=>({name, dias, total: dias.reduce((a,b)=>a+b,0)}))
    .sort((a,b)=>b.total-a.total)
    .slice(0,10);
  const maxCel = Math.max(1, ...linhas.flatMap(l=>l.dias));

  if(linhas.length===0) return '';
  return `
  <div class="card" style="margin-top:20px;">
    <div class="section-title">Mapa de cobertura — top 10 quem mais cobre, por dia da semana</div>
    <div style="overflow-x:auto;">
    <table><thead><tr><th>Analista</th>${WEEKDAY_LABELS.map(w=>`<th style="text-align:center;">${w}</th>`).join('')}<th style="text-align:center;">Total</th></tr></thead><tbody>
    ${linhas.map(l=>`<tr><td>${escapeHtml(l.name)}</td>${l.dias.map(c=>{
      const alpha = c===0 ? 0 : 0.15 + 0.75*(c/maxCel);
      return `<td style="text-align:center;background:rgba(238,77,45,${alpha.toFixed(2)});color:${alpha>0.5?'#fff':'inherit'};">${c||''}</td>`;
    }).join('')}<td class="mono" style="text-align:center;">${l.total}</td></tr>`).join('')}
    </tbody></table>
    </div>
  </div>`;
}


function coordComunicados(){
  const sups = usersByRole('supervisor');
  const blocks = sups.map(s=>{
    const msgs = DB.recados.filter(r=>r.from.includes(s.name)).sort((a,b)=>b.ts-a.ts);
    return `<div class="card" style="margin-bottom:16px;">
      <div class="section-title">${s.name} — ${DB.users.filter(u=>u.supervisorId===s.id).length} analista(s) na equipe</div>
      ${msgs.length===0 ? '<div class="empty">Nenhum comunicado enviado por este supervisor.</div>' :
        msgs.map(r=>`<div class="msg-item"><div class="msg-meta">${timeAgo(r.ts)}${r.editado?' · editado':''}</div>${r.titulo?`<div style="font-weight:700;margin-top:4px;">${escapeHtml(r.titulo)}</div>`:''}<div style="margin-top:4px;">${escapeHtml(r.texto)}</div>${r.observacoes?`<div style="font-size:12.5px;color:var(--text-faint);margin-top:6px;white-space:pre-wrap;">${escapeHtml(r.observacoes)}</div>`:''}</div>`).join('')}
    </div>`;
  }).join('');
  return blocks || '<div class="empty">Nenhum supervisor cadastrado</div>';
}


function coordPainelHoraAHora(){
  const flt = uiState.painelFiltro;
  const data = flt.data || hojeAgendaISO();
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const analistas = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));

  let rows = [];
  analistas.forEach(a=>{
    const slots = getDaySlots(a.id, data);
    const supNome = userById(a.supervisorId)?.name || '—';
    slots.forEach(s=>{
      rows.push({analistaId:a.id, analista:a.name, supervisor:supNome, op:s.operacao, hora:s.horaInicio, horaFim:s.horaFim, nome:s.responsavelNome, isSuplente:s.isSuplente, status:computeStatus(s.horaInicio, data, a.id, s.operacao, s.isOff)});
    });
  });
  rows.sort((a,b)=> hourSortValue(a.hora)-hourSortValue(b.hora));

  return `
  <div class="filter-row" style="margin-bottom:14px;">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Data
      <input type="date" data-painelfiltro="data" value="${data}">
    </label>
    <div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnPainelSupervisorToggle">
        <span>${flt.supervisores.length===0 ? 'Todos os supervisores' : `${flt.supervisores.length} supervisor(es) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.painelSupervisorDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="painelSupervisorTodos" ${flt.supervisores.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${sups.map(s=>`<label><input type="checkbox" class="painelSupervisorChk" value="${s.id}" ${flt.supervisores.includes(s.id)?'checked':''}> ${escapeHtml(s.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum supervisor cadastrado</div>'}
      </div>` : ''}
    </div>
    <button class="btn" id="btnExportPainel">⬇ Exportar Excel</button>
  </div>
  <div class="card">
  <table><thead><tr><th>Horário</th><th>Analista</th><th>Supervisor</th><th>Operação</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
  ${rows.map(r=>`<tr class="${r.isSuplente?'row-suplente':''}"><td class="mono">${r.hora}–${r.horaFim}</td><td style="cursor:pointer;" data-analista-timeline="${r.analistaId}" title="Ver histórico">${r.analista}</td><td>${r.supervisor}</td><td>${r.op}</td><td>${r.nome} ${r.isSuplente?'<span class="pill pill-suplente">🔁 Suplente</span>':''}</td><td>${statusPill(r.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem registros para essa data</td></tr>'}
  </tbody></table></div>`;
}

// Recalcula os mesmos dados de coordPainelHoraAHora() a partir do uiState
// atual e exporta — função separada (em vez de guardar as rows calculadas
// no render) pra não depender de closure/estado que pode ficar velho entre
// um render e o clique no botão.
function exportarPainelHoraAHora(){
  const flt = uiState.painelFiltro;
  const data = flt.data || hojeAgendaISO();
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const analistas = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));
  const linhas = [];
  analistas.forEach(a=>{
    const supNome = userById(a.supervisorId)?.name || '—';
    getDaySlots(a.id, data).forEach(s=>{
      linhas.push([s.horaInicio, a.name, supNome, s.operacao, s.responsavelNome, s.isSuplente?'Suplente':'Titular']);
    });
  });
  exportarRelatorioExcel(`painel-hora-a-hora_${data}.xlsx`, ['Hora Início','Analista','Supervisor','Operação','Responsável','Tipo'], linhas);
}


function coordAcessos(){
  const sups = usersByRole('supervisor');
  return `
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-brand" id="btnNovoSupervisor">+ Novo Supervisor</button></div>
  <div class="card"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Equipe</th><th>Status</th><th></th></tr></thead><tbody>
  ${sups.map(s=>`<tr><td>${s.name}</td><td class="mono" style="color:var(--text-muted);">${s.email}</td>
  <td>${DB.users.filter(u=>u.supervisorId===s.id).length} analistas</td>
  <td>${s.active?'<span class="pill pill-done">Ativo</span>':'<span class="pill pill-off">Inativo</span>'}</td>
  <td style="text-align:right;"><button class="btn" data-resetpw="${s.id}">Resetar senha</button></td></tr>`).join('')}
  </tbody></table></div>`;
}


// Guarda os dados calculados pra renderDashboardCharts() (ui.js) desenhar
// sem recalcular — mesmo padrão de metricasChartData.
let dashboardChartData = null;

// Semáforo de risco: cruza os últimos 7 dias de Raio-X de cada analista
// (mesma noção de "no prazo" de analistaDesempenho, em render-analista.js —
// reaproveitada aqui) pra achar quem acumulou atraso na hora de registrar
// ou nota baixa recente. Não é acusação — é ponto de partida pra 1:1.
function analistasEmRisco(analistas){
  const seteDiasAtras = addDaysISO(todayISO(), -7);
  return analistas.map(a=>{
    const recentes = DB.raioX.filter(r=>r.analistaId===a.id && (r.data||'')>=seteDiasAtras);
    const atrasados = recentes.filter(r=>r.ts > slotTimestamp(r.data, r.hora) + 60*60*1000).length;
    const media = recentes.length ? recentes.reduce((s,r)=>s+(r.estrelas||0),0)/recentes.length : null;
    const motivos = [];
    if(atrasados>=2) motivos.push(`${atrasados} registros com atraso (7 dias)`);
    if(media!=null && media<3) motivos.push(`média ${media.toFixed(1)}★ (7 dias)`);
    return { id:a.id, name:a.name, motivos };
  }).filter(r=>r.motivos.length>0).sort((a,b)=>b.motivos.length-a.motivos.length);
}

function coordDashboard(){
  const flt = uiState.dashboardFiltro;
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const analistas = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));
  const ids = analistas.map(a=>a.id);

  const today = hojeAgendaISO();
  const opsAtivas = DB.baseMestra.filter(b=>ids.includes(b.analistaId) && bmRodaNoDia(b, today)).length;
  const folgasHoje = new Set(DB.ausencias.filter(a=>a.data===today && ids.includes(a.analistaId)).map(a=>a.analistaId)).size;
  const avaliacaoBaixa = DB.raioX.filter(r=>ids.includes(r.analistaId) && (r.estrelas||0)<=2).length;

  // Alerta proativo: operações de hoje que já passaram de 1h sem Raio-X
  // registrado (mesmo cálculo de computeStatus==='atraso', só que contado
  // aqui pra virar um aviso no topo em vez de precisar abrir outra tela).
  const atrasoHoje = DB.baseMestra.filter(b=>ids.includes(b.analistaId) && bmRodaNoDia(b, today)).filter(b=>{
    const isOff = DB.ausencias.some(a=>a.baseMestraId===b.id && a.data===today);
    return computeStatus(b.horaInicio, today, b.analistaId, b.operacao, isOff)==='atraso';
  }).length;
  const risco = analistasEmRisco(analistas);

  const classificacao = analistas.map(a=>classificarAnalistaNoPeriodo(a.id, today, today));
  const statusHoje = {
    ativos: classificacao.filter(s=>s==='ativo').length,
    folga: classificacao.filter(s=>s==='folga').length,
    semDados: classificacao.filter(s=>s==='sem-dados').length,
  };
  const porSupervisor = supsSelecionados
    .map(s=>({ name: s.name, count: DB.users.filter(u=>u.role==='analista' && u.supervisorId===s.id).length }))
    .sort((a,b)=>b.count-a.count);
  dashboardChartData = { statusHoje, porSupervisor };

  return `
  <div class="filter-row" style="margin-bottom:14px;">
    <div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnDashboardSupervisorToggle">
        <span>${flt.supervisores.length===0 ? 'Todos os supervisores' : `${flt.supervisores.length} supervisor(es) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.dashboardSupervisorDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="dashboardSupervisorTodos" ${flt.supervisores.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${sups.map(s=>`<label><input type="checkbox" class="dashboardSupervisorChk" value="${s.id}" ${flt.supervisores.includes(s.id)?'checked':''}> ${escapeHtml(s.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum supervisor cadastrado</div>'}
      </div>` : ''}
    </div>
    <button class="btn" id="btnExportDashboard">⬇ Exportar Excel</button>
  </div>
  ${atrasoHoje>0 ? `<div class="highlight-card" style="margin-bottom:14px;border-color:var(--alert);">
    <div class="section-title">🚨 ${atrasoHoje} operação(ões) de hoje com Raio-X pendente há mais de 1h</div>
  </div>` : ''}
  <div class="grid-3" style="margin-bottom:14px;">
    <div class="stat-card"><div class="stat-num">${analistas.length}</div><div class="stat-label">Analistas na base</div></div>
    <div class="stat-card"><div class="stat-num">${supsSelecionados.length}</div><div class="stat-label">Supervisores</div></div>
    <div class="stat-card"><div class="stat-num">${opsAtivas}</div><div class="stat-label">Operações ativas hoje</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:20px;">
    <div class="stat-card"><div class="stat-num">${folgasHoje}</div><div class="stat-label">Analistas em folga/férias hoje</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--alert);">${avaliacaoBaixa}</div><div class="stat-label">Raio-X com avaliação baixa (≤2★, últimos 30 dias)</div></div>
  </div>
  ${risco.length>0 ? `<div class="card" style="margin-bottom:20px;">
    <div class="section-title">🟡 Analistas em risco (últimos 7 dias)</div>
    ${risco.map(r=>`<div class="msg-item" style="cursor:pointer;" data-analista-timeline="${r.id}">
      <div class="msg-meta">${escapeHtml(r.name)}</div>
      <div class="chip-row" style="margin-top:4px;">${r.motivos.map(m=>`<span class="chip-pessoa">${escapeHtml(m)}</span>`).join('')}</div>
    </div>`).join('')}
  </div>` : ''}
  <div class="grid-2" style="align-items:start;">
    <div class="chart-card"><div class="section-title">Status hoje</div><canvas id="chartDashboardStatus"></canvas></div>
    <div class="chart-card"><div class="section-title">Analistas por supervisor</div><canvas id="chartDashboardSupervisor"></canvas></div>
  </div>`;
}

// Mesmo motivo de exportarPainelHoraAHora() — recalcula do zero em vez de
// reaproveitar dashboardChartData, que só guarda o que os gráficos
// precisam (não a lista de risco).
function exportarDashboard(){
  const flt = uiState.dashboardFiltro;
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const analistas = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId));
  const porSupervisor = supsSelecionados.map(s=>[s.name, DB.users.filter(u=>u.role==='analista' && u.supervisorId===s.id).length]);
  const risco = analistasEmRisco(analistas).map(r=>[r.name, r.motivos.join('; ')]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Supervisor','Nº Analistas'], ...porSupervisor]), 'Por supervisor');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Analista','Motivo(s)'], ...risco]), 'Analistas em risco');
  XLSX.writeFile(wb, `dashboard-global_${todayISO()}.xlsx`);
}

// Mesmo padrão de renderMetricasCharts()/renderOcorrenciasCharts() — destrói
// as instâncias antigas (canvas recriado do zero a cada render) e não faz
// nada fora da tela de Dashboard Global.
let dashboardChartInstances = {};
function renderDashboardCharts(){
  Object.values(dashboardChartInstances).forEach(c=>c.destroy());
  dashboardChartInstances = {};
  const elStatus = document.getElementById('chartDashboardStatus');
  if(!elStatus || !dashboardChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  dashboardChartInstances.status = new Chart(elStatus, {
    type:'doughnut',
    data:{ labels:['Ativos','Em Folga','Sem registro'],
      datasets:[{ data:[dashboardChartData.statusHoje.ativos, dashboardChartData.statusHoje.folga, dashboardChartData.statusHoje.semDados],
        backgroundColor:['#2FAE60','#B8860B','#A8A8A8'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } } }
  });

  const elSup = document.getElementById('chartDashboardSupervisor');
  if(elSup){
    dashboardChartInstances.porSupervisor = new Chart(elSup, {
      type:'bar',
      data:{ labels: dashboardChartData.porSupervisor.map(r=>r.name), datasets:[{ label:'Analistas', data: dashboardChartData.porSupervisor.map(r=>r.count), backgroundColor:'#EE4D2D', borderRadius:4 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:false, maxRotation:60, minRotation:0 }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, precision:0 }, grid:{ color:gridColor } } } }
    });
  }
}


// Guarda os dados calculados pra renderStatusCharts() (ui.js) desenhar sem
// recalcular — mesmo padrão de dashboardChartData/metricasChartData.
let statusChartData = null;

function coordStatus(){
  const flt = uiState.statusFiltro;
  const sups = usersByRole('supervisor');
  const supsSelecionados = flt.supervisores.length ? sups.filter(s=>flt.supervisores.includes(s.id)) : sups;
  const supIds = supsSelecionados.map(s=>s.id);
  const analistaIds = new Set(DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId)).map(u=>u.id));

  const today = hojeAgendaISO();
  let done=0,live=0,wait=0,atraso=0;
  const atrasoPorSupervisor = {};
  DB.baseMestra.filter(b=>analistaIds.has(b.analistaId) && bmRodaNoDia(b, today)).forEach(b=>{
    const isOff = DB.ausencias.some(a=>a.baseMestraId===b.id && a.data===today);
    const s = computeStatus(b.horaInicio, today, b.analistaId, b.operacao, isOff);
    if(s==='done') done++;
    else if(s==='live') live++;
    else if(s==='atraso'){
      atraso++;
      const supNome = userById(userById(b.analistaId)?.supervisorId)?.name || '—';
      atrasoPorSupervisor[supNome] = (atrasoPorSupervisor[supNome]||0)+1;
    } else wait++;
  });
  const atrasoRanking = Object.entries(atrasoPorSupervisor).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  statusChartData = { status:{wait,live,done,atraso}, atrasoPorSupervisor: atrasoRanking };

  return `
  <div class="filter-row" style="margin-bottom:14px;">
    <div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnStatusSupervisorToggle">
        <span>${flt.supervisores.length===0 ? 'Todos os supervisores' : `${flt.supervisores.length} supervisor(es) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.statusSupervisorDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="statusSupervisorTodos" ${flt.supervisores.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${sups.map(s=>`<label><input type="checkbox" class="statusSupervisorChk" value="${s.id}" ${flt.supervisores.includes(s.id)?'checked':''}> ${escapeHtml(s.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum supervisor cadastrado</div>'}
      </div>` : ''}
    </div>
    <button class="btn" id="btnExportStatus">⬇ Exportar Excel</button>
  </div>
  <div class="card" style="margin-bottom:20px;">
  <div class="section-title">Andamento global — hoje</div>
  <div style="display:flex;gap:10px;margin-bottom:16px;">
    <div style="flex:${wait};background:var(--wait);height:10px;border-radius:5px;"></div>
    <div style="flex:${live};background:var(--live);height:10px;border-radius:5px;"></div>
    <div style="flex:${done};background:var(--done);height:10px;border-radius:5px;"></div>
    <div style="flex:${atraso};background:var(--alert);height:10px;border-radius:5px;"></div>
  </div>
  <div class="grid-3">
    <div><span class="pill pill-wait">A Iniciar</span> <span class="mono">${wait}</span></div>
    <div><span class="pill pill-live">Em Andamento</span> <span class="mono">${live}</span></div>
    <div><span class="pill pill-done">Finalizada</span> <span class="mono">${done}</span></div>
    <div><span class="pill pill-atraso">🚨 Atraso</span> <span class="mono">${atraso}</span></div>
  </div>
  </div>
  <div class="grid-2" style="align-items:start;">
    <div class="chart-card"><div class="section-title">Distribuição de status — hoje</div><canvas id="chartStatusOperacional"></canvas></div>
    <div class="chart-card"><div class="section-title">Atrasos por supervisor — hoje</div><canvas id="chartAtrasoSupervisor"></canvas></div>
  </div>`;
}

// Usa statusChartData direto (já atualizado no render que deixou o botão
// visível — sempre roda antes de qualquer clique possível).
function exportarStatus(){
  if(!statusChartData) return;
  const { status, atrasoPorSupervisor } = statusChartData;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Status','Quantidade'],
    ['A Iniciar', status.wait], ['Em Andamento', status.live], ['Finalizada', status.done], ['Atraso', status.atraso],
  ]), 'Status hoje');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Supervisor','Atrasos'], ...atrasoPorSupervisor.map(r=>[r.name, r.count])]), 'Atrasos por supervisor');
  XLSX.writeFile(wb, `status-operacional_${hojeAgendaISO()}.xlsx`);
}

// Mesmo padrão de renderDashboardCharts()/renderMetricasCharts() — destrói
// as instâncias antigas e não faz nada fora da tela de Status Operacional.
let statusChartInstances = {};
function renderStatusCharts(){
  Object.values(statusChartInstances).forEach(c=>c.destroy());
  statusChartInstances = {};
  const elStatus = document.getElementById('chartStatusOperacional');
  if(!elStatus || !statusChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  statusChartInstances.status = new Chart(elStatus, {
    type:'doughnut',
    data:{ labels:['A Iniciar','Em Andamento','Finalizada','Atraso'],
      datasets:[{ data:[statusChartData.status.wait, statusChartData.status.live, statusChartData.status.done, statusChartData.status.atraso],
        backgroundColor:['#A8A8A8','#2F80ED','#2FAE60','#EE4D2D'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } } }
  });

  const elAtraso = document.getElementById('chartAtrasoSupervisor');
  if(elAtraso){
    statusChartInstances.atraso = new Chart(elAtraso, {
      type:'bar',
      data:{ labels: statusChartData.atrasoPorSupervisor.map(r=>r.name), datasets:[{ label:'Atrasos', data: statusChartData.atrasoPorSupervisor.map(r=>r.count), backgroundColor:'#EE4D2D', borderRadius:4 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:false, maxRotation:60, minRotation:0 }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, precision:0 }, grid:{ color:gridColor } } } }
    });
  }
}


// Reaproveita ocorrenciasChartData/renderOcorrenciasCharts (definidos em
// render-supervisor.js, supOcorrencias) — mesmos dois gráficos, só que
// filtrando por Supervisor + Operação em vez de Analista + Operação.
// anomaliasExportRows guarda as linhas do último render pra exportarAnomalias().
let anomaliasExportRows = [];
function coordAnomalias(){
  const f = uiState.anomaliasFiltro;
  const inicio = f.inicio || addDaysISO(todayISO(), -30);
  const fim = f.fim || todayISO();
  const sups = usersByRole('supervisor');
  const operacoesTodas = [...new Set(DB.baseMestra.map(b=>b.operacao))].sort();

  const idsPermitidos = f.supervisor!=='all'
    ? new Set(DB.users.filter(u=>u.role==='analista' && u.supervisorId===f.supervisor).map(u=>u.id))
    : null; // null = sem restrição de supervisor

  const rows = DB.raioX.filter(r=>
    (r.data||'')>=inicio && (r.data||'')<=fim
    && (!idsPermitidos || idsPermitidos.has(r.analistaId))
    && (f.operacao==='all' || r.operacao===f.operacao)
  ).sort((a,b)=>b.ts-a.ts);

  const porOperacao = {};
  rows.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = [];
    porOperacao[r.operacao].push(r.estrelas||0);
  });
  const ranking = Object.entries(porOperacao)
    .map(([op, vals])=>({ op, media: vals.reduce((a,b)=>a+b,0)/vals.length, n: vals.length }))
    .sort((a,b)=> a.media-b.media);

  const distribuicaoEstrelas = [1,2,3,4,5].map(n=>rows.filter(r=>(r.estrelas||0)===n).length);
  ocorrenciasChartData = { ranking: ranking.slice(0,10), distribuicaoEstrelas };
  anomaliasExportRows = rows;

  return `
  <div class="filter-row" style="margin-bottom:16px;">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-anomaliasfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-anomaliasfiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <select data-anomaliasfiltro="supervisor">
      <option value="all">Supervisor: todos</option>
      ${sups.map(s=>`<option value="${s.id}" ${f.supervisor===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
    </select>
    <select data-anomaliasfiltro="operacao">
      <option value="all">Operação: todas</option>
      ${operacoesTodas.map(op=>`<option value="${op}" ${f.operacao===op?'selected':''}>${op}</option>`).join('')}
    </select>
    <button class="btn" id="btnExportAnomalias">⬇ Exportar Excel</button>
  </div>
  <div class="grid-3" style="grid-template-columns:repeat(6,1fr);margin-bottom:16px;">
    <div class="stat-card"><div class="stat-num">${rows.length}</div><div class="stat-label">Total de Raio-X</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#D9362E;">${distribuicaoEstrelas[0]}</div><div class="stat-label">1★</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#EE4D2D;">${distribuicaoEstrelas[1]}</div><div class="stat-label">2★</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#B8860B;">${distribuicaoEstrelas[2]}</div><div class="stat-label">3★</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#7FB069;">${distribuicaoEstrelas[3]}</div><div class="stat-label">4★</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#2FAE60;">${distribuicaoEstrelas[4]}</div><div class="stat-label">5★</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:18px;align-items:start;">
    <div class="chart-card"><div class="section-title">Distribuição de avaliações</div><canvas id="chartEstrelas"></canvas></div>
    <div class="chart-card"><div class="section-title">Avaliação média por operação</div><canvas id="chartAvaliacaoOperacao"></canvas></div>
  </div>
  <div class="card" style="margin-bottom:16px;"><div class="section-title">Avaliação média por operação</div>
  <table><thead><tr><th>Operação</th><th>Avaliação média</th><th>Finalizações</th></tr></thead><tbody>
  ${ranking.map(r=>`<tr><td>${r.op}</td><td>${starDisplay(Math.round(r.media))} <span class="mono" style="color:var(--text-muted);">(${r.media.toFixed(1)})</span></td><td class="mono">${r.n}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sem finalizações no período selecionado</td></tr>'}
  </tbody></table></div>
  <div class="card">
  ${rows.map(r=>`<div class="msg-item">
    <div class="msg-meta">${userById(r.analistaId)?.name} · ${r.operacao} · ${r.data} ${r.hora} · ${timeAgo(r.ts)}</div>
    <div>${starDisplay(r.estrelas)}</div>
    <div style="margin-top:4px;">${escapeHtml(r.observacao||'')}</div>
  </div>`).join('') || '<div class="empty">Nenhum registro no período selecionado</div>'}
  </div>`;
}

function exportarAnomalias(){
  const linhas = anomaliasExportRows.map(r=>[userById(r.analistaId)?.name||'—', r.operacao, r.data, r.hora, r.estrelas, r.observacao||'']);
  exportarRelatorioExcel(`ocorrencias_${uiState.anomaliasFiltro.inicio}_a_${uiState.anomaliasFiltro.fim}.xlsx`, ['Analista','Operação','Data','Hora','Estrelas','Observação'], linhas);
}

