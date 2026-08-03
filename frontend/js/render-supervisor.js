/* Telas do papel Supervisor: cadastros, cobertura, eventos, métricas, caixa de envio, ocorrências. */

function renderSupervisor(){
  const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
  const tabLabel = NAV.supervisor.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='cadastros') content = supCadastros(myAnalistas);
  else if(activeNavKey==='basemestra') content = supBaseMestra(myAnalistas);
  else if(activeNavKey==='suplencias') content = renderImportPendentesBanner('suplencias', myAnalistas) + supSugerirSuplente(myAnalistas) + supSuplencias(myAnalistas);
  else if(activeNavKey==='programacao') content = supProgramacao(myAnalistas);
  else if(activeNavKey==='grade') content = supGrade(myAnalistas);
  else if(activeNavKey==='reunioes') content = supReunioes(myAnalistas) + supPlantao();
  else if(activeNavKey==='metricas') content = supMetricas(myAnalistas);
  else if(activeNavKey==='transmissao') content = supTransmissao(myAnalistas);
  else if(activeNavKey==='ocorrencias') content = supOcorrencias(myAnalistas);
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
  return `
  <div class="card" style="margin-bottom:18px;border-color:var(--alert);">
    <div class="section-title" style="color:var(--alert);">⚠ ${p.items.length} nome(s) não encontrado(s) no cadastro</div>
    <div class="help-text">Essas linhas da planilha não bateram com nenhum analista da sua equipe (mesmo ignorando acentos, maiúsculas/minúsculas e pontuação). Selecione o analista certo pra cada uma, ou deixe em "Descartar" pra não importar a linha.</div>
    ${p.items.map((it,idx)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
        <span style="flex:1;min-width:220px;font-size:13px;"><b>"${escapeHtml(it.nomeOriginal||'(vazio)')}"</b> — ${escapeHtml(it.operacao)} · ${it.horaInicio}–${it.horaFim}</span>
        <select data-pendente-idx="${idx}" style="min-width:220px;">
          <option value="">— Descartar linha —</option>
          ${myAnalistas.map(a=>`<option value="${a.id}" ${it.analistaId===a.id?'selected':''}>${a.name}</option>`).join('')}
        </select>
      </div>`).join('')}
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
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>Horário</th><th>Dias</th><th>Titular</th><th>Vigência</th><th></th></tr></thead><tbody>
  ${rows.map(b=>`<tr><td>${b.operacao}</td><td>${b.ciclo}</td><td class="mono">${b.horaInicio}–${b.horaFim}</td><td class="jornada-tag">${diasBaseMestraLabel(b)}</td><td>${b.titular}</td><td class="mono" style="color:var(--text-muted);">${b.dataInicio} → ${b.dataFim}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-mestra="${b.id}">Editar</button> <button class="btn btn-danger" data-excluir-mestra="${b.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhuma operação fixa cadastrada</td></tr>'}
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
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>Horário</th><th>Folgando</th><th>Suplente</th><th>Data</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${s.operacao}</td><td>${s.ciclo||'—'}</td><td class="mono">${s.horaInicio}–${s.horaFim}</td><td>${userById(s.analistaOriginalId)?.name||'—'}</td><td>${s.suplente}</td><td class="mono">${s.dataCobertura}</td>
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
  const statusLabels = {wait:'A Iniciar', live:'Em Andamento', done:'Finalizada', atraso:'Pendente Raio-X'};
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
  <table><thead><tr><th>Título</th><th>Tipo</th><th>Data</th><th>Hora</th><th>Participantes</th><th></th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${r.titulo}</td><td>${r.tipo==='grupo'?'Grupo':'Individual'}</td><td class="mono">${r.data}</td><td class="mono">${r.hora}</td>
  <td>${r.tipo==='grupo' ? (r.analistaIds.length===0?'Toda a equipe':r.analistaIds.map(id=>userById(id)?.name).join(', ')) : (userById(r.analistaIds[0])?.name||'—')}</td>
  <td style="text-align:right;white-space:nowrap;">
    <button class="btn" data-editar-reuniao="${r.id}">Editar</button>
    <button class="btn btn-danger" data-excluir-reuniao="${r.id}">Excluir</button>
  </td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma reunião agendada</td></tr>'}
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


// Guarda os dados já calculados da última renderização pra
// renderMetricasCharts() (events.js) desenhar os gráficos sem recalcular
// tudo de novo — chamado logo depois do innerHTML ser trocado (mesmo
// padrão de updateNavBadges()).
let metricasChartData = null;

function supMetricas(myAnalistas){
  const flt = uiState.metricasFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -7);
  const fim = flt.fim || todayISO();
  const noPeriodo = data => data>=inicio && data<=fim;

  const selecionados = flt.analistas.length ? myAnalistas.filter(a=>flt.analistas.includes(a.id)) : myAnalistas;
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

  return `
  <div class="filter-row">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-metricasfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-metricasfiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <div class="multiselect">
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
    </div>
  </div>
  <div class="grid-4" style="margin-bottom:20px;">
    <div class="stat-card"><div class="stat-num">${ativos.length}</div><div class="stat-label">Analistas ativos no período</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--folga);">${periodoCurto ? emFolga.length : diasFolgaQtd}</div><div class="stat-label">${periodoCurto ? 'Analistas em folga/ausentes' : 'Folgas/férias no período'}${flt.analistas.length===1?' (analista selecionado)':''}</div></div>
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
  </tbody></table></div>`;
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

