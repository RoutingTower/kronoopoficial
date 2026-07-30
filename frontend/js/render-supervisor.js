/* Telas do papel Supervisor: cadastros, cobertura, eventos, métricas, caixa de envio, ocorrências. */

function renderSupervisor(){
  const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
  const tabLabel = NAV.supervisor.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='cadastros') content = supCadastros(myAnalistas);
  else if(activeNavKey==='basemestra') content = supBaseMestra(myAnalistas);
  else if(activeNavKey==='suplencias') content = supSugerirSuplente(myAnalistas) + supSuplencias(myAnalistas);
  else if(activeNavKey==='programacao') content = supProgramacao(myAnalistas);
  else if(activeNavKey==='grade') content = supGrade(myAnalistas);
  else if(activeNavKey==='reunioes') content = supReunioes(myAnalistas) + supPlantao();
  else if(activeNavKey==='metricas') content = supMetricas(myAnalistas);
  else if(activeNavKey==='transmissao') content = supTransmissao(myAnalistas);
  else if(activeNavKey==='ocorrencias') content = supOcorrencias(myAnalistas);
  return `<div class="page-head"><div><h1 class="page-title">${tabLabel}</h1><div class="page-desc">Gestão da equipe de ${session.name}</div></div></div>${content}`;
}


function supCadastros(myAnalistas){
  return `
  <div class="csv-row">
    <span class="csv-label">Carga em massa de analistas (Excel)</span>
    <button class="btn" id="btnBaixarModeloAnalista">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportAnalista" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovoAnalista">+ Novo Analista</button>
  </div>
  <div class="card">
    <table><thead><tr><th>Nome</th><th>E-mail</th><th>Jornada de trabalho</th><th>Status</th><th></th></tr></thead><tbody>
    ${myAnalistas.map(a=>`<tr>
      <td>${a.name}</td><td class="mono" style="color:var(--text-muted);">${a.email}</td>
      <td class="jornada-tag">${jornadaLabel(a)}</td>
      <td>${a.active?'<span class="pill pill-done">Ativo</span>':'<span class="pill pill-off">Inativo</span>'}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn" data-editar-analista="${a.id}">Editar</button>
        <button class="btn" data-resetpw="${a.id}">Resetar senha</button>
        <button class="btn btn-danger" data-excluir-analista="${a.id}">Excluir</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum analista cadastrado</td></tr>'}
    </tbody></table>
  </div>`;
}


function supBaseMestra(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const rows = DB.baseMestra.filter(b=>ids.includes(b.analistaId));
  return `
  <div class="csv-row">
    <span class="csv-label">Carga em massa das operações do titular (Excel)</span>
    <button class="btn" id="btnBaixarModeloMestra">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportMestra" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovaMestra">+ Nova entrada</button>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>Horário</th><th>Titular</th><th>Vigência</th><th></th></tr></thead><tbody>
  ${rows.map(b=>`<tr><td>${b.operacao}</td><td>${b.ciclo}</td><td class="mono">${b.horaInicio}–${b.horaFim}</td><td>${b.titular}</td><td class="mono" style="color:var(--text-muted);">${b.dataInicio} → ${b.dataFim}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-mestra="${b.id}">Editar</button> <button class="btn btn-danger" data-excluir-mestra="${b.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma operação fixa cadastrada</td></tr>'}
  </tbody></table></div>`;
}


function supSuplencias(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const f = uiState.suplenciasFiltro;
  const allRows = DB.suplencias.filter(s=>ids.includes(s.analistaOriginalId));
  const rows = allRows.filter(s=>
    (!f.operacao || s.operacao.toLowerCase().includes(f.operacao.toLowerCase())) &&
    (!f.horario || `${s.horaInicio}–${s.horaFim}`.includes(f.horario)) &&
    (f.suplente==='all' || s.suplente===f.suplente) &&
    (f.cobrindo==='all' || s.analistaOriginalId===f.cobrindo) &&
    (!f.inicio || s.dataCobertura>=f.inicio) &&
    (!f.fim || s.dataCobertura<=f.fim)
  );
  const suplentesUnicos = [...new Set(allRows.map(s=>s.suplente))].filter(Boolean).sort();
  return `
  <div class="section-title">Cobertura</div>
  <div class="csv-row">
    <span class="csv-label">Carga em massa de coberturas avulsas (Excel)</span>
    <button class="btn" id="btnBaixarModeloSuplencia">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportSuplencia" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovaSuplencia">+ Nova cobertura avulsa</button>
  </div>
  <div class="filter-row">
    <input placeholder="Filtrar por operação..." data-suplenciafiltro="operacao" value="${f.operacao}">
    <input placeholder="Filtrar por horário (ex: 19:00)" data-suplenciafiltro="horario" value="${f.horario}">
    <select data-suplenciafiltro="suplente">
      <option value="all">Suplente: todos</option>
      ${suplentesUnicos.map(n=>`<option value="${n}" ${f.suplente===n?'selected':''}>${n}</option>`).join('')}
    </select>
    <select data-suplenciafiltro="cobrindo">
      <option value="all">Cobrindo: todos</option>
      ${myAnalistas.map(a=>`<option value="${a.id}" ${f.cobrindo===a.id?'selected':''}>${a.name}</option>`).join('')}
    </select>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-suplenciafiltro="inicio" value="${f.inicio}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-suplenciafiltro="fim" value="${f.fim}">
    </label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
    <button class="btn btn-danger" id="btnExcluirTodasSuplencias" ${rows.length===0?'disabled':''}>Excluir todos (${rows.length})</button>
  </div>
  <div class="card" style="margin-bottom:22px;">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>Horário</th><th>Suplente</th><th>Cobrindo</th><th>Data</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${s.operacao}</td><td>${s.ciclo||'—'}</td><td class="mono">${s.horaInicio}–${s.horaFim}</td><td>${s.suplente}</td><td>${userById(s.analistaOriginalId)?.name||'—'}</td><td class="mono">${s.dataCobertura}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-suplencia="${s.id}">Editar</button> <button class="btn btn-danger" data-excluir-suplencia="${s.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhuma cobertura avulsa registrada</td></tr>'}
  </tbody></table></div>`;
}


function supSugerirSuplente(myAnalistas){
  const st = uiState.sugerir;
  let resultsHtml = '';
  if(st && st.items){
    resultsHtml = `<div class="card" style="margin-top:18px;margin-bottom:22px;">
      <div class="section-title">Operações de ${userById(st.analistaId)?.name} em ${st.data}</div>
      ${st.items.length===0 ? '<div class="empty">Este analista não possui operações na base mestra para essa data.</div>' :
      st.items.map((it,idx)=>{
        const bm = DB.baseMestra.find(b=>b.id===it.bmId);
        return `<div class="candidate-row">
          <span class="op-tag">${bm.operacao} <span class="mono" style="color:var(--text-muted);font-weight:400;">${bm.horaInicio}–${bm.horaFim}</span></span>
          <select data-sugerir-idx="${idx}">
            ${it.candidatos.length===0 ? '<option value="">Nenhum suplente disponível</option>' :
              it.candidatos.map(c=>`<option value="${c.id}" ${it.chosenId===c.id?'selected':''}>${c.name} — ${c.opsHoje} op(s) hoje, ${c.coberturasNoMes} cobertura(s)/mês</option>`).join('')}
          </select>
        </div>`;
      }).join('')}
      ${st.items.length>0 ? `<div style="display:flex;justify-content:flex-end;margin-top:10px;"><button class="btn btn-brand" id="btnConfirmarSugestao">Confirmar coberturas</button></div>` : ''}
    </div>`;
  }
  return `
  <div class="section-title">Sugerir Suplente</div>
  <div class="help-text">Informe o analista titular e a data da folga. O sistema sugere, para cada operação do dia, o suplente com a jornada livre, priorizando menos operações no dia e menos coberturas no mês.</div>
  <div class="card" style="margin-bottom:22px;">
    <div class="grid-3">
      <div class="field" style="margin-bottom:0;"><label>Analista (titular)</label>
        <select id="sugAnalista">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-bottom:0;"><label>Data da folga</label><input type="date" id="sugData" value="${todayISO()}"></div>
      <div class="field" style="margin-bottom:0;"><label>Tipo</label>
        <select id="sugTipo"><option value="folga">Folga</option><option value="ferias">Férias</option></select>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-brand" id="btnGerarSugestao">Gerar sugestões</button>
    </div>
  </div>
  ${resultsHtml}`;
}


function supProgramacao(myAnalistas){
  const list = uiState.progAnalista==='all' ? myAnalistas : myAnalistas.filter(a=>a.id===uiState.progAnalista);
  const renderFor = a => uiState.progView==='diaria' ? renderFlashcardRow(a.id, uiState.progDate)
    : uiState.progView==='semanal' ? renderAnalistaSemanal(a.id, uiState.progDate)
    : renderAnalistaMensal(a.id, uiState.progDate);
  return `
  <div class="filter-row">
    <select id="progAnalistaSel">
      <option value="all" ${uiState.progAnalista==='all'?'selected':''}>Todos os analistas</option>
      ${myAnalistas.map(a=>`<option value="${a.id}" ${uiState.progAnalista===a.id?'selected':''}>${a.name}</option>`).join('')}
    </select>
    <input type="date" id="progDateSel" value="${uiState.progDate}">
    <div class="toggle-group" data-scope="sup">
      <button data-view="diaria" class="${uiState.progView==='diaria'?'active':''}">Diária</button>
      <button data-view="semanal" class="${uiState.progView==='semanal'?'active':''}">Semanal</button>
      <button data-view="mensal" class="${uiState.progView==='mensal'?'active':''}">Mensal</button>
    </div>
  </div>
  ${ list.map(a=>`<div style="margin-bottom:22px;"><div class="section-title">${a.name}</div>${renderFor(a)}</div>`).join('')
    || '<div class="empty">Nenhum analista para exibir</div>' }`;
}


function supGrade(myAnalistas){
  const f = uiState.gradeFilters;
  const dateStr = f.data || todayISO();
  const ids = myAnalistas.map(a=>a.id);
  let rows = [];
  ids.forEach(id=>{
    const slots = getDaySlots(id, dateStr);
    slots.forEach(s=>{
      const status = computeStatus(s.horaInicio, dateStr, id, s.operacao, s.isOff);
      rows.push({analista:userById(id).name, op:s.operacao, hora:s.horaInicio, horaFim:s.horaFim, nome:s.responsavelNome, isSuplente:s.isSuplente, status});
    });
  });
  rows.sort((a,b)=> hourSortValue(a.hora)-hourSortValue(b.hora));
  const uniq = key => ['all', ...new Set(rows.map(r=>r[key]).filter(Boolean))];
  const filtered = rows.filter(r=>
    (f.hora==='all' || r.hora===f.hora) &&
    (f.analista==='all' || r.analista===f.analista) &&
    (f.op==='all' || r.op===f.op) &&
    (f.nome==='all' || r.nome===f.nome) &&
    (f.status==='all' || r.status===f.status)
  );
  const statusLabels = {wait:'A Iniciar', live:'Em Andamento', done:'Finalizada', atraso:'Atraso de Roteirização'};
  const select = (key, label, values) => `
    <select data-gradefilter="${key}">
      <option value="all">${label}: todos</option>
      ${values.filter(v=>v!=='all').map(v=>`<option value="${v}" ${f[key]===v?'selected':''}>${key==='status'?statusLabels[v]:v}</option>`).join('')}
    </select>`;
  return `
  <div class="filter-row">
    <input type="date" data-gradefilter="data" value="${dateStr}">
    ${select('hora','Horário', uniq('hora'))}
    ${select('analista','Analista', uniq('analista'))}
    ${select('op','Operação', uniq('op'))}
    ${select('nome','Responsável', uniq('nome'))}
    ${select('status','Status', ['all','wait','live','done','atraso'])}
  </div>
  <div class="card">
  <table><thead><tr><th>Horário</th><th>Analista</th><th>Operação</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
  ${filtered.map(r=>`<tr class="${r.isSuplente?'row-suplente':''}"><td class="mono">${r.hora}–${r.horaFim}</td><td>${r.analista}</td><td>${r.op}</td><td>${r.nome} ${r.isSuplente?'<span class="pill pill-suplente">🔁 Suplente</span>':''}</td><td>${statusPill(r.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum registro para os filtros selecionados</td></tr>'}
  </tbody></table></div>`;
}


function supReunioes(myAnalistas){
  const rows = DB.reunioes.filter(r=>r.supervisorId===session.userId).sort((a,b)=> (b.data+b.hora).localeCompare(a.data+a.hora));
  return `
  <div class="section-title">Reuniões</div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-brand" id="btnNovaReuniao">+ Nova reunião</button></div>
  <div class="card" style="margin-bottom:22px;">
  <table><thead><tr><th>Título</th><th>Tipo</th><th>Data</th><th>Hora</th><th>Participantes</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${r.titulo}</td><td>${r.tipo==='grupo'?'Grupo':'Individual'}</td><td class="mono">${r.data}</td><td class="mono">${r.hora}</td>
  <td>${r.tipo==='grupo' ? (r.analistaIds.length===0?'Toda a equipe':r.analistaIds.map(id=>userById(id)?.name).join(', ')) : (userById(r.analistaIds[0])?.name||'—')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhuma reunião agendada</td></tr>'}
  </tbody></table></div>`;
}


function supPlantao(){
  const rows = DB.plantoes.filter(p=>p.supervisorAusenteId===session.userId).sort((a,b)=>b.data.localeCompare(a.data));
  return `
  <div class="section-title">Plantão</div>
  <div class="help-text">Defina quem cobre sua ausência (Supervisor, Analista ou Coordenador) em uma data específica. A informação aparece para os analistas da sua equipe.</div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-brand" id="btnNovoPlantao">+ Definir plantão</button></div>
  <div class="card">
  <table><thead><tr><th>Data</th><th>Cargo do plantonista</th><th>Nome</th></tr></thead><tbody>
  ${rows.map(p=>`<tr><td class="mono">${p.data}</td><td>${p.coberturaRole}</td><td>${p.coberturaNome}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nenhum plantão definido</td></tr>'}
  </tbody></table></div>`;
}


function supMetricas(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const flt = uiState.metricasFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -7);
  const fim = flt.fim || todayISO();
  const noPeriodo = data => data>=inicio && data<=fim;

  const folgaPeriodo = new Set(DB.ausencias.filter(a=>ids.includes(a.analistaId) && noPeriodo(a.data)).map(a=>a.analistaId)).size;
  const diasFolgaPeriodo = DB.ausencias.filter(a=>ids.includes(a.analistaId) && noPeriodo(a.data)).length;
  const opsPeriodo = DB.baseMestra.filter(b=>ids.includes(b.analistaId) && rangesOverlap(b.dataInicio, addDaysISO(b.dataFim,1), inicio, addDaysISO(fim,1))).length;
  const ranking = ids.map(id=>({name:userById(id).name,
    count: DB.ausencias.filter(a=>a.suplenteId===id && noPeriodo(a.data)).length + DB.suplencias.filter(s=>s.suplente===userById(id).name && noPeriodo(s.dataCobertura)).length}))
    .sort((a,b)=>b.count-a.count);
  return `
  <div class="filter-row">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-metricasfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-metricasfiltro="fim" value="${fim}" min="${inicio}">
    </label>
  </div>
  <div class="grid-3" style="margin-bottom:20px;">
    <div class="stat-card"><div class="stat-num">${folgaPeriodo}</div><div class="stat-label">Analistas com folga no período</div></div>
    <div class="stat-card"><div class="stat-num">${diasFolgaPeriodo}</div><div class="stat-label">Dias de folga no período</div></div>
    <div class="stat-card"><div class="stat-num">${opsPeriodo}</div><div class="stat-label">Operações ativas no período</div></div>
  </div>
  <div class="card"><div class="section-title">Ranking de coberturas</div>
  <table><thead><tr><th>Analista</th><th>Coberturas</th></tr></thead><tbody>
  ${ranking.map(r=>`<tr><td>${r.name}</td><td class="mono">${r.count}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Sem dados</td></tr>'}
  </tbody></table></div>`;
}


function supTransmissao(myAnalistas){
  const flt = uiState.envioFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -30);
  const fim = flt.fim || todayISO();
  const dataOf = ts => new Date(ts).toISOString().slice(0,10);
  const noPeriodo = ts => { const d = dataOf(ts); return d>=inicio && d<=fim; };

  const recadosEnviados = DB.recados.filter(r=>r.from.includes(session.name) && noPeriodo(r.ts))
    .map(r=>({...r, __tipo:'comunicado'}));
  const lembretesEnviados = DB.lembretes.filter(l=>l.origem==='supervisor' && l.criadoPor===session.name && noPeriodo(l.ts))
    .map(l=>({...l, __tipo:'lembrete'}));
  const enviados = [...recadosEnviados, ...lembretesEnviados].sort((a,b)=>b.ts-a.ts);

  return `
  <div class="card" style="margin-bottom:18px;">
    <div class="section-title">Enviar lembrete (to-do)</div>
    <div class="grid-2" style="margin-bottom:10px;">
      <select id="lembreteAlvo"><option value="all">Toda a equipe</option>${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select>
      <input type="date" id="lembreteData" value="${todayISO()}">
      <select id="lembreteHora"><option value="">Sem hora</option>${HOURS.map(h=>`<option value="${h}">${h}</option>`).join('')}</select>
    </div>
    <input id="lembreteTitulo" placeholder="Título..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);margin-bottom:10px;">
    <input id="lembreteTxt" placeholder="Descreva o lembrete/to-do..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);margin-bottom:10px;">
    <textarea id="lembreteObs" rows="2" placeholder="Observações (detalhamento opcional)..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);margin-bottom:10px;"></textarea>
    <div style="display:flex;justify-content:flex-end;"><button class="btn btn-brand" id="btnEnviarLembrete">Enviar lembrete</button></div>
  </div>
  <div class="card" style="margin-bottom:18px;">
    <div class="section-title">Novo comunicado</div>
    <input id="transmTitulo" placeholder="Título..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);margin-bottom:10px;">
    <textarea id="transmMsg" rows="3" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;font-size:13.5px;margin-bottom:10px;" placeholder="Escreva a mensagem para sua equipe..."></textarea>
    <textarea id="transmObs" rows="2" placeholder="Observações (detalhamento opcional)..." style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;font-size:13.5px;"></textarea>
    <div style="display:flex;justify-content:flex-end;margin-top:10px;"><button class="btn btn-brand" id="btnEnviarRecado">Enviar para toda a equipe</button></div>
  </div>
  <div class="section-title">Enviados</div>
  <div class="filter-row">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-enviofiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-enviofiltro="fim" value="${fim}" min="${inicio}">
    </label>
  </div>
  <div class="card">
  ${enviados.length===0 ? '<div class="empty">Nada enviado no período selecionado.</div>' : enviados.map(item=>{
    if(item.__tipo==='comunicado'){
      const lidos = (item.lidoPor||[]).length;
      return `<div class="msg-item">
        <div class="msg-meta"><span class="pill">Comunicado</span> ${timeAgo(item.ts)}${item.editado?' · editado':''} · ${lidos} leitura(s) confirmada(s)</div>
        ${item.titulo ? `<div style="font-weight:700;font-size:14px;margin-top:6px;">${escapeHtml(item.titulo)}</div>` : ''}
        <div style="margin-top:4px;">${escapeHtml(item.texto)}</div>
        ${item.observacoes ? `<div style="font-size:12.5px;color:var(--text-faint);margin-top:6px;white-space:pre-wrap;">${escapeHtml(item.observacoes)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn" data-editar-recado="${item.id}">Editar</button>
          <button class="btn btn-danger" data-excluir-recado="${item.id}">Excluir</button>
        </div>
      </div>`;
    }
    const destinatario = item.target && item.target.startsWith('all_ana_') ? 'Toda a equipe' : (userById(item.target)?.name || '—');
    return `<div class="msg-item">
      <div class="msg-meta"><span class="pill pill-suplente">Lembrete</span> para ${destinatario} · ${timeAgo(item.ts)}${item.data?` · ${item.data}`:''}${item.hora?` ${item.hora}`:''}</div>
      ${item.titulo ? `<div style="font-weight:700;font-size:14px;margin-top:6px;">${escapeHtml(item.titulo)}</div>` : ''}
      <div style="margin-top:4px;">${escapeHtml(item.texto)}</div>
      ${item.observacoes ? `<div style="font-size:12.5px;color:var(--text-faint);margin-top:6px;white-space:pre-wrap;">${escapeHtml(item.observacoes)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn btn-danger" data-excluir-lembrete-enviado="${item.id}">Excluir</button>
      </div>
    </div>`;
  }).join('')}
  </div>`;
}


function supOcorrencias(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const f = uiState.ocorrenciasFiltro;
  const inicio = f.inicio || addDaysISO(todayISO(), -30);
  const fim = f.fim || todayISO();
  const operacoesTime = [...new Set(DB.baseMestra.filter(b=>ids.includes(b.analistaId)).map(b=>b.operacao))].sort();

  let rows = DB.raioX.filter(r=> ids.includes(r.analistaId)
    && (r.data||'')>=inicio && (r.data||'')<=fim
    && (f.analista==='all' || r.analistaId===f.analista)
    && (!f.operacao || f.operacao==='all' || r.operacao===f.operacao)
  ).sort((a,b)=>b.ts-a.ts);

  const porOperacao = {};
  rows.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = [];
    porOperacao[r.operacao].push(r.estrelas||0);
  });
  let ranking = Object.entries(porOperacao)
    .map(([op, vals])=>({ op, media: vals.reduce((a,b)=>a+b,0)/vals.length, n: vals.length }))
    .sort((a,b)=> a.media-b.media);

  // Filtro de "avaliação média" é por operação (não por finalização
  // individual): só entram no ranking e na lista as operações cuja média
  // no período está no teto escolhido — pensado pra achar rápido as
  // operações com pior desempenho.
  const avaliacaoMax = f.avaliacaoMax ? parseInt(f.avaliacaoMax,10) : null;
  if(avaliacaoMax){
    ranking = ranking.filter(r=> r.media<=avaliacaoMax);
    const opsAbaixo = new Set(ranking.map(r=>r.op));
    rows = rows.filter(r=> opsAbaixo.has(r.operacao));
  }

  return `
  <div class="filter-row">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-ocorrenciafiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-ocorrenciafiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <select data-ocorrenciafiltro="analista">
      <option value="all">Analista: todos</option>
      ${myAnalistas.map(a=>`<option value="${a.id}" ${f.analista===a.id?'selected':''}>${a.name}</option>`).join('')}
    </select>
    <select data-ocorrenciafiltro="operacao">
      <option value="all">Operação: todas</option>
      ${operacoesTime.map(op=>`<option value="${op}" ${f.operacao===op?'selected':''}>${op}</option>`).join('')}
    </select>
    <select data-ocorrenciafiltro="avaliacaoMax">
      <option value="">Avaliação média: todas</option>
      <option value="1" ${f.avaliacaoMax==='1'?'selected':''}>≤ 1 estrela</option>
      <option value="2" ${f.avaliacaoMax==='2'?'selected':''}>≤ 2 estrelas</option>
      <option value="3" ${f.avaliacaoMax==='3'?'selected':''}>≤ 3 estrelas</option>
      <option value="4" ${f.avaliacaoMax==='4'?'selected':''}>≤ 4 estrelas</option>
    </select>
  </div>
  <div class="card" style="margin-bottom:18px;"><div class="section-title">Avaliação média por operação (Raio-X)</div>
  <table><thead><tr><th>Operação</th><th>Avaliação média</th><th>Finalizações</th></tr></thead><tbody>
  ${ranking.map(r=>`<tr><td>${r.op}</td><td>${starDisplay(Math.round(r.media))} <span class="mono" style="color:var(--text-muted);">(${r.media.toFixed(1)})</span></td><td class="mono">${r.n}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sem finalizações no período selecionado</td></tr>'}
  </tbody></table></div>
  <div class="card">
  ${rows.map(r=>`<div class="msg-item">
    <div class="msg-meta">${userById(r.analistaId)?.name} · ${r.operacao} · ${r.data} ${r.hora} · ${timeAgo(r.ts)}</div>
    <div>${starDisplay(r.estrelas)}</div>
    <div style="margin-top:4px;">${escapeHtml(r.observacao||'')}</div>
  </div>`).join('') || '<div class="empty">Nenhuma finalização registrada no período selecionado</div>'}
  </div>`;
}

