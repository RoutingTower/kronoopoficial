/* Telas do papel Supervisor: cadastros, cobertura, eventos, métricas, caixa de envio, ocorrências. */

function renderSupervisor(){
  const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
  const tabLabel = NAV.supervisor.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='cadastros') content = supCadastros(myAnalistas);
  else if(activeNavKey==='basemestra') content = supBaseMestra(myAnalistas);
  else if(activeNavKey==='spr') content = supSPR();
  else if(activeNavKey==='resultadospr') content = supResultadoSPR(myAnalistas);
  else if(activeNavKey==='suplencias') content = renderImportPendentesBanner('suplencias', myAnalistas) + supSugerirSuplente(myAnalistas) + supSuplencias(myAnalistas);
  else if(activeNavKey==='programacao') content = supProgramacao(myAnalistas);
  else if(activeNavKey==='grade') content = supGrade(myAnalistas);
  else if(activeNavKey==='reunioes') content = supReunioes(myAnalistas) + supPlantao();
  else if(activeNavKey==='metricas') content = supMetricas(myAnalistas);
  else if(activeNavKey==='transmissao') content = supTransmissao(myAnalistas);
  else if(activeNavKey==='ocorrencias') content = supOcorrencias(myAnalistas);
  else if(activeNavKey==='feedbacks') content = supFeedbacks(myAnalistas);
  return `<div class="page-head"><div><h1 class="page-title">${tabLabel}</h1><div class="page-desc">Gestão da equipe de ${session.name}</div></div></div>${content}`;
}


// Banner no topo de Operações Fixas/Cobertura quando uma importação em
// massa (Excel) tem nomes que não bateram com ninguém da equipe (ver
// findAnalistaByName em utils.js e os handlers de fileImportMestra/
// fileImportSuplencia em events.js). Deixa o supervisor escolher o
// analista certo por linha (ou descartar) sem precisar refazer a
// planilha inteira.
function renderImportPendentesBanner(tipo, myAnalistas){
  const p = uiState.importPendentes;
  if(!p || p.tipo!==tipo || p.items.length===0) return '';

  const linhaBaseMestra = (it,idx) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <span style="flex:1;min-width:220px;font-size:13px;"><b>"${escapeHtml(it.nomeOriginal||'(vazio)')}"</b> — ${escapeHtml(it.operacao)} · ${it.horaInicio}–${it.horaFim}</span>
      <select data-pendente-idx="${idx}" style="min-width:220px;">
        <option value="">— Descartar linha —</option>
        ${myAnalistas.map(a=>`<option value="${a.id}" ${it.analistaId===a.id?'selected':''}>${a.name}</option>`).join('')}
      </select>
    </div>`;

  // Cobertura tem 2 nomes por linha (folgando + suplente), e cada um pode
  // ter falhado o match com findAnalistaByName() independente do outro.
  // O campo que já bateu automaticamente (acento/caixa/pontuação
  // diferentes não contam como nome diferente — ver normalizarNome em
  // utils.js) some da linha de resolução, só aparece como confirmação;
  // só mostra dropdown pro campo que realmente precisa de ajuda.
  const linhaSuplencia = (it,idx) => `
    <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <span style="flex:1;min-width:170px;font-size:13px;">${escapeHtml(it.operacao)} · ${it.horaInicio}–${it.horaFim} · <span class="mono">${it.dataCobertura}</span></span>
      <div style="display:flex;flex-direction:column;gap:3px;min-width:210px;">
        <span style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);">Folgando</span>
        ${it.analistaId ? `<span style="font-size:13px;">✓ ${escapeHtml(userById(it.analistaId)?.name||'')}</span>` : `
        <select data-pendente-idx="${idx}">
          <option value="">"${escapeHtml(it.nomeOriginalTitular||'(vazio)')}" — Descartar linha</option>
          ${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
        </select>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;min-width:210px;">
        <span style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);">Suplente</span>
        ${it.suplenteNome ? `<span style="font-size:13px;">✓ ${escapeHtml(it.suplenteNome)}</span>` : `
        <select data-pendente-sup-idx="${idx}">
          <option value="">"${escapeHtml(it.nomeOriginalSuplente||'(vazio)')}" — Descartar linha</option>
          ${myAnalistas.map(a=>`<option value="${a.name}">${a.name}</option>`).join('')}
        </select>`}
      </div>
    </div>`;

  return `
  <div class="card" style="margin-bottom:18px;border-color:var(--alert);">
    <div class="section-title" style="color:var(--alert);">⚠ ${p.items.length} linha(s) com nome não encontrado no cadastro</div>
    <div class="help-text">Essas linhas da planilha não bateram com nenhum analista da sua equipe (mesmo ignorando acentos, maiúsculas/minúsculas e pontuação). Selecione o analista certo pra cada uma, ou deixe em "Descartar" pra não importar a linha.</div>
    ${p.items.map((it,idx)=> tipo==='suplencias' ? linhaSuplencia(it,idx) : linhaBaseMestra(it,idx)).join('')}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn" id="btnDescartarPendentes">Descartar todos</button>
      <button class="btn btn-brand" id="btnAplicarPendentes">Aplicar e importar</button>
    </div>
  </div>`;
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
      <td style="cursor:pointer;" data-analista-timeline="${a.id}" title="Ver histórico">${a.name}</td><td class="mono" style="color:var(--text-muted);">${a.email}</td>
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
  ${renderImportPendentesBanner('basemestra', myAnalistas)}
  <div class="csv-row">
    <span class="csv-label">Carga em massa das operações do titular (Excel)</span>
    <button class="btn" id="btnBaixarModeloMestra">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportMestra" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovaMestra">+ Nova entrada</button>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>SPR</th><th>Horário</th><th>Dias</th><th>Titular</th><th>Vigência</th><th></th></tr></thead><tbody>
  ${rows.map(b=>`<tr><td>${b.operacao}</td><td>${b.ciclo}</td><td class="mono">${getSPR(session.userId, b.operacao, b.ciclo) ?? '—'}</td><td class="mono">${b.horaInicio}–${b.horaFim}</td><td class="jornada-tag">${diasBaseMestraLabel(b)}</td><td>${b.titular}</td><td class="mono" style="color:var(--text-muted);">${b.dataInicio} → ${b.dataFim}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-mestra="${b.id}">Editar</button> <button class="btn btn-danger" data-excluir-mestra="${b.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhuma operação fixa cadastrada</td></tr>'}
  </tbody></table></div>`;
}


function supSPR(){
  const rows = [...DB.sprs].filter(s=>s.supervisorId===session.userId).sort((a,b)=> a.operacao.localeCompare(b.operacao) || a.ciclo.localeCompare(b.ciclo));
  // Sugestões pro datalist do modal (Nova entrada/Editar) — operação e
  // ciclo já usados em Operações Fixas ou Cobertura, pra evitar erro de
  // digitação que faria o SPR não bater com nada (mesmo problema que já
  // resolvemos pro nome do suplente na importação de Cobertura).
  const opsConhecidas = [...new Set([...DB.baseMestra, ...DB.suplencias].map(b=>b.operacao))].sort();
  const ciclosConhecidos = [...new Set([...DB.baseMestra, ...DB.suplencias].map(b=>b.ciclo).filter(Boolean))].sort();
  return `
  <div class="help-text">Cadastre o SPR de cada Operação/Ciclo aqui — ele aparece automaticamente em Operações Fixas, Cobertura e na Programação do analista, sempre que a operação e o ciclo baterem.</div>
  <datalist id="sprOpList">${opsConhecidas.map(o=>`<option value="${escapeHtml(o)}">`).join('')}</datalist>
  <datalist id="sprCicloList">${ciclosConhecidos.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist>
  <div class="csv-row">
    <span class="csv-label">Carga em massa de SPR (Excel)</span>
    <button class="btn" id="btnBaixarModeloSpr">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportSpr" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovoSpr">+ Nova entrada SPR</button>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>SPR</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${escapeHtml(s.operacao)}</td><td>${escapeHtml(s.ciclo)}</td><td class="mono">${escapeHtml(String(s.spr))}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-spr="${s.id}">Editar</button> <button class="btn btn-danger" data-excluir-spr="${s.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum SPR cadastrado</td></tr>'}
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
    <select data-suplenciafiltro="cobrindo">
      <option value="all">Folgando: todos</option>
      ${myAnalistas.map(a=>`<option value="${a.id}" ${f.cobrindo===a.id?'selected':''}>${a.name}</option>`).join('')}
    </select>
    <select data-suplenciafiltro="suplente">
      <option value="all">Suplente: todos</option>
      ${suplentesUnicos.map(n=>`<option value="${n}" ${f.suplente===n?'selected':''}>${n}</option>`).join('')}
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
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>SPR</th><th>Horário</th><th>Folgando</th><th>Suplente</th><th>Data</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${s.operacao}</td><td>${s.ciclo||'—'}</td><td class="mono">${getSPR(session.userId, s.operacao, s.ciclo) ?? '—'}</td><td class="mono">${s.horaInicio}–${s.horaFim}</td><td>${userById(s.analistaOriginalId)?.name||'—'}</td><td>${s.suplente}</td><td class="mono">${s.dataCobertura}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-suplencia="${s.id}">Editar</button> <button class="btn btn-danger" data-excluir-suplencia="${s.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhuma cobertura avulsa registrada</td></tr>'}
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
  const dateStr = f.data || hojeAgendaISO();
  const ids = myAnalistas.map(a=>a.id);
  let rows = [];
  ids.forEach(id=>{
    const slots = getDaySlots(id, dateStr);
    slots.forEach(s=>{
      const status = computeStatus(s.horaInicio, dateStr, id, s.operacao, s.isOff);
      rows.push({chave:s.id, analistaId:id, analista:userById(id).name, op:s.operacao, hora:s.horaInicio, horaFim:s.horaFim, nome:s.responsavelNome, isCobertura:!!s.isCobertura, status});
    });
  });
  // Uma cobertura gera 2 entradas com o mesmo id em getDaySlots: uma na
  // agenda do titular (operação coberta, sempre "Finalizada" porque ele
  // não precisa fazer nada) e outra na agenda de quem está cobrindo (com
  // o status real, incluindo Pendente Raio-X). Mantém só a segunda — é a
  // que importa pro supervisor acompanhar.
  const porId = new Map();
  rows.forEach(r=>{ if(!porId.has(r.chave) || r.isCobertura) porId.set(r.chave, r); });
  rows = [...porId.values()];
  rows.sort((a,b)=> hourSortValue(a.hora)-hourSortValue(b.hora));
  const uniq = key => ['all', ...new Set(rows.map(r=>r[key]).filter(Boolean))];
  const filtered = rows.filter(r=>
    (f.hora==='all' || r.hora===f.hora) &&
    (f.analista==='all' || r.analista===f.analista) &&
    (f.op==='all' || r.op===f.op) &&
    (f.nome==='all' || r.nome===f.nome) &&
    (f.status==='all' || r.status===f.status)
  );
  const statusLabels = {wait:'A Iniciar', live:'Em Andamento', done:'Finalizada', atraso:'Pendente Raio-X'};
  const select = (key, label, values) => `
    <select data-gradefilter="${key}">
      <option value="all">${label}: todos</option>
      ${values.filter(v=>v!=='all').map(v=>`<option value="${v}" ${f[key]===v?'selected':''}>${key==='status'?statusLabels[v]:v}</option>`).join('')}
    </select>`;

  // Mesmo alerta proativo + semáforo de risco do Dashboard Global do
  // coordenador (analistasEmRisco, em render-coordenador.js), só que
  // escopado à própria equipe — aqui é o equivalente do supervisor pra
  // essa visão executiva.
  const atrasoHoje = dateStr===hojeAgendaISO() ? filtered.filter(r=>r.status==='atraso').length : 0;
  const risco = analistasEmRisco(myAnalistas);
  gradeExportRows = filtered;

  return `
  <div class="filter-row">
    <input type="date" data-gradefilter="data" value="${dateStr}">
    ${select('hora','Horário', uniq('hora'))}
    ${select('analista','Analista', uniq('analista'))}
    ${select('op','Operação', uniq('op'))}
    ${select('nome','Responsável', uniq('nome'))}
    ${select('status','Status', ['all','wait','live','done','atraso'])}
    <button class="btn" id="btnExportGrade">⬇ Exportar Excel</button>
  </div>
  <div class="card" style="margin-bottom:${(atrasoHoje>0||risco.length>0)?'16px':'0'};">
  <table><thead><tr><th>Horário</th><th>Analista</th><th>Operação</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
  ${filtered.map(r=>`<tr class="${r.isCobertura?'row-suplente':''}"><td class="mono">${r.hora}–${r.horaFim}</td><td style="cursor:pointer;" data-analista-timeline="${r.analistaId}" title="Ver histórico">${r.analista} ${r.isCobertura?'<span class="pill pill-suplente">🔁 Suplente</span>':''}</td><td>${r.op}</td><td>${r.nome}</td><td>${statusPill(r.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum registro para os filtros selecionados</td></tr>'}
  </tbody></table></div>
  ${atrasoHoje>0 ? `<div class="highlight-card" style="margin-bottom:14px;border-color:var(--alert);">
    <div class="section-title">🚨 ${atrasoHoje} operação(ões) de hoje com Raio-X pendente há mais de 1h</div>
  </div>` : ''}
  ${risco.length>0 ? `<div class="card">
    <div class="section-title">🟡 Analistas em risco (últimos 7 dias)</div>
    ${risco.map(r=>`<div class="msg-item" style="cursor:pointer;" data-analista-timeline="${r.id}">
      <div class="msg-meta">${escapeHtml(r.name)}</div>
      <div class="chip-row" style="margin-top:4px;">${r.motivos.map(m=>`<span class="chip-pessoa">${escapeHtml(m)}</span>`).join('')}</div>
    </div>`).join('')}
  </div>` : ''}`;
}

let gradeExportRows = [];
function exportarGrade(){
  const linhas = gradeExportRows.map(r=>[r.hora, r.analista, r.op, r.nome, r.isCobertura?'Suplente':'Titular', {wait:'A Iniciar',live:'Em Andamento',done:'Finalizada',atraso:'Pendente Raio-X'}[r.status]||r.status]);
  exportarRelatorioExcel(`grade-do-dia_${uiState.gradeFilters.data||hojeAgendaISO()}.xlsx`, ['Hora Início','Analista','Operação','Responsável','Tipo','Status'], linhas);
}


function supReunioes(myAnalistas){
  const rows = DB.reunioes.filter(r=>r.supervisorId===session.userId).sort((a,b)=> (b.data+b.hora).localeCompare(a.data+a.hora));
  return `
  <div class="section-title">Reuniões</div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-brand" id="btnNovaReuniao">+ Nova reunião</button></div>
  <div class="card" style="margin-bottom:22px;">
  <table><thead><tr><th>Título</th><th>Tipo</th><th>Data</th><th>Hora</th><th>Participantes</th><th>Link</th><th></th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${escapeHtml(r.titulo)}</td><td>${r.tipo==='grupo'?'Grupo':'Individual'}</td><td class="mono">${r.data}</td><td class="mono">${r.hora}</td>
  <td>${r.tipo==='grupo' ? (r.analistaIds.length===0?'Toda a equipe':r.analistaIds.map(id=>userById(id)?.name).join(', ')) : (userById(r.analistaIds[0])?.name||'—')}</td>
  <td>${r.link ? `<a class="btn" href="${escapeHtml(r.link)}" target="_blank" rel="noopener noreferrer">Abrir link</a>` : '—'}</td>
  <td style="text-align:right;white-space:nowrap;">
    <button class="btn" data-editar-reuniao="${r.id}">Editar</button>
    <button class="btn btn-danger" data-excluir-reuniao="${r.id}">Excluir</button>
  </td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhuma reunião agendada</td></tr>'}
  </tbody></table></div>`;
}


function supPlantao(){
  const rows = DB.plantoes.filter(p=>p.supervisorAusenteId===session.userId).sort((a,b)=>b.data.localeCompare(a.data));
  return `
  <div class="section-title">Plantão</div>
  <div class="help-text">Defina quem cobre sua ausência (Supervisor, Analista ou Coordenador) em uma data específica. A informação aparece para os analistas da sua equipe.</div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-brand" id="btnNovoPlantao">+ Definir plantão</button></div>
  <div class="card">
  <table><thead><tr><th>Data</th><th>Cargo do plantonista</th><th>Nome</th><th></th></tr></thead><tbody>
  ${rows.map(p=>`<tr><td class="mono">${p.data}</td><td>${p.coberturaRole}</td><td>${p.coberturaNome}</td>
  <td style="text-align:right;white-space:nowrap;">
    <button class="btn" data-editar-plantao="${p.id}">Editar</button>
    <button class="btn btn-danger" data-excluir-plantao="${p.id}">Excluir</button>
  </td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum plantão definido</td></tr>'}
  </tbody></table></div>`;
}


// Feedbacks de melhoria enviados pelos analistas da própria equipe — cada
// supervisor só vê (e exclui) os da equipe dele (ver
// backend/src/controllers/feedbacks.controller.js, deleteFeedback exige
// ser o supervisor do analista que enviou). O analista só tem a tela de
// envio (ver renderFeedbackAnalista em render-analista.js).
function supFeedbacks(myAnalistas){
  const meusIds = new Set(myAnalistas.map(a=>a.id));
  const items = DB.feedbacks.filter(f=>meusIds.has(f.analistaId)).sort((a,b)=>b.ts-a.ts);
  return `
  <div class="card">
  ${items.length===0 ? '<div class="empty">Nenhum feedback recebido ainda.</div>' : items.map(f=>`<div class="msg-item">
    <div class="msg-meta">${escapeHtml(f.analistaNome||userById(f.analistaId)?.name||'—')} · ${timeAgo(f.ts)}</div>
    <div style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(f.texto)}</div>
    <div style="margin-top:8px;"><button class="btn btn-danger" data-excluir-feedback="${f.id}">Excluir</button></div>
  </div>`).join('')}
  </div>`;
}


// Guarda os dados já calculados da última renderização pra
// renderMetricasCharts() (events.js) desenhar os gráficos sem recalcular
// tudo de novo — chamado logo depois do innerHTML ser trocado (mesmo
// padrão de updateNavBadges()).
let metricasChartData = null;

// Núcleo do cálculo/render de Métricas, compartilhado entre supervisor
// (supMetricas, filtra a própria equipe por analista) e coordenador
// (coordMetricas em render-coordenador.js, filtra toda a operação por
// supervisor — expande pra equipe de cada um selecionado). `picker` é o
// dropdown de seleção, específico de cada tela; `notaSingular` aparece
// junto do número de folgas quando a seleção resultante é só 1
// pessoa/equipe (ex.: " (analista selecionado)"), pra dar contexto.
function metricasBody(selecionados, picker, notaSingular){
  const flt = uiState.metricasFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -7);
  const fim = flt.fim || todayISO();
  const noPeriodo = data => data>=inicio && data<=fim;

  const ids = selecionados.map(a=>a.id);
  const nomesSelecionados = new Set(selecionados.map(a=>a.name));

  // Status por analista (donut/tabela): "folga" só se o período INTEIRO for
  // folga, nenhuma operação fixa própria nem cobertura de outra pessoa (ver
  // classificarAnalistaNoPeriodo em utils.js) — útil pra achar quem está
  // 100% fora agora. É essa mesma classificação que alimenta o destaque
  // "Em folga/ausentes" quando o período é curto (até 2 dias).
  const classificacao = selecionados.map(a=>({id:a.id, name:a.name, status: classificarAnalistaNoPeriodo(a.id, inicio, fim)}));
  const emFolga = classificacao.filter(c=>c.status==='folga');
  const ativos = classificacao.filter(c=>c.status==='ativo');
  const semDados = classificacao.filter(c=>c.status==='sem-dados');

  const spanDias = Math.round((new Date(fim+'T00:00:00') - new Date(inicio+'T00:00:00'))/86400000) + 1;
  const periodoCurto = spanDias <= 2;

  // Em período longo, "folga o período inteiro" quase sempre dá 0 mesmo
  // com folgas normais no meio — por isso, além da classificação acima,
  // contamos dia a dia (mesma lógica, aplicada a cada dia isolado) quantos
  // dias de folga cada analista teve no período. Filtrando 1 analista, dá
  // quantas folgas ELE teve; filtrando todos, dá o total do time.
  let diasFolgaQtd = 0;
  const idsComFolgaAlgumDia = new Set();
  selecionados.forEach(a=>{
    for(let d=inicio; d<=fim; d=addDaysISO(d,1)){
      if(classificarAnalistaNoPeriodo(a.id, d, d)==='folga'){
        diasFolgaQtd++;
        idsComFolgaAlgumDia.add(a.id);
      }
    }
  });

  const opsPeriodo = DB.baseMestra.filter(b=>ids.includes(b.analistaId) && rangesOverlap(b.dataInicio, addDaysISO(b.dataFim,1), inicio, addDaysISO(fim,1))).length;
  const ranking = selecionados.map(a=>({name:a.name,
    count: DB.ausencias.filter(x=>x.suplenteId===a.id && noPeriodo(x.data)).length + DB.suplencias.filter(s=>s.suplente===a.name && noPeriodo(s.dataCobertura)).length}))
    .sort((a,b)=>b.count-a.count);
  const totalCoberturas = ranking.reduce((sum,r)=>sum+r.count,0);

  const porDia = [];
  for(let d=inicio; d<=fim; d=addDaysISO(d,1)){
    const count = DB.ausencias.filter(x=>ids.includes(x.suplenteId) && x.data===d).length
      + DB.suplencias.filter(s=>nomesSelecionados.has(s.suplente) && s.dataCobertura===d).length;
    porDia.push({data:d, count});
  }

  metricasChartData = {
    status:{ ativos: ativos.length, folga: emFolga.length, semDados: semDados.length },
    ranking: ranking.slice(0, 10),
    porDia,
  };

  const statusPill = c => c.status==='ativo' ? '<span class="pill pill-done">Ativo</span>'
    : c.status==='folga' ? `<span class="pill" style="background:rgba(184,134,11,0.14);color:var(--folga);">Em Folga</span>`
    : '<span class="pill pill-off">Sem registro</span>';

  metricasExportAnalistas = selecionados;
  return `
  <div class="filter-row">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-metricasfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-metricasfiltro="fim" value="${fim}" min="${inicio}">
    </label>
    ${picker}
    <button class="btn" id="btnExportMetricas">⬇ Exportar Excel</button>
  </div>
  <div class="grid-4" style="margin-bottom:20px;">
    <div class="stat-card"><div class="stat-num">${ativos.length}</div><div class="stat-label">Analistas ativos no período</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--folga);">${periodoCurto ? emFolga.length : diasFolgaQtd}</div><div class="stat-label">${periodoCurto ? 'Analistas em folga/ausentes' : 'Folgas/férias no período'}${notaSingular||''}</div></div>
    <div class="stat-card"><div class="stat-num">${totalCoberturas}</div><div class="stat-label">Coberturas no período</div></div>
    <div class="stat-card"><div class="stat-num">${opsPeriodo}</div><div class="stat-label">Operações ativas no período</div></div>
  </div>
  ${(periodoCurto ? emFolga.length>0 : diasFolgaQtd>0) ? `
  <div class="highlight-card">
    ${periodoCurto ? `
    <div class="section-title">🟡 Em folga / ausentes no período (${emFolga.length})</div>
    <div class="chip-row">${emFolga.map(c=>`<span class="chip-pessoa">${escapeHtml(c.name)}</span>`).join('')}</div>
    ` : `
    <div class="section-title">🟡 ${diasFolgaQtd} folga(s)/férias registrada(s) no período, entre ${idsComFolgaAlgumDia.size} analista(s)</div>
    <div class="help-text" style="margin:0;">Período maior que 2 dias — mostrando só a quantidade. Reduza pra até 2 dias pra ver os nomes.</div>
    `}
  </div>` : ''}
  <div class="grid-3" style="margin-bottom:20px;align-items:start;">
    <div class="chart-card"><div class="section-title">Status do time</div><canvas id="chartStatus"></canvas></div>
    <div class="chart-card"><div class="section-title">Coberturas por analista</div><canvas id="chartCoberturasAnalista"></canvas></div>
    <div class="chart-card"><div class="section-title">Coberturas ao longo do tempo</div><canvas id="chartCoberturasTempo"></canvas></div>
  </div>
  <div class="card">
  <div class="section-title">Detalhamento por analista</div>
  <table><thead><tr><th>Analista</th><th>Status</th><th>Coberturas</th></tr></thead><tbody>
  ${classificacao.map(c=>{
    const cob = ranking.find(r=>r.name===c.name)?.count || 0;
    return `<tr><td>${escapeHtml(c.name)}</td><td>${statusPill(c)}</td><td class="mono">${cob}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="empty">Sem dados</td></tr>'}
  </tbody></table></div>` + coberturaHeatmap(selecionados);
}

function analistaPicker(myAnalistas){
  const flt = uiState.metricasFiltro;
  return `<div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnMetricasAnalistaToggle">
        <span>${flt.analistas.length===0 ? 'Todos os analistas' : `${flt.analistas.length} analista(s) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.metricasAnalistaDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="metricasAnalistaTodos" ${flt.analistas.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${myAnalistas.map(a=>`<label><input type="checkbox" class="metricasAnalistaChk" value="${a.id}" ${flt.analistas.includes(a.id)?'checked':''}> ${escapeHtml(a.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum analista cadastrado</div>'}
      </div>` : ''}
    </div>`;
}

function supMetricas(myAnalistas){
  const flt = uiState.metricasFiltro;
  const selecionados = flt.analistas.length ? myAnalistas.filter(a=>flt.analistas.includes(a.id)) : myAnalistas;
  return metricasBody(selecionados, analistaPicker(myAnalistas), flt.analistas.length===1 ? ' (analista selecionado)' : '');
}

// Chamado de novo a cada renderMain() (ver ui.js) — os canvases são
// recriados do zero em todo render (main.innerHTML=...), então as
// instâncias antigas do Chart.js precisam ser destruídas antes de criar
// as novas, senão ele reclama de "Canvas is already in use". Não faz
// nada fora da tela de Métricas (os elementos simplesmente não existem).
let metricasChartInstances = {};
function renderMetricasCharts(){
  Object.values(metricasChartInstances).forEach(c=>c.destroy());
  metricasChartInstances = {};
  const elStatus = document.getElementById('chartStatus');
  if(!elStatus || !metricasChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  metricasChartInstances.status = new Chart(elStatus, {
    type:'doughnut',
    data:{ labels:['Ativos','Em Folga','Sem registro'],
      datasets:[{ data:[metricasChartData.status.ativos, metricasChartData.status.folga, metricasChartData.status.semDados],
        backgroundColor:['#2FAE60','#B8860B','#A8A8A8'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } } }
  });

  const elRank = document.getElementById('chartCoberturasAnalista');
  if(elRank){
    metricasChartInstances.coberturasAnalista = new Chart(elRank, {
      type:'bar',
      data:{ labels: metricasChartData.ranking.map(r=>r.name), datasets:[{ label:'Coberturas', data: metricasChartData.ranking.map(r=>r.count), backgroundColor:'#EE4D2D', borderRadius:4 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:false, maxRotation:60, minRotation:0 }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, precision:0 }, grid:{ color:gridColor } } } }
    });
  }

  const elTempo = document.getElementById('chartCoberturasTempo');
  if(elTempo){
    metricasChartInstances.coberturasTempo = new Chart(elTempo, {
      type:'line',
      data:{ labels: metricasChartData.porDia.map(p=>p.data.slice(5)),
        datasets:[{ label:'Coberturas', data: metricasChartData.porDia.map(p=>p.count), borderColor:'#2F80ED', backgroundColor:'rgba(47,128,237,0.15)', fill:true, tension:0.3 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, precision:0 }, grid:{ color:gridColor } } } }
    });
  }
}


// ===== Resultado SPR =====
// Compara sprRoteirizado (real, informado ao finalizar o Raio-X) com
// sprMeta (a meta vigente NO MOMENTO da finalização, congelada — ver
// backend/src/controllers/raioX.controller.js e a tela de finalização em
// events.js) — assim a meta muda de dono no dia que muda o cadastro de
// SPR, sem reescrever histórico. Convenção assumida (ninguém confirmou
// ainda): SPR roteirizado >= meta é "bateu a meta" — se for ao contrário
// nessa operação (SPR menor = melhor), inverter essa comparação aqui e em
// sprResultadoBody().
function bateuMetaSPR(r){ return r.sprRoteirizado >= r.sprMeta; }

let sprChartData = null;
let sprExportRows = [];

// Núcleo compartilhado entre supResultadoSPR (filtra por analista) e
// coordResultadoSPR (filtra por supervisor, em render-coordenador.js) —
// mesmo padrão de metricasBody/coberturaHeatmap acima.
function sprResultadoBody(selecionados, picker){
  const flt = uiState.sprFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -30);
  const fim = flt.fim || todayISO();
  const ids = new Set(selecionados.map(a=>a.id));
  const noPeriodo = r => (r.data||'')>=inicio && (r.data||'')<=fim && ids.has(r.analistaId);

  const doPeriodoAmplo = DB.raioX.filter(noPeriodo).filter(r=> flt.operacao==='all' || r.operacao===flt.operacao);
  const operacoesDisponiveis = [...new Set(DB.raioX.filter(noPeriodo).map(r=>r.operacao))].sort();

  // Linha do tempo semanal (segunda a domingo) usa SEMPRE o período
  // inteiro (início/fim), mesmo com uma semana específica selecionada no
  // filtro abaixo — senão a linha do tempo colapsaria pra 1 ponto só toda
  // vez que alguém filtrasse por semana.
  const semanasDisponiveis = [...new Set(doPeriodoAmplo.map(r=>weekStartISO(r.data)))].sort();
  const porSemana = {};
  doPeriodoAmplo.filter(r=>r.sprMeta!=null).forEach(r=>{
    const ws = weekStartISO(r.data);
    if(!porSemana[ws]) porSemana[ws] = { total:0, bateram:0 };
    porSemana[ws].total++;
    if(bateuMetaSPR(r)) porSemana[ws].bateram++;
  });
  const semanas = Object.entries(porSemana).map(([ws,d])=>({
    semana: ws,
    label: `${formatarDataCurta(ws)}–${formatarDataCurta(addDaysISO(ws,6))}`,
    pct: d.total ? Math.round((d.bateram/d.total)*100) : 0,
  })).sort((a,b)=>a.semana.localeCompare(b.semana));

  // Filtro de semana específica (opcional) — só restringe o resto da
  // tela (stats, tabela, gráficos por hub), não a linha do tempo acima.
  const doPeriodo = flt.semana ? doPeriodoAmplo.filter(r=>weekStartISO(r.data)===flt.semana) : doPeriodoAmplo;

  const comMeta = doPeriodo.filter(r=>r.sprMeta!=null);
  const semMeta = doPeriodo.length - comMeta.length;
  const bateram = comMeta.filter(bateuMetaSPR);
  const abaixo = comMeta.filter(r=>!bateuMetaSPR(r));

  // Detalhamento por Operação (hub) + Analista que roteirizou — uma linha
  // por combinação, agrupada/ordenada por operação. As médias (SPR
  // cadastrado/lançado) cobrem o caso de o mesmo par operação+analista ter
  // mais de uma finalização no período.
  const porOperacaoAnalista = {};
  comMeta.forEach(r=>{
    const nome = userById(r.analistaId)?.name || '—';
    const chave = r.operacao+'||'+nome;
    if(!porOperacaoAnalista[chave]) porOperacaoAnalista[chave] = { operacao:r.operacao, nome, analistaId:r.analistaId, total:0, bateram:0, deltaSoma:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porOperacaoAnalista[chave];
    d.total++;
    if(bateuMetaSPR(r)) d.bateram++;
    d.deltaSoma += (r.sprRoteirizado - r.sprMeta);
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const detalhe = Object.values(porOperacaoAnalista).map(d=>({
    operacao:d.operacao, nome:d.nome, analistaId:d.analistaId, total:d.total, bateram:d.bateram, abaixo:d.total-d.bateram,
    pct: d.total ? Math.round((d.bateram/d.total)*100) : 0,
    deltaMedio: d.total ? d.deltaSoma/d.total : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=> a.operacao.localeCompare(b.operacao) || a.nome.localeCompare(b.nome));

  // Agregado por Operação (todos os analistas juntos) — alimenta os 3
  // gráficos por hub abaixo.
  const porOperacao = {};
  comMeta.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = { total:0, bateram:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porOperacao[r.operacao];
    d.total++;
    if(bateuMetaSPR(r)) d.bateram++;
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const porHub = Object.entries(porOperacao).map(([operacao,d])=>({
    operacao, total:d.total, bateram:d.bateram,
    pct: d.total ? Math.round((d.bateram/d.total)*100) : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=>a.operacao.localeCompare(b.operacao));

  const ofensoresHub = [...porHub].sort((a,b)=>a.pct-b.pct).slice(0,5);

  sprChartData = {
    status: { bateram: bateram.length, abaixo: abaixo.length, semMeta },
    porHub,
    ofensoresHub: [...porHub].sort((a,b)=>a.pct-b.pct).slice(0,10).reverse(),
    semanas,
  };
  sprExportRows = comMeta;

  return `
  <div class="filter-row" style="margin-bottom:16px;">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-sprfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-sprfiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <select data-sprfiltro="operacao">
      <option value="all">Operação: todas</option>
      ${operacoesDisponiveis.map(op=>`<option value="${op}" ${flt.operacao===op?'selected':''}>${op}</option>`).join('')}
    </select>
    <select data-sprfiltro="semana">
      <option value="">Semana: todas (${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)})</option>
      ${semanasDisponiveis.map(ws=>`<option value="${ws}" ${flt.semana===ws?'selected':''}>Semana ${formatarDataCurta(ws)}–${formatarDataCurta(addDaysISO(ws,6))}</option>`).join('')}
    </select>
    ${picker}
    <button class="btn" id="btnExportSPR">⬇ Exportar Excel</button>
  </div>
  <div class="grid-3" style="margin-bottom:16px;">
    <div class="stat-card"><div class="stat-num" style="color:var(--done);">${bateram.length}</div><div class="stat-label">Bateram a meta</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--alert);">${abaixo.length}</div><div class="stat-label">Abaixo da meta</div></div>
    <div class="stat-card"><div class="stat-num">${comMeta.length ? Math.round((bateram.length/comMeta.length)*100) : 0}%</div><div class="stat-label">Taxa de meta batida</div></div>
  </div>
  ${ofensoresHub.length>0 ? `<div class="highlight-card" style="margin-bottom:16px;border-color:var(--alert);">
    <div class="section-title">🚨 Hubs em destaque (mais abaixo da meta)</div>
    <div class="chip-row">${ofensoresHub.map(o=>`<span class="chip-pessoa">${escapeHtml(o.operacao)} — ${o.pct}% na meta</span>`).join('')}</div>
  </div>` : ''}
  <div class="grid-2" style="margin-bottom:20px;align-items:start;">
    <div class="chart-card"><div class="section-title">Resultado geral</div><canvas id="chartSprStatus"></canvas></div>
    <div class="chart-card"><div class="section-title">Linha do tempo — % na meta por semana (seg. a dom.)</div><canvas id="chartSprSemanas"></canvas></div>
    <div class="chart-card"><div class="section-title">Média de SPR por hub (lançado x REF)</div><canvas id="chartSprMedia"></canvas></div>
    <div class="chart-card"><div class="section-title">Maiores ofensores (hubs)</div><canvas id="chartSprOfensores"></canvas></div>
  </div>
  <div class="card">
  <div class="section-title">Detalhamento por operação</div>
  <table><thead><tr><th>Operação</th><th>Analista</th><th>SPR REF</th><th>SPR Lançado</th><th>% meta</th><th>Delta médio</th></tr></thead><tbody>
  ${detalhe.map(d=>`<tr><td>${escapeHtml(d.operacao)}</td><td style="cursor:pointer;" data-analista-timeline="${d.analistaId}" title="Ver histórico">${escapeHtml(d.nome)}</td><td class="mono">${d.metaMedio.toFixed(1)}</td><td class="mono">${d.roteirizadoMedio.toFixed(1)}</td><td class="mono">${d.pct}%</td><td class="mono" style="color:${d.deltaMedio>=0?'var(--done)':'var(--alert)'};">${d.deltaMedio>=0?'+':''}${d.deltaMedio.toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem finalizações com meta cadastrada no período</td></tr>'}
  </tbody></table>
  ${semMeta>0 ? `<div class="help-text" style="margin-top:10px;">${semMeta} finalização(ões) no período sem meta SPR cadastrada pra operação/ciclo — não entram nesse cálculo.</div>` : ''}
  </div>`;
}

function exportarSPR(){
  const linhas = sprExportRows.map(r=>[userById(r.analistaId)?.name||'—', r.operacao, r.data, r.hora, r.sprRoteirizado, r.sprMeta, bateuMetaSPR(r)?'Sim':'Não']);
  exportarRelatorioExcel(`resultado-spr_${uiState.sprFiltro.inicio}_a_${uiState.sprFiltro.fim}.xlsx`, ['Analista','Operação','Data','Hora','SPR Lançado','SPR REF','Bateu a meta'], linhas);
}

// Mesmo padrão de renderMetricasCharts() — destrói as instâncias antigas e
// não faz nada fora da tela de Resultado SPR.
let sprChartInstances = {};
function renderSPRCharts(){
  Object.values(sprChartInstances).forEach(c=>c.destroy());
  sprChartInstances = {};
  const elStatus = document.getElementById('chartSprStatus');
  if(!elStatus || !sprChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  sprChartInstances.status = new Chart(elStatus, {
    type:'doughnut',
    data:{ labels:['Bateram a meta','Abaixo da meta','Sem meta cadastrada'],
      datasets:[{ data:[sprChartData.status.bateram, sprChartData.status.abaixo, sprChartData.status.semDados||sprChartData.status.semMeta],
        backgroundColor:['#2FAE60','#EE4D2D','#A8A8A8'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } } }
  });

  // Linha do tempo semanal — % na meta por semana (segunda a domingo),
  // sempre no período inteiro (início/fim), independente do filtro de
  // semana específica (ver sprResultadoBody).
  const elSemanas = document.getElementById('chartSprSemanas');
  if(elSemanas){
    sprChartInstances.semanas = new Chart(elSemanas, {
      type:'line',
      data:{ labels: sprChartData.semanas.map(s=>s.label), datasets:[{ label:'% na meta', data: sprChartData.semanas.map(s=>s.pct), borderColor:'#2F80ED', backgroundColor:'rgba(47,128,237,0.15)', fill:true, tension:0.3 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ min:0, max:100, ticks:{ color:textColor }, grid:{ color:gridColor } } } }
    });
  }

  // Média de SPR por hub — lançado (real) x meta (cadastrado), lado a
  // lado, pra ver de cara onde o real está descolando do alvo.
  const elMedia = document.getElementById('chartSprMedia');
  if(elMedia){
    sprChartInstances.media = new Chart(elMedia, {
      type:'bar',
      data:{ labels: sprChartData.porHub.map(h=>h.operacao),
        datasets:[
          { label:'SPR Lançado', data: sprChartData.porHub.map(h=>h.roteirizadoMedio), backgroundColor:'#2F80ED', borderRadius:4 },
          { label:'SPR REF', data: sprChartData.porHub.map(h=>h.metaMedio), backgroundColor:'#A8A8A8', borderRadius:4 },
        ] },
      options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:false, maxRotation:60, minRotation:0 }, grid:{ display:false } },
        y:{ ticks:{ color:textColor }, grid:{ color:gridColor } } } }
    });
  }

  const elOf = document.getElementById('chartSprOfensores');
  if(elOf){
    sprChartInstances.ofensores = new Chart(elOf, {
      type:'bar',
      data:{ labels: sprChartData.ofensoresHub.map(h=>h.operacao), datasets:[{ label:'% na meta', data: sprChartData.ofensoresHub.map(h=>h.pct), backgroundColor:'#EE4D2D', borderRadius:4 }] },
      options:{ plugins:{ legend:{ display:false } }, indexAxis:'y', scales:{
        x:{ min:0, max:100, ticks:{ color:textColor }, grid:{ color:gridColor } },
        y:{ ticks:{ color:textColor, autoSkip:false } } } }
    });
  }
}

function sprAnalistaPicker(myAnalistas){
  const flt = uiState.sprFiltro;
  return `<div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnSprAnalistaToggle">
        <span>${flt.analistas.length===0 ? 'Todos os analistas' : `${flt.analistas.length} analista(s) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.sprAnalistaDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="sprAnalistaTodos" ${flt.analistas.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${myAnalistas.map(a=>`<label><input type="checkbox" class="sprAnalistaChk" value="${a.id}" ${flt.analistas.includes(a.id)?'checked':''}> ${escapeHtml(a.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum analista cadastrado</div>'}
      </div>` : ''}
    </div>`;
}

function supResultadoSPR(myAnalistas){
  const flt = uiState.sprFiltro;
  const selecionados = flt.analistas.length ? myAnalistas.filter(a=>flt.analistas.includes(a.id)) : myAnalistas;
  return sprResultadoBody(selecionados, sprAnalistaPicker(myAnalistas));
}


function supTransmissao(myAnalistas){
  const flt = uiState.envioFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -30);
  const fim = flt.fim || todayISO();
  const dataOf = ts => dateToISO(new Date(ts));
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


// Mesmo padrão de metricasChartData — ver renderMetricasCharts() acima.
let ocorrenciasChartData = null;
let ocorrenciasExportRows = [];
function exportarOcorrencias(){
  const linhas = ocorrenciasExportRows.map(r=>[userById(r.analistaId)?.name||'—', r.operacao, r.data, r.hora, r.estrelas, r.observacao||'']);
  exportarRelatorioExcel(`ocorrencias_${uiState.ocorrenciasFiltro.inicio}_a_${uiState.ocorrenciasFiltro.fim}.xlsx`, ['Analista','Operação','Data','Hora','Estrelas','Observação'], linhas);
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

  const distribuicaoEstrelas = [1,2,3,4,5].map(n=>rows.filter(r=>(r.estrelas||0)===n).length);
  ocorrenciasChartData = { ranking: ranking.slice(0,10), distribuicaoEstrelas };
  ocorrenciasExportRows = rows;

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
    <button class="btn" id="btnExportOcorrencias">⬇ Exportar Excel</button>
  </div>
  <div class="grid-2" style="margin-bottom:18px;align-items:start;">
    <div class="chart-card"><div class="section-title">Distribuição de avaliações</div><canvas id="chartEstrelas"></canvas></div>
    <div class="chart-card"><div class="section-title">Avaliação média por operação</div><canvas id="chartAvaliacaoOperacao"></canvas></div>
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

// Mesmo padrão de renderMetricasCharts() — destrói as instâncias antigas
// (canvas recriado do zero a cada render) e não faz nada fora da tela de
// Ocorrências.
let ocorrenciasChartInstances = {};
function renderOcorrenciasCharts(){
  Object.values(ocorrenciasChartInstances).forEach(c=>c.destroy());
  ocorrenciasChartInstances = {};
  const elEstrelas = document.getElementById('chartEstrelas');
  if(!elEstrelas || !ocorrenciasChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  ocorrenciasChartInstances.estrelas = new Chart(elEstrelas, {
    type:'doughnut',
    data:{ labels:['1★','2★','3★','4★','5★'], datasets:[{ data: ocorrenciasChartData.distribuicaoEstrelas,
      backgroundColor:['#D9362E','#EE4D2D','#B8860B','#7FB069','#2FAE60'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } } }
  });

  const elOp = document.getElementById('chartAvaliacaoOperacao');
  if(elOp){
    ocorrenciasChartInstances.avaliacaoOperacao = new Chart(elOp, {
      type:'bar',
      data:{ labels: ocorrenciasChartData.ranking.map(r=>r.op),
        datasets:[{ label:'Avaliação média', data: ocorrenciasChartData.ranking.map(r=>Number(r.media.toFixed(2))),
          backgroundColor: ocorrenciasChartData.ranking.map(r=> r.media<=2 ? '#D9362E' : r.media<=3.5 ? '#B8860B' : '#2FAE60'), borderRadius:4 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:false, maxRotation:60 }, grid:{ display:false } },
        y:{ min:0, max:5, ticks:{ color:textColor }, grid:{ color:gridColor } } } }
    });
  }
}

