/* Telas do papel Supervisor: cadastros, cobertura, eventos, métricas, caixa de envio, ocorrências. */

function renderSupervisor(){
  const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
  const tabLabel = NAV.supervisor.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='cadastros') content = supCadastros(myAnalistas);
  else if(activeNavKey==='basemestra') content = renderImportPendentesBanner('basemestra', myAnalistas) + supGerarEscalaMensal(myAnalistas) + supBaseMestra(myAnalistas);
  else if(activeNavKey==='spr') content = supSPR();
  else if(activeNavKey==='resultadospr') content = supResultadoSPR(myAnalistas);
  else if(activeNavKey==='tempoexecucao') content = supTempoExecucao(myAnalistas);
  else if(activeNavKey==='suplencias') content = renderImportPendentesBanner('suplencias', myAnalistas) + supGerarEscalaDomingo(myAnalistas) + supSugerirSuplente(myAnalistas) + supSuplencias(myAnalistas);
  else if(activeNavKey==='programacao') content = supProgramacao(myAnalistas);
  else if(activeNavKey==='grade') content = supGrade(myAnalistas);
  else if(activeNavKey==='domingos') content = supControleDomingos(myAnalistas);
  else if(activeNavKey==='reunioes') content = supReunioes(myAnalistas) + supPlantao();
  else if(activeNavKey==='particularidades') content = supParticularidadesAuditoria(myAnalistas);
  else if(activeNavKey==='metricas') content = supMetricas(myAnalistas);
  else if(activeNavKey==='transmissao') content = supTransmissao(myAnalistas);
  else if(activeNavKey==='ocorrencias') content = supOcorrencias(myAnalistas);
  else if(activeNavKey==='feedbacks') content = supFeedbacks(myAnalistas);
  else if(activeNavKey==='formularios') content = supFormularios(myAnalistas);
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
  <div class="action-row-end" style="margin-bottom:14px;">
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
        <button class="btn" data-toggle-ativo="${a.id}">${a.active?'Desativar':'Ativar'}</button>
        <button class="btn btn-danger" data-excluir-analista="${a.id}">Excluir</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum analista cadastrado</td></tr>'}
    </tbody></table>
  </div>`;
}


// Linhas vigentes (dataFim >= hoje) das Operações Fixas da equipe, no
// mesmo formato/ordem de coluna do import — dá pra baixar, editar
// titular/datas e reimportar direto, sem retypar as ~90 operações
// inteiras todo mês (ver btnExportarMestra, events.js).
let baseMestraExportRows = [];

// Redistribui a carteira do mês inteiro pra equipe de uma vez (ver
// gerarEscalaMensal, utils.js): pega os hubs vigentes hoje e propõe um
// novo titular pra cada um, respeitando jornada, nunca repetindo hub que
// a pessoa já teve, e variando UF entre a carteira de cada analista. A
// proposta fica editável (dropdown por linha) antes de publicar — mesmo
// espírito do Gerar Escala de Fim de Semana, só que pro mês inteiro e
// criando operação fixa (Base Mestra) em vez de cobertura avulsa.
function supGerarEscalaMensal(myAnalistas){
  // Ordem alfabética só pro resumo e pro dropdown "Novo titular" — a lista
  // de candidatos que a geração em si usa (candidatoIds, events.js) é outra
  // variável, não mexe na lógica de distribuição.
  const analistasAtivos = myAnalistas.filter(a=>a.active).sort((a,b)=>a.name.localeCompare(b.name, 'pt-BR'));
  if(!uiState.escalaMensalMes) uiState.escalaMensalMes = addMonthsISO(todayISO(), 1).slice(0,7);
  const mes = uiState.escalaMensalMes;
  const res = uiState.escalaMensalResultado;

  let resultsHtml = '';
  if(res && res.mes===mes && res.linhas.length===0){
    resultsHtml = `<div class="card" style="margin-top:18px;margin-bottom:22px;">
      <div class="section-title">Proposta — ${mes}</div>
      <div class="help-text" style="color:var(--danger,#e05252);">⚠️ Nenhuma operação fixa vigente encontrada pra sua equipe. Cadastre as operações em Operações Fixas antes de gerar a escala do mês.</div>
    </div>`;
  } else if(res && res.mes===mes){
    const porAnalista = new Map(analistasAtivos.map(a=>[a.id, 0]));
    res.linhas.forEach(l=>{ if(l.analistaId) porAnalista.set(l.analistaId, (porAnalista.get(l.analistaId)||0)+1); });
    const resumo = analistasAtivos.map(a=>{
      const n = porAnalista.get(a.id)||0;
      return `<span class="op-tag" style="${n===0?'color:var(--danger,#e05252);':''}">${escapeHtml(a.name)}: ${n} op(s)</span>`;
    }).join(' ');
    const naoCobertos = res.linhas.filter(l=>!l.analistaId).length;

    resultsHtml = `<div class="card" style="margin-top:18px;margin-bottom:22px;">
      <div class="section-title">Proposta — ${mes}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${resumo}</div>
      ${naoCobertos>0 ? `<div class="help-text" style="color:var(--danger,#e05252);">⚠️ ${naoCobertos} operação(ões) não coube em ninguém entre os cadastros ativos (todo mundo já teve esse hub, ou não bate com a jornada de ninguém) — ajuste manualmente abaixo.</div>` : ''}
      <div style="overflow-x:auto;">
      <table><thead><tr><th>Operação</th><th>Ciclo</th><th>Horário</th><th>UF</th><th>Novo titular</th></tr></thead><tbody>
      ${res.linhas
        .map((l,idx)=>({l,idx,nome:l.analistaId ? (userById(l.analistaId)?.name||'') : ''}))
        // Ordena as LINHAS pelo nome do titular já atribuído (não só as
        // opções de cada dropdown) — sem titular vai pro fim, não some no
        // meio da lista por "" comparar como menor que qualquer nome.
        .sort((x,y)=> !x.nome && !y.nome ? 0 : !x.nome ? 1 : !y.nome ? -1 : x.nome.localeCompare(y.nome,'pt-BR'))
        .map(({l,idx})=>`<tr ${!l.analistaId?'style="background:rgba(224,82,82,0.08);"':''}>
        <td>${escapeHtml(l.operacao)}</td>
        <td>${escapeHtml(l.ciclo||'')}</td>
        <td class="mono">${l.horaInicio}–${l.horaFim}</td>
        <td class="mono">${l.uf||'—'}</td>
        <td><select data-escalamensal-idx="${idx}">
          <option value="">— sem titular —</option>
          ${analistasAtivos.map(a=>`<option value="${a.id}" ${l.analistaId===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
        </select></td>
      </tr>`).join('')}
      </tbody></table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="btn" data-gerar-escala-mensal="1">Gerar outra combinação</button>
        <button class="btn btn-brand" id="btnConfirmarEscalaMensal">Publicar (${res.linhas.filter(l=>l.analistaId).length} operação(ões))</button>
      </div>
    </div>`;
  }

  // Vigência das operações publicadas: mês inteiro por padrão, mas dá pra
  // encurtar (ex.: escala provisória de metade do mês) — sempre dentro do
  // mês escolhido (min/max do input travam nisso, e o publish confirma de
  // novo por segurança).
  const primeiroDiaMes = `${mes}-01`;
  const ultimoDiaMes = ultimoDiaDoMesISO(mes);
  const vigInicio = uiState.escalaMensalDataInicio || primeiroDiaMes;
  const vigFim = uiState.escalaMensalDataFim || ultimoDiaMes;

  return `
  <div class="section-title">Gerar Escala do Mês</div>
  <div class="help-text">Escolha o mês e clique em Gerar: o sistema redistribui os hubs vigentes entre os cadastros ativos da equipe (analistas desativados ficam de fora do sorteio), sem repetir com ninguém um hub que já teve (histórico completo), respeitando o horário de jornada de cada um e variando o estado (UF) da carteira de cada pessoa. A proposta fica editável antes de publicar — publicar cria uma operação fixa nova pra cada linha com titular, sem mexer no que já existe.</div>
  <div class="card" style="margin-bottom:22px;">
    <div class="grid-3">
      <div class="field" style="margin-bottom:0;"><label>Mês</label><input type="month" id="escalaMensalMesInput" value="${mes}"></div>
      <div class="field" style="margin-bottom:0;"><label>Vigência — início</label><input type="date" id="escalaMensalInicioInput" value="${vigInicio}" min="${primeiroDiaMes}" max="${ultimoDiaMes}"></div>
      <div class="field" style="margin-bottom:0;"><label>Vigência — fim</label><input type="date" id="escalaMensalFimInput" value="${vigFim}" min="${primeiroDiaMes}" max="${ultimoDiaMes}"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-brand" data-gerar-escala-mensal="1">Gerar escala</button>
    </div>
  </div>
  ${resultsHtml}`;
}


function supBaseMestra(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const allRows = DB.baseMestra.filter(b=>ids.includes(b.analistaId));
  baseMestraExportRows = allRows.filter(b=>b.dataFim>=todayISO());

  const f = uiState.baseMestraFiltro;
  // Titular por nome (não id): registros órfãos (titular sem conta de
  // login, ver comentário do schema) só têm o texto, não um analistaId pra
  // casar com myAnalistas — filtrar pelo nome cobre os dois casos.
  const titularesUnicos = [...new Set(allRows.map(b=>b.titular))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const temFiltro = !!(f.operacao || f.horario || f.titular!=='all' || f.vigenciaInicio || f.vigenciaFim);
  const rows = allRows.filter(b=>
    (!f.operacao || b.operacao.toLowerCase().includes(f.operacao.toLowerCase())) &&
    (!f.horario || `${b.horaInicio}–${b.horaFim}`.includes(f.horario)) &&
    (f.titular==='all' || b.titular===f.titular) &&
    // Vigência = faixa que o registro cobre (dataInicio→dataFim), não uma
    // data só — filtro é por SOBREPOSIÇÃO com o período informado, não
    // exigindo bater exatamente. Só "de" preenchido: tudo que ainda vale a
    // partir dali. Só "até": tudo que já valia até lá.
    (!f.vigenciaInicio || b.dataFim>=f.vigenciaInicio) &&
    (!f.vigenciaFim || b.dataInicio<=f.vigenciaFim)
  );

  return `
  <div class="csv-row">
    <span class="csv-label">Carga em massa das operações do titular (Excel)</span>
    <button class="btn" id="btnExportarMestra">⬇ Exportar vigentes</button>
    <button class="btn" id="btnBaixarModeloMestra">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportMestra" style="display:none;"></label>
  </div>
  <div class="help-text" style="margin-top:-10px;">Pra trocar os titulares do mês: exporte as vigentes, mude a coluna "analista" e as datas, e importe de volta — cria um lote novo, sem mexer no que já existe (o histórico anterior continua na tabela).</div>
  <div class="action-row-end" style="margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovaMestra">+ Nova entrada</button>
  </div>
  <div class="filter-row">
    <input placeholder="Filtrar por operação..." data-basemestrafiltro="operacao" value="${escapeHtml(f.operacao)}">
    <input placeholder="Filtrar por horário (ex: 19:00)" data-basemestrafiltro="horario" value="${escapeHtml(f.horario)}">
    <select data-basemestrafiltro="titular">
      <option value="all">Titular: todos</option>
      ${titularesUnicos.map(t=>`<option value="${escapeHtml(t)}" ${f.titular===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
    </select>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Vigente de
      <input type="date" data-basemestrafiltro="vigenciaInicio" value="${f.vigenciaInicio}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">até
      <input type="date" data-basemestrafiltro="vigenciaFim" value="${f.vigenciaFim}">
    </label>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>SPR</th><th>Regional</th><th>Horário</th><th>Dias</th><th>Titular</th><th>Vigência</th><th></th></tr></thead><tbody>
  ${rows.map(b=>{
    const regional = regionalDaOperacao(session.userId, b.operacao, b.ciclo);
    return `<tr><td>${b.operacao}</td><td>${b.ciclo}</td><td class="mono">${getSPR(session.userId, b.operacao, b.ciclo) ?? '—'}</td><td>${regional ? escapeHtml(regional) : '<span style="color:var(--text-faint);">—</span>'}</td><td class="mono">${b.horaInicio}–${b.horaFim}</td><td class="jornada-tag">${diasBaseMestraLabel(b)}</td><td>${b.titular}</td><td class="mono" style="color:var(--text-muted);">${b.dataInicio} → ${b.dataFim}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-mestra="${b.id}">Editar</button> <button class="btn btn-danger" data-excluir-mestra="${b.id}">Excluir</button></td></tr>`;
  }).join('') || `<tr><td colspan="9" class="empty">Nenhuma operação fixa${temFiltro?' pra esse filtro':' cadastrada'}</td></tr>`}
  </tbody></table></div>`;
}


// Linhas atuais de SPR da equipe, mesmo formato do import — baixar,
// atualizar só a coluna "spr" e reimportar (ver comentário na importação,
// events.js: reimportar operação+ciclo já existente ATUALIZA o valor em
// vez de duplicar, então isso já cobre a troca mensal em massa).
let sprCadastroExportRows = [];

function supSPR(){
  const rows = [...DB.sprs].filter(s=>s.supervisorId===session.userId).sort((a,b)=> a.operacao.localeCompare(b.operacao) || a.ciclo.localeCompare(b.ciclo));
  sprCadastroExportRows = rows;
  // Sugestões pro datalist do modal (Nova entrada/Editar) — operação e
  // ciclo já usados em Operações Fixas ou Cobertura, pra evitar erro de
  // digitação que faria o SPR não bater com nada (mesmo problema que já
  // resolvemos pro nome do suplente na importação de Cobertura).
  const opsConhecidas = [...new Set([...DB.baseMestra, ...DB.suplencias].map(b=>b.operacao))].sort();
  const ciclosConhecidos = [...new Set([...DB.baseMestra, ...DB.suplencias].map(b=>b.ciclo).filter(Boolean))].sort();
  return `
  <div class="help-text">Cadastre o SPR (e a Regional, opcional) de cada Operação/Ciclo aqui — o SPR aparece automaticamente em Operações Fixas, Cobertura e na Programação do analista, sempre que a operação e o ciclo baterem. A Regional só é usada pra filtrar o Resultado SPR, não aparece pro analista. O SPR usado em cada finalização já fica congelado no Raio-X dela (spr_meta), então atualizar aqui não apaga o histórico do que já foi lançado.</div>
  <datalist id="sprOpList">${opsConhecidas.map(o=>`<option value="${escapeHtml(o)}">`).join('')}</datalist>
  <datalist id="sprCicloList">${ciclosConhecidos.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist>
  <datalist id="regionalList">${regionaisConhecidas().map(r=>`<option value="${escapeHtml(r)}">`).join('')}</datalist>
  <div class="csv-row">
    <span class="csv-label">Carga em massa de SPR e Regional (Excel)</span>
    <button class="btn" id="btnExportarSpr">⬇ Exportar atuais</button>
    <button class="btn" id="btnBaixarModeloSpr">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportSpr" style="display:none;"></label>
  </div>
  <div class="help-text" style="margin-top:-10px;">Reimportar operação+ciclo que já existe atualiza o valor (não duplica) — pra trocar o SPR ou a Regional em massa, exporte os atuais, mude a coluna e importe de volta.</div>
  <div class="action-row-end" style="margin-bottom:14px;">
    <button class="btn btn-brand" id="btnNovoSpr">+ Nova entrada SPR</button>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Ciclo</th><th>SPR</th><th>Regional</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${escapeHtml(s.operacao)}</td><td>${escapeHtml(s.ciclo)}</td><td class="mono">${escapeHtml(String(s.spr))}</td><td>${s.regional ? escapeHtml(s.regional) : '<span style="color:var(--text-faint);">—</span>'}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-spr="${s.id}">Editar</button> <button class="btn btn-danger" data-excluir-spr="${s.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum SPR cadastrado</td></tr>'}
  </tbody></table></div>`;
}


// Junta os dois jeitos de "outra pessoa cobrindo": suplência avulsa
// (operação sem dono fixo, tabela solta) e ausência (folga/férias do
// titular numa operação fixa da Base Mestra, criada aqui mesmo pelo
// "Sugerir Suplente" ou direto na Base Mestra) — antes só a avulsa
// aparecia nessa lista, o que confundia quem lançava uma folga e não via
// ela aqui (via aparecer só na Programação/Grade do Dia).
function supSuplencias(myAnalistas){
  const ids = myAnalistas.map(a=>a.id);
  const f = uiState.suplenciasFiltro;

  const suplenciaRows = DB.suplencias.filter(s=>ids.includes(s.analistaOriginalId)).map(s=>({
    source:'suplencia', id:s.id, operacao:s.operacao, ciclo:s.ciclo, horaInicio:s.horaInicio, horaFim:s.horaFim,
    data:s.dataCobertura, folgandoId:s.analistaOriginalId, folgandoNome:userById(s.analistaOriginalId)?.name||'—',
    // Sem "tipo" próprio até a migração rodar (coluna nova) — trata como
    // folga, igual sempre foi tratada antes de existir a distinção.
    suplenteNome:s.suplente||'—', tipo:s.tipo||'folga',
  }));
  const ausenciaRows = DB.ausencias.filter(a=>ids.includes(a.analistaId)).map(a=>({
    source:'ausencia', id:a.id, operacao:a.operacao, ciclo:a.ciclo, horaInicio:a.horaInicio, horaFim:a.horaFim,
    data:a.data, folgandoId:a.analistaId, folgandoNome:userById(a.analistaId)?.name||'—',
    suplenteNome: a.suplenteId ? (userById(a.suplenteId)?.name || a.suplenteNome || '—') : (a.suplenteNome || 'Ninguém'),
    tipo:a.tipo,
  }));
  const allRows = [...suplenciaRows, ...ausenciaRows].sort((a,b)=> b.data.localeCompare(a.data));

  const rows = allRows.filter(s=>
    (!f.operacao || s.operacao.toLowerCase().includes(f.operacao.toLowerCase())) &&
    (!f.horario || `${s.horaInicio}–${s.horaFim}`.includes(f.horario)) &&
    (f.suplente==='all' || s.suplenteNome===f.suplente) &&
    (f.cobrindo==='all' || s.folgandoId===f.cobrindo) &&
    (!f.inicio || s.data>=f.inicio) &&
    (!f.fim || s.data<=f.fim)
  );
  const suplentesUnicos = [...new Set(allRows.map(s=>s.suplenteNome))].filter(Boolean).sort();

  const tipoBadge = tipo => tipo==='ferias'
    ? `<span style="color:var(--folga);font-weight:600;white-space:nowrap;">🏖️ Férias</span>`
    : `<span style="color:var(--folga);font-weight:600;white-space:nowrap;">🌙 Folga</span>`;

  return `
  <div class="section-title">Cobertura</div>
  <div class="csv-row">
    <span class="csv-label">Carga em massa de coberturas avulsas (Excel)</span>
    <button class="btn" id="btnBaixarModeloSuplencia">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportSuplencia" style="display:none;"></label>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;">
    <button class="btn" id="btnNovaSuplenciaFerias">🏖️ Cobertura de férias</button>
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
  <div class="action-row-end" style="margin-bottom:10px;">
    <button class="btn btn-danger" id="btnExcluirTodasCoberturas" ${rows.length===0?'disabled':''}>Excluir todos (${rows.length})</button>
  </div>
  <div class="card" style="margin-bottom:22px;">
  <table><thead><tr><th>Tipo</th><th>Operação</th><th>Ciclo</th><th>SPR</th><th>Horário</th><th>Folgando</th><th>Suplente</th><th>Data</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${tipoBadge(s.tipo)}</td><td>${s.operacao}</td><td>${s.ciclo||'—'}</td><td class="mono">${getSPR(session.userId, s.operacao, s.ciclo) ?? '—'}</td><td class="mono">${s.horaInicio}–${s.horaFim}</td><td>${s.folgandoNome}</td><td>${s.suplenteNome}</td><td class="mono">${s.data}</td>
  <td style="text-align:right;white-space:nowrap;"><button class="btn" data-editar-cobertura="${s.id}" data-cobertura-tipo="${s.source}">Editar</button> <button class="btn btn-danger" data-excluir-cobertura="${s.id}" data-cobertura-tipo="${s.source}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhuma cobertura registrada</td></tr>'}
  </tbody></table></div>`;
}


// Todo domingo, os hubs 7x7 continuam precisando de titular mesmo com o
// time inteiro de folga — hoje isso é escolhido e distribuído manualmente.
// Regra: dois grupos fixos (A e B) revezando os domingos marcados no mês —
// A cobre o 1º e o 3º domingo marcado, B cobre o 2º e o 4º (⇄ Inverter
// troca os dois de posição). Um analista pode estar nos dois grupos de
// propósito (cobre todo domingo marcado, sem folga cruzada forçada entre
// eles — diferente do antigo par sábado/domingo). O sistema propõe a
// escala inteira de cada domingo (gerarEscalaFDS, ver utils.js): até 6
// operações por pessoa, sem estourar 8h de turno, priorizando a carteira
// própria de cada um. As propostas (até 4) ficam lado a lado (grid-2) —
// dá pra ajustar (dropdown por linha) cada uma antes de confirmar, cada
// domingo com seu próprio botão de confirmação.
// A grade de chips (escaladom-grid) é grande demais pra ficar sempre
// aberta dentro do card — aqui só um botão-resumo por grupo, que abre a
// seleção numa caixa (modal, ver wireEscalaDomModal em events.js).
function escalaDomAnalistaPicker(dia, label, sel){
  return `<div class="field" style="margin-bottom:0;">
    <label>${label}</label>
    <button type="button" class="btn" data-abrir-escaladom="${dia}" style="width:100%;display:flex;justify-content:space-between;align-items:center;">
      <span>${sel.length===0 ? 'Selecionar analistas' : `${sel.length} analista(s) selecionado(s)`}</span>
      <span>✎</span>
    </button>
  </div>`;
}

function escalaDomPropostaHtml(dia, label, dataStr, res, myAnalistas){
  if(!res) return '';
  if(res.linhas.length===0){
    const idsEquipe = new Set(myAnalistas.map(a=>a.id));
    const datasFim = DB.baseMestra.filter(b=>b.analistaId && idsEquipe.has(b.analistaId)).map(b=>b.dataFim).sort();
    const ultima = datasFim[datasFim.length-1];
    return `<div class="card">
      <div class="section-title">${label} — ${dataStr}</div>
      <div class="help-text" style="color:var(--danger,#e05252);">
        ⚠️ Nenhuma operação fixa da sua equipe está ativa em ${dataStr}${ultima ? ` — a última operação fixa cadastrada termina em ${ultima}` : ''}. Atualize a Base Mestra (Operações Fixas) pra estender o período antes de gerar a escala.
      </div>
    </div>`;
  }
  const porEscalado = new Map(res.escalados.map(id=>[id, 0]));
  res.linhas.forEach(l=>{ if(l.escaladoId) porEscalado.set(l.escaladoId, (porEscalado.get(l.escaladoId)||0)+1); });
  const resumo = res.escalados.map(id=>{
    const n = porEscalado.get(id)||0;
    return `<span class="op-tag" style="${n===0?'color:var(--danger,#e05252);':''}">${escapeHtml(userById(id)?.name||'—')}: ${n} op(s)</span>`;
  }).join(' ');
  const naoCobertos = res.linhas.filter(l=>!l.escaladoId).length;
  return `<div class="card">
    <div class="section-title">${label} — ${dataStr}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${resumo}</div>
    ${naoCobertos>0 ? `<div class="help-text" style="color:var(--danger,#e05252);">⚠️ ${naoCobertos} operação(ões) não coube em ninguém (capacidade ou janela de 8h esgotada) — ajuste manualmente abaixo ou escale mais gente.</div>` : ''}
    <div style="overflow-x:auto;">
    <table><thead><tr><th>Horário</th><th>Operação</th><th>Ciclo</th><th>Quem cobre</th></tr></thead><tbody>
    ${res.linhas
      .map((l,idx)=>({l,idx,nome:l.escaladoId ? (userById(l.escaladoId)?.name||'') : ''}))
      // Ordena as LINHAS por quem já foi escalado pra cobrir (não só as
      // opções do dropdown), e dentro da mesma pessoa por horário — "não
      // cobrir" vai pro fim. idx preservado do array original, então o
      // dropdown de cada linha continua salvando no lugar certo
      // (data-escaladom-idx). hourSortValue trata madrugada como
      // continuação da noite (não como início do dia).
      .sort((x,y)=>{
        if(!x.nome && !y.nome) return hourSortValue(x.l.horaInicio)-hourSortValue(y.l.horaInicio);
        if(!x.nome) return 1;
        if(!y.nome) return -1;
        return x.nome.localeCompare(y.nome,'pt-BR') || hourSortValue(x.l.horaInicio)-hourSortValue(y.l.horaInicio);
      })
      .map(({l,idx})=>{
      const propria = l.analistaId && l.analistaId===l.escaladoId;
      return `<tr ${!l.escaladoId?'style="background:rgba(224,82,82,0.08);"':''}>
        <td class="mono">${l.horaInicio}–${l.horaFim}</td>
        <td>${escapeHtml(l.operacao)}</td>
        <td>${escapeHtml(l.ciclo||'')}</td>
        <td><select data-escaladom-dia="${dia}" data-escaladom-idx="${idx}">
          <option value="">— não cobrir —</option>
          ${res.escalados.map(id=>`<option value="${id}" ${l.escaladoId===id?'selected':''}>${escapeHtml(userById(id)?.name||'—')}${id===l.analistaId?' (própria)':''}</option>`).join('')}
        </select>${propria?' 🏠':''}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-brand" data-confirmar-escaladom="${dia}">Confirmar ${label.toLowerCase()} (${res.linhas.filter(l=>l.escaladoId).length} cobertura(s))</button>
    </div>
  </div>`;
}

const MAX_DOMINGOS_ESCALA = 4;
function supGerarEscalaDomingo(myAnalistas){
  if(!uiState.escalaDomMes) uiState.escalaDomMes = todayISO().slice(0,7);
  const mes = uiState.escalaDomMes;
  const domingosDisponiveis = domingosDoMes(mes);
  // Se o mês mudou e a seleção antiga não pertence mais a ele, cai pros
  // primeiros 4 domingos do mês novo — sem isso ficaria vazio sozinho.
  if(uiState.escalaDomDomingosSel.length===0 || uiState.escalaDomDomingosSel.some(d=>!domingosDisponiveis.includes(d))){
    uiState.escalaDomDomingosSel = domingosDisponiveis.slice(0, MAX_DOMINGOS_ESCALA);
  }
  const domingosSel = uiState.escalaDomDomingosSel;

  const cards = domingosSel.map((data, idx)=>{
    const grupo = idx%2===0 ? 'A' : 'B';
    const res = uiState.escalaDomResultados[data];
    return escalaDomPropostaHtml(data, `Domingo ${formatarDataCurta(data)} — Grupo ${grupo}`, data, res, myAnalistas);
  }).filter(Boolean);
  const resultsHtml = cards.length ? `<div class="grid-2" style="align-items:start;margin-bottom:22px;">${cards.join('')}</div>` : '';

  return `
  <div class="section-title">Gerar Escala de Domingo</div>
  <div class="help-text">Marque até ${MAX_DOMINGOS_ESCALA} domingos do mês e dois grupos de analistas — o Grupo A cobre o 1º e o 3º domingo marcado, o Grupo B cobre o 2º e o 4º (⇄ Inverter troca os dois). Um analista pode estar nos dois grupos (cobre todo domingo marcado). O sistema monta a escala do dia inteiro pra cada um: até 6 operações por pessoa, priorizando a carteira própria (🏠), equilibrando o total entre todos e variando o estado (UF) dos hubs extras, sem passar de 8h de turno.</div>
  <div class="card" style="margin-bottom:22px;">
    <div class="field" style="max-width:220px;"><label>Mês</label><input type="month" id="escalaDomMesInput" value="${mes}"></div>
    <div class="field">
      <label>Domingos do mês (<span id="escalaDomDomingosCount">${domingosSel.length}</span>/${MAX_DOMINGOS_ESCALA})</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${domingosDisponiveis.map(d=>`<label style="display:flex;align-items:center;gap:6px;font-weight:400;">
          <input type="checkbox" class="escaladom-domingo-chk" value="${d}" ${domingosSel.includes(d)?'checked':''}> ${formatarDataCurta(d)}
        </label>`).join('')}
      </div>
    </div>
    <div class="grid-2">
      ${escalaDomAnalistaPicker('A', 'Grupo A (1º / 3º domingo marcado)', uiState.escalaDomGrupoA)}
      ${escalaDomAnalistaPicker('B', 'Grupo B (2º / 4º domingo marcado)', uiState.escalaDomGrupoB)}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
      <button class="btn" id="btnInverterEscalaDom" title="Troca o Grupo A pelo Grupo B">⇄ Inverter Grupo A / B</button>
      <button class="btn btn-brand" id="btnGerarEscalaDom">Gerar escala</button>
    </div>
  </div>
  ${resultsHtml}`;
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
  const filtros = `
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
  </div>`;
  // Diária ganhou a grade integrada (todos os analistas numa régua só, em
  // vez de um bloco empilhado por analista) — Semanal/Mensal continuam
  // reaproveitando a visão do próprio analista, uma por seção.
  if(uiState.progView==='diaria'){
    return filtros + renderProgramacaoIntegrada(list, uiState.progDate);
  }
  // Semanal/Mensal não mostram analista inativo (desligado) — Diária
  // continua mostrando todo mundo, sem mudança aqui.
  const listAtiva = list.filter(a=>a.active);
  const renderFor = a => uiState.progView==='semanal' ? renderAnalistaSemanal(a.id, uiState.progDate)
    : renderAnalistaMensal(a.id, uiState.progDate);
  return filtros + (listAtiva.map(a=>`<div style="margin-bottom:22px;"><div class="section-title">${a.name}</div>${renderFor(a)}</div>`).join('')
    || '<div class="empty">Nenhum analista para exibir</div>');
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
      rows.push({chave:s.id, analistaId:id, analista:userById(id).name, op:s.operacao, ciclo:s.ciclo||'', hora:s.horaInicio, horaFim:s.horaFim, nome:s.responsavelNome, isCobertura:!!s.isCobertura, status});
    });
  });
  // Uma cobertura gera 2 entradas com o mesmo id em getDaySlots: uma na
  // agenda do titular (operação coberta, sempre "Finalizada" porque ele
  // não precisa fazer nada) e outra na agenda de quem está cobrindo (com
  // o status real, incluindo Não Finalizado). Mantém só a segunda — é a
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
  const statusLabels = {wait:'A Iniciar', live:'Em Andamento', done:'Finalizada', atraso:'Não Finalizado'};
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
  ${filtered.map(r=>
    `<tr class="${r.isCobertura?'row-suplente':''}"><td class="mono">${r.hora}–${r.horaFim}</td><td style="cursor:pointer;" data-analista-timeline="${r.analistaId}" title="Ver histórico">${r.analista} ${r.isCobertura?'<span class="pill pill-suplente">🔁 Suplente</span>':''}</td><td>${r.op}</td><td>${r.nome}</td><td>${statusPill(r.status)}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty">Nenhum registro para os filtros selecionados</td></tr>'}
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
  const linhas = gradeExportRows.map(r=>[r.hora, r.analista, r.op, r.nome, r.isCobertura?'Suplente':'Titular', {wait:'A Iniciar',live:'Em Andamento',done:'Finalizada',atraso:'Não Finalizado'}[r.status]||r.status]);
  exportarRelatorioExcel(`grade-do-dia_${uiState.gradeFilters.data||hojeAgendaISO()}.xlsx`, ['Hora Início','Analista','Operação','Responsável','Tipo','Status'], linhas);
}


// "Escalado no domingo" = tem pelo menos uma operação própria (fixa) ou
// cobertura na agenda desse dia (categoriaOperacao, utils.js), OU está de
// plantão nesse domingo (analistaEmPlantao, utils.js) — folga não conta.
// Considera TODOS os domingos do mês, já realizados ou ainda por vir: o
// critério é estar na escala (ver getDaySlots), não se o dia já passou —
// assim o supervisor acompanha quem já tem domingo previsto na agenda, não
// só quem já trabalhou de fato.
let domingosExportRows = [];
function supControleDomingos(myAnalistas){
  const ref = new Date((uiState.domingosMes||todayISO())+'T00:00:00');
  const year = ref.getFullYear(), month = ref.getMonth();
  const prevDate = dateToISO(new Date(year, month-1, 1));
  const nextDate = dateToISO(new Date(year, month+1, 1));
  const hojeStr = todayISO();

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const domingosDoMes = [];
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(isDomingo(ds)) domingosDoMes.push(ds);
  }

  const ranking = myAnalistas.map(a=>{
    const detalhes = domingosDoMes.map(ds=>{
      const temOperacao = getDaySlots(a.id, ds).some(s=>{ const cat = categoriaOperacao(s); return cat==='fixa' || cat==='cobertura'; });
      const plantao = !temOperacao && analistaEmPlantao(a.id, ds);
      return (temOperacao || plantao) ? { ds, plantao } : null;
    }).filter(Boolean);
    return { analista:a, detalhes, total:detalhes.length };
  }).filter(p=>p.total>0).sort((a,b)=>b.total-a.total);

  domingosExportRows = ranking.flatMap(p=>p.detalhes.map(d=>[p.analista.name, d.ds, d.ds<=hojeStr?'Realizado':'Agendado', d.plantao?'Plantão':'Operação']));

  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <button class="btn" data-monthnav="${prevDate}" data-target="domingos">‹ Mês anterior</button>
    <div class="section-title" style="margin:0;">${MONTH_NAMES[month]} ${year}</div>
    <button class="btn" data-monthnav="${nextDate}" data-target="domingos">Próximo mês ›</button>
  </div>
  <div class="grid-3" style="margin-bottom:18px;">
    <div class="stat-card"><div class="stat-num">${domingosDoMes.length}</div><div class="stat-label">Domingos no mês</div></div>
    <div class="stat-card"><div class="stat-num">${ranking.length}</div><div class="stat-label">Analistas escalados em algum domingo</div></div>
    <div class="stat-card"><div class="stat-num">${ranking[0]?.total ?? 0}</div><div class="stat-label">${ranking[0] ? `Máximo: ${escapeHtml(ranking[0].analista.name)}` : 'Sem domingos escalados'}</div></div>
  </div>
  <div class="action-row-end" style="margin-bottom:14px;">
    <button class="btn" id="btnExportDomingos">⬇ Exportar Excel</button>
  </div>
  <div class="card">
  <table><thead><tr><th>#</th><th>Analista</th><th>Domingos escalados</th><th>Datas</th></tr></thead><tbody>
  ${ranking.map((p,i)=>`<tr><td class="mono">${i+1}º</td><td style="cursor:pointer;" data-analista-timeline="${p.analista.id}" title="Ver histórico">${escapeHtml(p.analista.name)}</td><td class="mono">${p.total}</td><td>${p.detalhes.map(d=>`${formatarDataCurta(d.ds)}${d.ds>hojeStr?' <span style="color:var(--text-faint);">(agendado)</span>':''}${d.plantao?' <span style="color:var(--text-faint);">(plantão)</span>':''}`).join(', ')}</td></tr>`).join('')
  || `<tr><td colspan="4" class="empty">Nenhum domingo escalado no mês selecionado</td></tr>`}
  </tbody></table></div>`;
}


// Auditoria de Particularidades: todo hub da equipe que já teve alguma nota
// preenchida, com conteúdo (prévia em texto puro — ver stripHtmlPreview,
// utils.js), quem editou por último e quando. Clicar na linha abre o mesmo
// modal "Ver Particularidade" (data-particularidade-op, ver events.js) —
// como supervisor, sempre pode editar por ali (ver upsertParticularidade,
// backend), então essa tela também serve pra corrigir/complementar.
let particularidadesAuditoriaExportRows = [];
function supParticularidadesAuditoria(myAnalistas){
  const f = uiState.particularidadesFiltro;

  // Uma operação pode ter mais de um titular (histórico de reatribuição —
  // ver conversa sobre o Breno/Wanderley) — junta todos os analistas da
  // equipe que hoje têm essa operação na base mestra.
  const titularesPorOperacao = new Map();
  DB.baseMestra.filter(b=>myAnalistas.some(a=>a.id===b.analistaId)).forEach(b=>{
    if(!titularesPorOperacao.has(b.operacao)) titularesPorOperacao.set(b.operacao, new Set());
    titularesPorOperacao.get(b.operacao).add(b.analistaId);
  });
  const nomesTitulares = op => [...(titularesPorOperacao.get(op)||[])].map(id=>userById(id)?.name).filter(Boolean).join(', ');

  const rows = DB.particularidades
    .filter(p=>p.supervisorId===session.userId)
    .filter(p=>!f.operacao || p.operacao.toLowerCase().includes(f.operacao.toLowerCase()))
    .filter(p=> f.analista==='all' || (titularesPorOperacao.get(p.operacao)||new Set()).has(f.analista))
    .sort((a,b)=>b.atualizadoEm-a.atualizadoEm);

  particularidadesAuditoriaExportRows = rows.map(p=>[
    p.operacao, nomesTitulares(p.operacao)||'—', stripHtmlPreview(p.texto, 300), p.atualizadoPor,
    new Date(p.atualizadoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}),
  ]);

  const temFiltro = f.operacao || f.analista!=='all';
  return `
  <div class="filter-row">
    <input placeholder="Filtrar por operação..." data-particularidadesfiltro="operacao" value="${escapeHtml(f.operacao)}">
    <select data-particularidadesfiltro="analista">
      <option value="all">Analista: todos</option>
      ${myAnalistas.map(a=>`<option value="${a.id}" ${f.analista===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
    </select>
    <button class="btn" id="btnExportParticularidades">⬇ Exportar Excel</button>
  </div>
  <div class="grid-2" style="margin-bottom:18px;">
    <div class="stat-card"><div class="stat-num">${rows.length}</div><div class="stat-label">Hubs com particularidade preenchida</div></div>
    <div class="stat-card"><div class="stat-num">${rows[0] ? new Date(rows[0].atualizadoEm).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—'}</div><div class="stat-label">${rows[0] ? `Atualização mais recente — ${escapeHtml(rows[0].operacao)}` : 'Nenhuma atualização registrada'}</div></div>
  </div>
  <div class="card">
  <table><thead><tr><th>Operação</th><th>Titular</th><th>Conteúdo</th><th>Última atualização</th><th>Por</th><th></th></tr></thead><tbody>
  ${rows.map(p=>`<tr>
    <td>${escapeHtml(p.operacao)}</td>
    <td>${escapeHtml(nomesTitulares(p.operacao)||'—')}</td>
    <td style="max-width:340px;color:var(--text-muted);">${escapeHtml(stripHtmlPreview(p.texto, 140)) || '<span style="color:var(--text-faint);">vazio</span>'}</td>
    <td class="mono" style="white-space:nowrap;">${new Date(p.atualizadoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td>
    <td>${escapeHtml(p.atualizadoPor)}</td>
    <td style="text-align:right;"><button class="btn" data-particularidade-op="${escapeHtml(p.operacao)}" data-particularidade-sup="${p.supervisorId}">Ver / Editar</button></td>
  </tr>`).join('') || `<tr><td colspan="6" class="empty">Nenhuma particularidade preenchida ainda${temFiltro?' pra esse filtro':''}</td></tr>`}
  </tbody></table></div>`;
}


function reuniaoParticipantesLabel(r){
  return r.tipo==='grupo' ? (r.analistaIds.length===0?'Toda a equipe':r.analistaIds.map(id=>userById(id)?.name).join(', ')) : (userById(r.analistaIds[0])?.name||'—');
}

function reuniaoFaixa(r){
  return r.horaFim ? `${r.hora}–${r.horaFim}` : r.hora;
}

// Presença é auto-declarada pelo próprio analista, via botão "Confirmar
// presença" no card dele (render-analista.js) — aqui só mostra o resumo
// pro supervisor, com os nomes no tooltip.
function presencaResumo(r){
  const confirmados = DB.reuniaoPresenca.filter(p=>p.reuniaoId===r.id);
  if(confirmados.length===0) return '';
  const nomes = confirmados.map(p=>userById(p.analistaId)?.name).filter(Boolean);
  return `<div class="flash-meta" style="color:var(--done);" title="${escapeHtml(nomes.join(', '))}">✓ ${confirmados.length} confirmaram presença</div>`;
}

function reuniaoChip(r){
  const presentes = DB.reuniaoPresenca.filter(p=>p.reuniaoId===r.id).length;
  return `<div class="cal-chip cal-chip-reuniao" data-editar-reuniao="${r.id}" style="cursor:pointer;" title="${escapeHtml(r.titulo)} · ${reuniaoFaixa(r)} · ${escapeHtml(reuniaoParticipantesLabel(r))}${r.link?' · com link':''}${presentes?` · ${presentes} confirmaram presença`:''}">📅 ${r.hora} ${escapeHtml(r.titulo)}</div>`;
}

function reuniaoCard(r){
  return `<div class="flash-card reuniao">
    <div class="flash-sigla">📅 ${escapeHtml(r.titulo)}</div>
    <div class="flash-meta">${r.tipo==='grupo'?'Grupo':'Individual'} · ${reuniaoFaixa(r)}</div>
    <div class="flash-meta">${escapeHtml(reuniaoParticipantesLabel(r))}</div>
    ${presencaResumo(r)}
    <div class="flash-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
      ${r.link ? `<a class="btn btn-brand" href="${escapeHtml(normalizeUrl(r.link))}" target="_blank" rel="noopener noreferrer">Abrir link</a>` : ''}
      <button class="btn" data-editar-reuniao="${r.id}">Editar</button>
      <button class="btn btn-danger" data-excluir-reuniao="${r.id}">Excluir</button>
    </div>
  </div>`;
}

function reunioesDiaria(rows, dateStr){
  const doDia = rows.filter(r=>r.data===dateStr).sort((a,b)=>a.hora.localeCompare(b.hora));
  return `<div class="cal-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));">
    ${doDia.length===0 ? '<div class="empty">Nenhuma reunião nesse dia</div>' : doDia.map(reuniaoCard).join('')}
  </div>`;
}

function reunioesSemanal(rows, dateStr){
  const todayStr = hojeAgendaISO();
  const diaDaSemana = new Date(dateStr+'T00:00:00').getDay();
  const inicioSemana = addDaysISO(dateStr, -diaDaSemana);
  const header = WEEKDAY_LABELS.map(w=>`<div class="cal-weekday-header">${w}</div>`).join('');
  const cells = Array.from({length:7}, (_,i)=>{
    const ds = addDaysISO(inicioSemana, i);
    const doDia = rows.filter(r=>r.data===ds).sort((a,b)=>a.hora.localeCompare(b.hora));
    const dd = new Date(ds+'T00:00:00');
    const label = dd.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
    const isToday = ds===todayStr;
    return `<div class="cal-day-cell${isToday?' today':''}">
      <div class="cal-day-num${isToday?' today':''}" data-daypick="${ds}" data-target="reunioes">${label}</div>
      ${doDia.length===0 ? `<span style="color:var(--text-faint);font-size:11px;">Sem reunião</span>` : doDia.map(reuniaoChip).join('')}
    </div>`;
  }).join('');
  return `<div class="cal-grid" style="margin-bottom:6px;">${header}</div><div class="cal-grid cal-grid-semanal">${cells}</div>`;
}

function reunioesMensal(rows, dateStr){
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
    const doDia = rows.filter(r=>r.data===ds).sort((a,b)=>a.hora.localeCompare(b.hora));
    const isToday = ds===todayStr;
    cells += `<div class="cal-day-cell${isToday?' today':''}">
      <div class="cal-day-num${isToday?' today':''}" data-daypick="${ds}" data-target="reunioes">${day}</div>
      ${doDia.map(reuniaoChip).join('')}
    </div>`;
  }
  const trailing = (7 - ((startWeekday+daysInMonth) % 7)) % 7;
  for(let i=0;i<trailing;i++){
    cells += `<div class="cal-day-cell empty-cell"></div>`;
  }
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <button class="btn" data-monthnav="${prevDate}" data-target="reunioes">‹ Mês anterior</button>
    <div class="section-title" style="margin:0;">${MONTH_NAMES[month]} ${year}</div>
    <button class="btn" data-monthnav="${nextDate}" data-target="reunioes">Próximo mês ›</button>
  </div>
  <div class="cal-grid" style="margin-bottom:6px;">${WEEKDAY_LABELS.map(w=>`<div class="cal-weekday-header">${w}</div>`).join('')}</div>
  <div class="cal-grid">${cells}</div>`;
}

function supReunioes(myAnalistas){
  const rows = DB.reunioes.filter(r=>r.supervisorId===session.userId);
  const dateStr = uiState.reunioesDate;
  const view = uiState.reunioesView;
  return `
  <div class="page-head">
    <div>
      <h1 class="page-title" style="font-size:22px;">Reuniões</h1>
      <div class="page-desc">Visão ${view==='diaria'?'diária':view==='semanal'?'semanal':'mensal'} — clique num evento pra editar</div>
    </div>
    <div class="toggle-group" data-scope="reunioes">
      <button data-view="diaria" class="${view==='diaria'?'active':''}">Diária</button>
      <button data-view="semanal" class="${view==='semanal'?'active':''}">Semanal</button>
      <button data-view="mensal" class="${view==='mensal'?'active':''}">Mensal</button>
    </div>
  </div>
  <div class="csv-row">
    <span class="csv-label">Carga em massa de reuniões (Excel)</span>
    <button class="btn" id="btnBaixarModeloReuniao">⭳ Baixar modelo Excel</button>
    <label class="btn" style="margin:0;">⭱ Importar Excel<input type="file" accept=".xlsx,.xls" id="fileImportReuniao" style="display:none;"></label>
  </div>
  <div class="filter-row" style="align-items:center;margin-bottom:16px;">
    <input type="date" id="reunioesDatePick" value="${dateStr}" class="mono" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:8px;">
    <button class="btn btn-brand" id="btnNovaReuniao" style="margin-left:auto;">+ Nova reunião</button>
  </div>
  <div class="card" style="margin-bottom:22px;">
    ${view==='diaria' ? reunioesDiaria(rows, dateStr) : view==='semanal' ? reunioesSemanal(rows, dateStr) : reunioesMensal(rows, dateStr)}
  </div>`;
}


function supPlantao(){
  const rows = DB.plantoes.filter(p=>p.supervisorAusenteId===session.userId).sort((a,b)=>b.data.localeCompare(a.data));
  return `
  <div class="section-title">Plantão</div>
  <div class="help-text">Defina quem cobre sua ausência (Supervisor, Analista ou Coordenador) em uma data específica. A informação aparece para os analistas da sua equipe.</div>
  <div class="action-row-end" style="margin-bottom:14px;"><button class="btn btn-brand" id="btnNovoPlantao">+ Definir plantão</button></div>
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
    <div class="chip-row">${emFolga.map(c=>`<span class="chip-pessoa" title="${escapeHtml(operacoesFixasTooltip(c.id))}">${escapeHtml(c.name)}</span>`).join('')}</div>
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

  // Regional não vive no Raio-X (é do cadastro de SPR — sprs.regional, ver
  // regionalDaOperacao em utils.js) — resolve pelo supervisor do ANALISTA
  // de cada linha, não por session.userId: em coordResultadoSPR os
  // selecionados podem ser de supervisores diferentes, cada um com seu
  // próprio cadastro de SPR/Regional pra mesma operação.
  const regionalDoRaioX = r => {
    const supId = userById(r.analistaId)?.supervisorId;
    return supId ? regionalDaOperacao(supId, r.operacao, r.ciclo) : '';
  };
  const doPeriodoAmplo = DB.raioX.filter(noPeriodo)
    .filter(r=> flt.operacao==='all' || r.operacao===flt.operacao)
    .filter(r=> flt.regional==='all' || regionalDoRaioX(r)===flt.regional);
  const operacoesDisponiveis = [...new Set(DB.raioX.filter(noPeriodo).map(r=>r.operacao))].sort();
  const regionaisDisponiveis = [...new Set(DB.raioX.filter(noPeriodo).map(regionalDoRaioX).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));

  const semanasDisponiveis = [...new Set(doPeriodoAmplo.map(r=>weekStartISO(r.data)))].sort();

  // Filtro de semana específica (opcional) — só restringe o resto da
  // tela (stats, tabela, gráficos por hub), não a linha do tempo acima.
  const doPeriodo = flt.semana ? doPeriodoAmplo.filter(r=>weekStartISO(r.data)===flt.semana) : doPeriodoAmplo;

  const comMeta = doPeriodo.filter(r=>r.sprMeta!=null);
  const semMeta = doPeriodo.length - comMeta.length;

  // KPIs consolidados — a meta agora é o valor ABSOLUTO (média de SPR
  // lançado x REF e o delta entre eles), não a taxa de quem bateu ou não.
  const totalOps = comMeta.length;
  const roteirizadoMedioGeral = totalOps ? comMeta.reduce((s,r)=>s+r.sprRoteirizado,0)/totalOps : 0;
  const metaMedioGeral = totalOps ? comMeta.reduce((s,r)=>s+r.sprMeta,0)/totalOps : 0;
  const deltaMedioGeral = totalOps ? comMeta.reduce((s,r)=>s+(r.sprRoteirizado-r.sprMeta),0)/totalOps : 0;

  // Detalhamento por Operação (hub) + Analista que roteirizou — uma linha
  // por combinação, agrupada/ordenada por operação. As médias (SPR
  // cadastrado/lançado/delta) cobrem o caso de o mesmo par operação+analista
  // ter mais de uma finalização no período.
  const porOperacaoAnalista = {};
  comMeta.forEach(r=>{
    const nome = userById(r.analistaId)?.name || '—';
    const chave = r.operacao+'||'+nome;
    if(!porOperacaoAnalista[chave]) porOperacaoAnalista[chave] = { operacao:r.operacao, nome, analistaId:r.analistaId, total:0, deltaSoma:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porOperacaoAnalista[chave];
    d.total++;
    d.deltaSoma += (r.sprRoteirizado - r.sprMeta);
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const detalhe = Object.values(porOperacaoAnalista).map(d=>({
    operacao:d.operacao, nome:d.nome, analistaId:d.analistaId, total:d.total,
    deltaMedio: d.total ? d.deltaSoma/d.total : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=> a.operacao.localeCompare(b.operacao) || a.nome.localeCompare(b.nome));

  // Agregado por Operação (todos os analistas juntos) — alimenta os
  // gráficos por hub abaixo.
  const porOperacao = {};
  comMeta.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = { total:0, deltaSoma:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porOperacao[r.operacao];
    d.total++;
    d.deltaSoma += (r.sprRoteirizado - r.sprMeta);
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const porHub = Object.entries(porOperacao).map(([operacao,d])=>({
    operacao, total:d.total,
    deltaMedio: d.total ? d.deltaSoma/d.total : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=>a.operacao.localeCompare(b.operacao));

  // Oportunidades (menor SPR Lançado) e destaques (maior) — top 5 de cada
  // lado, por operação, direto pelo valor absoluto (sem comparar com a
  // meta/delta — só ranking de menor pra maior).
  const oportunidades = [...porHub].sort((a,b)=>a.roteirizadoMedio-b.roteirizadoMedio).slice(0,5);
  const destaques = [...porHub].sort((a,b)=>b.roteirizadoMedio-a.roteirizadoMedio).slice(0,5);
  const maxRoteirizadoHub = Math.max(1, ...porHub.map(h=>h.roteirizadoMedio));
  const hubsForaMeta = porHub.filter(h=>h.deltaMedio<0).length;

  // Tendência do card de KPI: compara a média de SPR Lançado do período
  // exibido com a de uma janela anterior de mesmo tamanho, imediatamente
  // antes dela — funciona tanto pro período inteiro quanto pra uma semana
  // específica selecionada no filtro (janela vira 7 dias nesse caso).
  const efetivoInicio = flt.semana || inicio;
  const efetivoFim = flt.semana ? addDaysISO(flt.semana,6) : fim;
  const diasNoPeriodo = Math.round((new Date(efetivoFim+'T00:00:00') - new Date(efetivoInicio+'T00:00:00'))/86400000) + 1;
  const inicioAnterior = addDaysISO(efetivoInicio, -diasNoPeriodo);
  const fimAnterior = addDaysISO(efetivoInicio, -1);
  const comMetaAnterior = DB.raioX.filter(r=> (r.data||'')>=inicioAnterior && (r.data||'')<=fimAnterior && ids.has(r.analistaId) && (flt.operacao==='all' || r.operacao===flt.operacao) && (flt.regional==='all' || regionalDoRaioX(r)===flt.regional) && r.sprMeta!=null);
  const roteirizadoMedioAnterior = comMetaAnterior.length ? comMetaAnterior.reduce((s,r)=>s+r.sprRoteirizado,0)/comMetaAnterior.length : null;
  const tendenciaPct = roteirizadoMedioAnterior ? ((roteirizadoMedioGeral-roteirizadoMedioAnterior)/roteirizadoMedioAnterior)*100 : null;

  // Média por Analista (agregado, cruzando todas as operações dele no
  // período) e Média por Dia (consolidado, todas as operações do dia).
  const porAnalistaAgg = {};
  comMeta.forEach(r=>{
    const nome = userById(r.analistaId)?.name || '—';
    if(!porAnalistaAgg[r.analistaId]) porAnalistaAgg[r.analistaId] = { nome, analistaId:r.analistaId, total:0, deltaSoma:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porAnalistaAgg[r.analistaId];
    d.total++;
    d.deltaSoma += (r.sprRoteirizado - r.sprMeta);
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const porAnalista = Object.values(porAnalistaAgg).map(d=>({
    nome:d.nome, analistaId:d.analistaId, total:d.total,
    deltaMedio: d.total ? d.deltaSoma/d.total : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=>a.deltaMedio-b.deltaMedio);

  const porDiaAgg = {};
  comMeta.forEach(r=>{
    if(!porDiaAgg[r.data]) porDiaAgg[r.data] = { total:0, deltaSoma:0, roteirizadoSoma:0, metaSoma:0 };
    const d = porDiaAgg[r.data];
    d.total++;
    d.deltaSoma += (r.sprRoteirizado - r.sprMeta);
    d.roteirizadoSoma += r.sprRoteirizado;
    d.metaSoma += r.sprMeta;
  });
  const porDia = Object.entries(porDiaAgg).map(([data,d])=>({
    data, total:d.total,
    deltaMedio: d.total ? d.deltaSoma/d.total : 0,
    roteirizadoMedio: d.total ? d.roteirizadoSoma/d.total : 0,
    metaMedio: d.total ? d.metaSoma/d.total : 0,
  })).sort((a,b)=>b.data.localeCompare(a.data));
  // Mesma agregação, ordem cronológica (mais antigo primeiro) — alimenta os
  // dois gráficos "por dia" abaixo, que leem da esquerda pra direita.
  const porDiaAsc = [...porDia].reverse().map(d=>({...d, label:formatarDataCurta(d.data)}));

  // Ranking por SPR Lançado (cada operação finalizada, não agregada) — pro
  // relatório de fim de turno: quem ficou muito abaixo/acima da meta.
  // sprMin/sprMax (uiState.sprFiltro) são opcionais e independentes — só
  // mínimo mostra "120+", só máximo mostra "até X", os dois juntos uma
  // faixa. Semrotirização não entra (sprRoteirizado fica 0, sem sentido
  // rankear). Usa doPeriodo (não comMeta) — sem meta cadastrada ainda
  // aparece no ranking (SPR REF fica "—"), só não teria como comparar.
  const sprMinNum = flt.sprMin!=='' && flt.sprMin!=null ? Number(flt.sprMin) : null;
  const sprMaxNum = flt.sprMax!=='' && flt.sprMax!=null ? Number(flt.sprMax) : null;
  const ranking = doPeriodo
    .filter(r=>!r.semRoteirizacao && r.sprRoteirizado!=null)
    .filter(r=> sprMinNum==null || r.sprRoteirizado>=sprMinNum)
    .filter(r=> sprMaxNum==null || r.sprRoteirizado<=sprMaxNum)
    .slice()
    .sort((a,b)=>b.sprRoteirizado-a.sprRoteirizado);

  sprChartData = {
    porDiaAsc,
    porHub,
  };
  sprExportRows = uiState.sprView==='ranking' ? ranking : comMeta;

  return `
  <div class="filter-row" style="align-items:center;margin-bottom:16px;">
    <div class="toggle-group" data-scope="spr-view">
      <button data-sprview="painel" class="${uiState.sprView==='painel'?'active':''}">Painel</button>
      <button data-sprview="ranking" class="${uiState.sprView==='ranking'?'active':''}">Ranking SPR</button>
    </div>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-sprfiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-sprfiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <input type="text" list="sprOperacaoList" data-sprfiltro="operacao" placeholder="Operação: todas" value="${flt.operacao!=='all' ? escapeHtml(flt.operacao) : ''}" style="min-width:220px;">
    <datalist id="sprOperacaoList">
      ${operacoesDisponiveis.map(op=>`<option value="${escapeHtml(op)}">`).join('')}
    </datalist>
    <select data-sprfiltro="regional">
      <option value="all">Regional: todas</option>
      ${regionaisDisponiveis.map(r=>`<option value="${escapeHtml(r)}" ${flt.regional===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
    </select>
    <select data-sprfiltro="semana">
      <option value="">Semana: todas (${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)})</option>
      ${semanasDisponiveis.map(ws=>`<option value="${ws}" ${flt.semana===ws?'selected':''}>Semana ${formatarDataCurta(ws)}–${formatarDataCurta(addDaysISO(ws,6))}</option>`).join('')}
    </select>
    ${uiState.sprView==='ranking' ? `
    <input type="number" data-sprfiltro="sprMin" placeholder="SPR mín. (ex: 120)" value="${escapeHtml(String(flt.sprMin))}" style="width:150px;">
    <input type="number" data-sprfiltro="sprMax" placeholder="SPR máx." value="${escapeHtml(String(flt.sprMax))}" style="width:120px;">
    ` : ''}
    ${picker}
    <button class="btn" id="btnExportSPR">⬇ Exportar Excel</button>
  </div>
  ${uiState.sprView==='ranking' ? sprRankingTableHtml(ranking, flt) : `
  <div class="grid-4" style="margin-bottom:16px;">
    <div class="stat-card"><div class="stat-num">${roteirizadoMedioGeral.toFixed(1)}</div><div class="stat-label">Média SPR Lançado <span style="color:var(--text-faint);">(REF ${metaMedioGeral.toFixed(1)})</span></div></div>
    <div class="stat-card">
      <div class="stat-num" style="color:${deltaMedioGeral>=0?'var(--done)':'var(--alert)'};">${deltaMedioGeral>=0?'+':''}${deltaMedioGeral.toFixed(1)}</div>
      <div class="stat-label">Delta médio consolidado</div>
      ${tendenciaPct!=null ? `<div class="trend-chip${tendenciaPct<0?' down':''}">${tendenciaPct>=0?'↑':'↓'} ${tendenciaPct>=0?'+':''}${tendenciaPct.toFixed(1)}% <span style="color:var(--text-faint);font-weight:400;">vs. período anterior</span></div>` : ''}
    </div>
    <div class="stat-card"><div class="stat-num">${totalOps}</div><div class="stat-label">Operações analisadas</div></div>
    <div class="stat-card"><div class="stat-num">${hubsForaMeta} <span style="font-size:19px;color:var(--text-faint);">de ${porHub.length}</span></div><div class="stat-label">Operações fora da meta</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:20px;align-items:start;">
    <div class="chart-card"><div class="section-title">Linha do tempo — trajetória de SPR dia a dia</div><canvas id="chartSprSemanas"></canvas></div>
    <div class="chart-card"><div class="section-title">Gap para a referência (delta diário)</div><canvas id="chartSprGap"></canvas></div>
    <div class="chart-card">
      <div class="section-title">Oportunidades e destaques <span style="color:var(--text-faint);text-transform:none;letter-spacing:0;">(por operação, SPR Lançado — menores e maiores, sem comparar com a meta)</span></div>
      <div class="grid-2" style="gap:18px;">
        <div>
          <div style="font-size:11px;color:var(--alert);font-weight:600;margin-bottom:8px;">▾ Menores SPR</div>
          <div class="mover-list">${oportunidades.map(h=>`<div class="mover-row">
              <span class="mover-name" title="${escapeHtml(h.operacao)}">${escapeHtml(h.operacao)}</span>
              <span class="mover-delta neg">${h.roteirizadoMedio.toFixed(1)}</span>
              <div class="mover-bar-wrap"><div class="mover-bar neg" style="width:${h.roteirizadoMedio/maxRoteirizadoHub*100}%;"></div></div>
            </div>`).join('') || '<div class="help-text" style="margin:0;">Nenhuma operação no período</div>'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--done);font-weight:600;margin-bottom:8px;">▴ Maiores SPR</div>
          <div class="mover-list">${destaques.map(h=>`<div class="mover-row">
              <span class="mover-name" title="${escapeHtml(h.operacao)}">${escapeHtml(h.operacao)}</span>
              <span class="mover-delta pos">${h.roteirizadoMedio.toFixed(1)}</span>
              <div class="mover-bar-wrap"><div class="mover-bar pos" style="width:${h.roteirizadoMedio/maxRoteirizadoHub*100}%;"></div></div>
            </div>`).join('') || '<div class="help-text" style="margin:0;">Nenhuma operação no período</div>'}</div>
        </div>
      </div>
    </div>
    <div class="chart-card"><div class="section-title">SPR Lançado x REF por dia</div><canvas id="chartSprMedia"></canvas></div>
  </div>
  <div class="card" style="margin-bottom:20px;">
  <div class="section-title">Detalhamento por operação</div>
  <table><thead><tr><th>Operação</th><th>Analista</th><th>SPR REF</th><th>SPR Lançado</th><th>Delta médio</th></tr></thead><tbody>
  ${detalhe.map(d=>`<tr><td>${escapeHtml(d.operacao)}</td><td style="cursor:pointer;" data-analista-timeline="${d.analistaId}" title="Ver histórico">${escapeHtml(d.nome)}</td><td class="mono">${d.metaMedio.toFixed(1)}</td><td class="mono">${d.roteirizadoMedio.toFixed(1)}</td><td class="mono" style="color:${d.deltaMedio>=0?'var(--done)':'var(--alert)'};">${d.deltaMedio>=0?'+':''}${d.deltaMedio.toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem finalizações com meta cadastrada no período</td></tr>'}
  </tbody></table>
  ${semMeta>0 ? `<div class="help-text" style="margin-top:10px;">${semMeta} finalização(ões) no período sem meta SPR cadastrada pra operação/ciclo — não entram nesse cálculo.</div>` : ''}
  </div>
  <div class="grid-2" style="align-items:start;">
  <div class="card">
  <div class="section-title">Média por analista</div>
  <table><thead><tr><th>Analista</th><th>Qtd</th><th>SPR REF</th><th>SPR Lançado</th><th>Delta médio</th></tr></thead><tbody>
  ${porAnalista.map(a=>`<tr><td style="cursor:pointer;" data-analista-timeline="${a.analistaId}" title="Ver histórico">${escapeHtml(a.nome)}</td><td class="mono">${a.total}</td><td class="mono">${a.metaMedio.toFixed(1)}</td><td class="mono">${a.roteirizadoMedio.toFixed(1)}</td><td class="mono" style="color:${a.deltaMedio>=0?'var(--done)':'var(--alert)'};">${a.deltaMedio>=0?'+':''}${a.deltaMedio.toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem dados no período</td></tr>'}
  </tbody></table>
  </div>
  <div class="card">
  <div class="section-title">Média por dia (consolidado)</div>
  <div style="max-height:320px;overflow-y:auto;">
  <table><thead><tr><th>Data</th><th>Qtd</th><th>SPR REF</th><th>SPR Lançado</th><th>Delta médio</th></tr></thead><tbody>
  ${porDia.map(d=>`<tr><td class="mono">${formatarDataCurta(d.data)}</td><td class="mono">${d.total}</td><td class="mono">${d.metaMedio.toFixed(1)}</td><td class="mono">${d.roteirizadoMedio.toFixed(1)}</td><td class="mono" style="color:${d.deltaMedio>=0?'var(--done)':'var(--alert)'};">${d.deltaMedio>=0?'+':''}${d.deltaMedio.toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem dados no período</td></tr>'}
  </tbody></table>
  </div>
  </div>
  </div>`}`;
}

// Ranking SPR (sprResultadoBody acima): cada operação finalizada, ordenada
// por SPR Lançado — pensado pra copiar/exportar rápido no fim do turno.
// flt.sprMin/flt.sprMax já filtraram "ranking" antes de chegar aqui; o
// texto do cabeçalho só reflete o que foi aplicado, pra ficar claro no
// print/relatório qual corte foi usado.
function sprRankingTableHtml(ranking, flt){
  const faixaTexto = flt.sprMin!=='' && flt.sprMax!==''
    ? `entre ${flt.sprMin} e ${flt.sprMax}`
    : flt.sprMin!=='' ? `${flt.sprMin}+`
    : flt.sprMax!=='' ? `até ${flt.sprMax}`
    : 'todas';
  return `
  <div class="card">
  <div class="section-title">Ranking por SPR Lançado <span style="color:var(--text-faint);text-transform:none;letter-spacing:0;">(${ranking.length} operação(ões) · faixa: ${escapeHtml(faixaTexto)})</span></div>
  <table><thead><tr><th>#</th><th>Operação</th><th>Ciclo</th><th>Hora</th><th>SPR Lançado</th><th>SPR REF</th><th>Delta</th><th>Observação</th></tr></thead><tbody>
  ${ranking.map((r,idx)=>{
    const delta = r.sprMeta!=null ? r.sprRoteirizado-r.sprMeta : null;
    const ciclo = r.ciclo || cicloDaOperacaoHistorico(r.operacao, r.analistaId);
    return `<tr>
      <td class="mono" style="color:var(--text-faint);">${idx+1}</td>
      <td title="Analista: ${escapeHtml(userById(r.analistaId)?.name||'—')}">${escapeHtml(r.operacao)}</td>
      <td class="mono">${escapeHtml(ciclo||'—')}</td>
      <td class="mono">${r.data} ${r.hora}</td>
      <td class="mono" style="font-weight:700;color:${delta==null?'var(--text)':delta>=0?'var(--done)':'var(--alert)'};">${r.sprRoteirizado}</td>
      <td class="mono">${r.sprMeta!=null ? r.sprMeta : '—'}</td>
      <td class="mono" style="color:${delta==null?'var(--text-faint)':delta>=0?'var(--done)':'var(--alert)'};">${delta==null?'—':(delta>=0?'+':'')+delta.toFixed(1)}</td>
      <td><span class="obs-truncate obs-truncate-wide" title="${escapeHtml(r.observacao||'')}">${escapeHtml(r.observacao||'—')}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">Nenhuma operação nessa faixa de SPR no período</td></tr>'}
  </tbody></table>
  </div>`;
}

function exportarSPR(){
  // sprMeta pode faltar no Ranking (lá não é pré-filtrado por "tem meta",
  // ver sprResultadoBody) — sem essa checagem o delta virava "NaN" na planilha.
  const linhas = sprExportRows.map(r=>[userById(r.analistaId)?.name||'—', r.operacao, r.ciclo || cicloDaOperacaoHistorico(r.operacao, r.analistaId) || '—', r.data, r.hora, r.sprRoteirizado, r.sprMeta ?? '—', r.sprMeta!=null ? (r.sprRoteirizado-r.sprMeta).toFixed(1) : '—', r.observacao||'']);
  exportarRelatorioExcel(`resultado-spr_${uiState.sprFiltro.inicio}_a_${uiState.sprFiltro.fim}.xlsx`, ['Analista','Operação','Ciclo','Data','Hora','SPR Lançado','SPR REF','Delta','Observação'], linhas);
}

// Tela irmã do Resultado SPR (sprResultadoBody acima) — mesmo layout, dados
// vêm do duracaoSegundos em raio_x (preenchido pela planilha de
// roteirização importada, ver planilhaImport.controller.js) em vez do SPR.
// Diferença central: aqui existe
// um SLA fixo (SLA_TEMPO_EXECUCAO_SEGUNDOS, utils.js — 1h pra toda
// operação), não uma meta cadastrada por operação como o SPR REF.
let tempoChartData = null;
let tempoExportRows = [];

function tempoExecucaoBody(selecionados, picker){
  const flt = uiState.tempoFiltro;
  const inicio = flt.inicio || addDaysISO(todayISO(), -30);
  const fim = flt.fim || todayISO();
  const ids = new Set(selecionados.map(a=>a.id));
  const noPeriodo = r => (r.data||'')>=inicio && (r.data||'')<=fim && ids.has(r.analistaId);

  const doPeriodoAmplo = DB.raioX.filter(noPeriodo).filter(r=> flt.operacao==='all' || r.operacao===flt.operacao).filter(r=>r.duracaoSegundos!=null);
  const operacoesDisponiveis = [...new Set(DB.raioX.filter(noPeriodo).map(r=>r.operacao))].sort();
  const semanasDisponiveis = [...new Set(doPeriodoAmplo.map(r=>weekStartISO(r.data)))].sort();

  const doPeriodo = flt.semana ? doPeriodoAmplo.filter(r=>weekStartISO(r.data)===flt.semana) : doPeriodoAmplo;

  const totalExecucoes = doPeriodo.length;
  const tempoMedioGeral = totalExecucoes ? doPeriodo.reduce((s,r)=>s+r.duracaoSegundos,0)/totalExecucoes : 0;

  const porOperacaoAnalista = {};
  doPeriodo.forEach(r=>{
    const nome = userById(r.analistaId)?.name || '—';
    const chave = r.operacao+'||'+nome;
    if(!porOperacaoAnalista[chave]) porOperacaoAnalista[chave] = { operacao:r.operacao, nome, analistaId:r.analistaId, total:0, soma:0 };
    const d = porOperacaoAnalista[chave];
    d.total++; d.soma += r.duracaoSegundos;
  });
  const detalhe = Object.values(porOperacaoAnalista).map(d=>({
    operacao:d.operacao, nome:d.nome, analistaId:d.analistaId, total:d.total,
    tempoMedio: d.total ? d.soma/d.total : 0,
  })).sort((a,b)=> a.operacao.localeCompare(b.operacao) || a.nome.localeCompare(b.nome));

  const porOperacao = {};
  doPeriodo.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = { total:0, soma:0 };
    const d = porOperacao[r.operacao];
    d.total++; d.soma += r.duracaoSegundos;
  });
  const porHub = Object.entries(porOperacao).map(([operacao,d])=>({
    operacao, total:d.total, tempoMedio: d.total ? d.soma/d.total : 0,
  })).sort((a,b)=>a.operacao.localeCompare(b.operacao));

  const agiles = [...porHub].filter(h=>h.tempoMedio<SLA_TEMPO_EXECUCAO_SEGUNDOS).sort((a,b)=>a.tempoMedio-b.tempoMedio).slice(0,5);
  const lentas = [...porHub].filter(h=>h.tempoMedio>SLA_TEMPO_EXECUCAO_SEGUNDOS).sort((a,b)=>b.tempoMedio-a.tempoMedio).slice(0,5);
  const maxAbsDeltaHub = Math.max(1, ...porHub.map(h=>Math.abs(h.tempoMedio-SLA_TEMPO_EXECUCAO_SEGUNDOS)));
  const operacoesAcimaSLA = porHub.filter(h=>h.tempoMedio>SLA_TEMPO_EXECUCAO_SEGUNDOS).length;

  // Tendência: mesmo esquema do Resultado SPR — compara com uma janela
  // anterior de mesmo tamanho, sensível ao filtro de semana (ver
  // sprResultadoBody acima pro comentário completo).
  const efetivoInicio = flt.semana || inicio;
  const efetivoFim = flt.semana ? addDaysISO(flt.semana,6) : fim;
  const diasNoPeriodo = Math.round((new Date(efetivoFim+'T00:00:00') - new Date(efetivoInicio+'T00:00:00'))/86400000) + 1;
  const inicioAnterior = addDaysISO(efetivoInicio, -diasNoPeriodo);
  const fimAnterior = addDaysISO(efetivoInicio, -1);
  const anteriores = DB.raioX.filter(r=> (r.data||'')>=inicioAnterior && (r.data||'')<=fimAnterior && ids.has(r.analistaId) && (flt.operacao==='all' || r.operacao===flt.operacao) && r.duracaoSegundos!=null);
  const tempoMedioAnterior = anteriores.length ? anteriores.reduce((s,r)=>s+r.duracaoSegundos,0)/anteriores.length : null;
  const tendenciaPct = tempoMedioAnterior ? ((tempoMedioGeral-tempoMedioAnterior)/tempoMedioAnterior)*100 : null;

  const porDiaAgg = {};
  doPeriodo.forEach(r=>{
    if(!porDiaAgg[r.data]) porDiaAgg[r.data] = { total:0, soma:0 };
    const d = porDiaAgg[r.data];
    d.total++; d.soma += r.duracaoSegundos;
  });
  const porDia = Object.entries(porDiaAgg).map(([data,d])=>({
    data, total:d.total, tempoMedio: d.total ? d.soma/d.total : 0,
  })).sort((a,b)=>b.data.localeCompare(a.data));
  const porDiaAsc = [...porDia].reverse().map(d=>({...d, label:formatarDataCurta(d.data)}));

  tempoChartData = { porDiaAsc, porHub };
  tempoExportRows = doPeriodo;

  const tempoBadge = segundos => segundos>SLA_TEMPO_EXECUCAO_SEGUNDOS
    ? `<span style="color:var(--alert);font-weight:700;">${formatarDuracao(segundos)}</span>`
    : `<span style="color:var(--done);font-weight:700;">${formatarDuracao(segundos)}</span>`;

  return `
  <div class="filter-row" style="margin-bottom:16px;">
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Início
      <input type="date" data-tempofiltro="inicio" value="${inicio}" max="${fim}">
    </label>
    <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">Fim
      <input type="date" data-tempofiltro="fim" value="${fim}" min="${inicio}">
    </label>
    <input type="text" list="tempoOperacaoList" data-tempofiltro="operacao" placeholder="Operação: todas" value="${flt.operacao!=='all' ? escapeHtml(flt.operacao) : ''}" style="min-width:220px;">
    <datalist id="tempoOperacaoList">
      ${operacoesDisponiveis.map(op=>`<option value="${escapeHtml(op)}">`).join('')}
    </datalist>
    <select data-tempofiltro="semana">
      <option value="">Semana: todas (${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)})</option>
      ${semanasDisponiveis.map(ws=>`<option value="${ws}" ${flt.semana===ws?'selected':''}>Semana ${formatarDataCurta(ws)}–${formatarDataCurta(addDaysISO(ws,6))}</option>`).join('')}
    </select>
    ${picker}
    <button class="btn" id="btnExportTempo">⬇ Exportar Excel</button>
  </div>
  <div class="grid-4" style="margin-bottom:16px;">
    <div class="stat-card">
      <div class="stat-num" style="color:${tempoMedioGeral>SLA_TEMPO_EXECUCAO_SEGUNDOS?'var(--alert)':'var(--done)'};">${formatarDuracao(Math.round(tempoMedioGeral))}</div>
      <div class="stat-label">Tempo médio de execução <span style="color:var(--text-faint);">(SLA 1h)</span></div>
      ${tendenciaPct!=null ? `<div class="trend-chip${tendenciaPct>0?' down':''}">${tendenciaPct<=0?'↓':'↑'} ${tendenciaPct>=0?'+':''}${tendenciaPct.toFixed(1)}% <span style="color:var(--text-faint);font-weight:400;">vs. período anterior</span></div>` : ''}
    </div>
    <div class="stat-card"><div class="stat-num">${totalExecucoes}</div><div class="stat-label">Execuções com tempo registrado</div></div>
    <div class="stat-card"><div class="stat-num">${operacoesAcimaSLA} <span style="font-size:19px;color:var(--text-faint);">de ${porHub.length}</span></div><div class="stat-label">Operações acima do SLA</div></div>
    <div class="stat-card"><div class="stat-num">${formatarDuracao(SLA_TEMPO_EXECUCAO_SEGUNDOS)}</div><div class="stat-label">SLA (todas as operações)</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:20px;align-items:start;">
    <div class="chart-card"><div class="section-title">Linha do tempo — trajetória de tempo médio dia a dia</div><canvas id="chartTempoLinha"></canvas></div>
    <div class="chart-card"><div class="section-title">Gap para o SLA <span style="color:var(--text-faint);text-transform:none;letter-spacing:0;">(1h, por dia)</span></div><canvas id="chartTempoGap"></canvas></div>
    <div class="chart-card">
      <div class="section-title">Mais ágeis e mais lentas <span style="color:var(--text-faint);text-transform:none;letter-spacing:0;">(por operação, vs. SLA de 1h)</span></div>
      <div class="grid-2" style="gap:18px;">
        <div>
          <div style="font-size:11px;color:var(--alert);font-weight:600;margin-bottom:8px;">▾ Mais lentas</div>
          <div class="mover-list">${lentas.map(h=>`<div class="mover-row">
              <span class="mover-name" title="${escapeHtml(h.operacao)}">${escapeHtml(h.operacao)}</span>
              <span class="mover-delta neg">+${formatarDuracao(Math.round(h.tempoMedio-SLA_TEMPO_EXECUCAO_SEGUNDOS))}</span>
              <div class="mover-bar-wrap"><div class="mover-bar neg" style="width:${Math.abs(h.tempoMedio-SLA_TEMPO_EXECUCAO_SEGUNDOS)/maxAbsDeltaHub*100}%;"></div></div>
            </div>`).join('') || '<div class="help-text" style="margin:0;">Nenhuma operação acima do SLA</div>'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--done);font-weight:600;margin-bottom:8px;">▴ Mais ágeis</div>
          <div class="mover-list">${agiles.map(h=>`<div class="mover-row">
              <span class="mover-name" title="${escapeHtml(h.operacao)}">${escapeHtml(h.operacao)}</span>
              <span class="mover-delta pos">-${formatarDuracao(Math.round(SLA_TEMPO_EXECUCAO_SEGUNDOS-h.tempoMedio))}</span>
              <div class="mover-bar-wrap"><div class="mover-bar pos" style="width:${Math.abs(h.tempoMedio-SLA_TEMPO_EXECUCAO_SEGUNDOS)/maxAbsDeltaHub*100}%;"></div></div>
            </div>`).join('') || '<div class="help-text" style="margin:0;">Nenhuma operação abaixo do SLA</div>'}</div>
        </div>
      </div>
    </div>
    <div class="chart-card"><div class="section-title">Tempo médio por dia</div><canvas id="chartTempoBarras"></canvas></div>
  </div>
  <div class="card">
  <div class="section-title">Detalhamento por operação</div>
  <table><thead><tr><th>Operação</th><th>Analista</th><th>Tempo médio</th><th>Execuções</th></tr></thead><tbody>
  ${detalhe.map(d=>`<tr><td>${escapeHtml(d.operacao)}</td><td style="cursor:pointer;" data-analista-timeline="${d.analistaId}" title="Ver histórico">${escapeHtml(d.nome)}</td><td class="mono">${tempoBadge(Math.round(d.tempoMedio))}</td><td class="mono">${d.total}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sem execuções com tempo registrado no período</td></tr>'}
  </tbody></table>
  </div>`;
}

function exportarTempo(){
  const linhas = tempoExportRows.map(r=>[userById(r.analistaId)?.name||'—', r.operacao, r.data, r.hora, formatarDuracao(r.duracaoSegundos), r.duracaoOrigem||'—']);
  exportarRelatorioExcel(`tempo-execucao_${uiState.tempoFiltro.inicio}_a_${uiState.tempoFiltro.fim}.xlsx`, ['Analista','Operação','Data','Hora','Tempo de execução','Origem'], linhas);
}

// Mesmo padrão de renderSPRCharts() acima — destrói as instâncias antigas e
// não faz nada fora da tela de Tempo de Execução. "SLA (1h)" entra como uma
// segunda linha reta no gráfico de trajetória, mesmo truque do "SPR REF" no
// gráfico irmão.
let tempoChartInstances = {};
function renderTempoCharts(){
  Object.values(tempoChartInstances).forEach(c=>c.destroy());
  tempoChartInstances = {};
  const elLinha = document.getElementById('chartTempoLinha');
  if(!elLinha || !tempoChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';
  const slaMin = SLA_TEMPO_EXECUCAO_SEGUNDOS/60;
  const minutos = seg => Number((seg/60).toFixed(1));

  tempoChartInstances.linha = new Chart(elLinha, {
    type:'line',
    data:{ labels: tempoChartData.porDiaAsc.map(d=>d.label), datasets:[
      { label:'Tempo médio (min)', data: tempoChartData.porDiaAsc.map(d=>minutos(d.tempoMedio)), borderColor:'#2F80ED', backgroundColor:'rgba(47,128,237,0.15)', fill:true, tension:0.3 },
      { label:'SLA (1h)', data: tempoChartData.porDiaAsc.map(()=>slaMin), borderColor:'#A8A8A8', borderDash:[5,4], pointRadius:0, fill:false },
    ] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } }, scales:{
      x:{ ticks:{ color:textColor }, grid:{ display:false } },
      y:{ ticks:{ color:textColor, callback:v=>v+'min' }, grid:{ color:gridColor } } } }
  });

  const elGap = document.getElementById('chartTempoGap');
  if(elGap){
    const gaps = tempoChartData.porDiaAsc.map(d=>Number((minutos(d.tempoMedio)-slaMin).toFixed(1)));
    tempoChartInstances.gap = new Chart(elGap, {
      type:'bar',
      data:{ labels: tempoChartData.porDiaAsc.map(d=>d.label), datasets:[
        { label:'Gap pro SLA (min)', data: gaps, backgroundColor: gaps.map(v=> v<=0 ? '#2FAE60' : '#D9362E'), borderRadius:4 },
      ] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, callback:v=>v+'min' }, grid:{ color:gridColor } } } }
    });
  }

  const elBarras = document.getElementById('chartTempoBarras');
  if(elBarras){
    tempoChartInstances.barras = new Chart(elBarras, {
      type:'bar',
      data:{ labels: tempoChartData.porDiaAsc.map(d=>d.label), datasets:[
        { label:'Tempo médio (min)', data: tempoChartData.porDiaAsc.map(d=>minutos(d.tempoMedio)), backgroundColor: tempoChartData.porDiaAsc.map(d=> d.tempoMedio>SLA_TEMPO_EXECUCAO_SEGUNDOS ? '#D9362E' : '#2F80ED'), borderRadius:4 },
      ] },
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ ticks:{ color:textColor, callback:v=>v+'min' }, grid:{ color:gridColor } } } }
    });
  }
}

function tempoAnalistaPicker(myAnalistas){
  const flt = uiState.tempoFiltro;
  return `<div class="multiselect">
      <button type="button" class="multiselect-btn" id="btnTempoAnalistaToggle">
        <span>${flt.analistas.length===0 ? 'Todos os analistas' : `${flt.analistas.length} analista(s) selecionado(s)`}</span>
        <span>▾</span>
      </button>
      ${uiState.tempoAnalistaDropdownOpen ? `
      <div class="multiselect-panel">
        <label><input type="checkbox" id="tempoAnalistaTodos" ${flt.analistas.length===0?'checked':''}> <b>Todos</b></label>
        <div class="msep"></div>
        ${myAnalistas.map(a=>`<label><input type="checkbox" class="tempoAnalistaChk" value="${a.id}" ${flt.analistas.includes(a.id)?'checked':''}> ${escapeHtml(a.name)}</label>`).join('') || '<div class="help-text" style="margin:6px 8px;">Nenhum analista cadastrado</div>'}
      </div>` : ''}
    </div>`;
}

function supTempoExecucao(myAnalistas){
  const flt = uiState.tempoFiltro;
  const selecionados = flt.analistas.length ? myAnalistas.filter(a=>flt.analistas.includes(a.id)) : myAnalistas;
  return tempoExecucaoBody(selecionados, tempoAnalistaPicker(myAnalistas));
}

// Escreve o valor de cada barra dentro dela mesma, grande e sem precisar
// passar o mouse — pensado pra print/report (Gap e SPR Lançado x REF).
// Contorno escuro atrás do texto branco pra ficar legível em qualquer cor
// de barra (vermelho, verde, azul ou cinza).
const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart){
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((dataset, dsIndex)=>{
      const meta = chart.getDatasetMeta(dsIndex);
      if(meta.hidden) return;
      meta.data.forEach((bar, idx)=>{
        const raw = dataset.data[idx];
        if(raw==null || bar.y==null || bar.base==null) return;
        const label = Number(raw).toFixed(1);
        const midY = (bar.y + bar.base) / 2;
        const barHeight = Math.abs(bar.base - bar.y);
        // Reduz a fonte quando a barra é estreita (muitos dias/barras
        // agrupadas no período) — sem isso o texto de barras vizinhas se
        // atropela. Nunca some: sempre desenha, só encolhe.
        let fontSize = Math.max(10, Math.min(17, barHeight - 8));
        ctx.font = `700 ${fontSize}px 'Inter', sans-serif`;
        const maxWidth = (bar.width || 24) - 4;
        const textWidth = ctx.measureText(label).width;
        if(textWidth > maxWidth && maxWidth > 0){
          fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
          ctx.font = `700 ${fontSize}px 'Inter', sans-serif`;
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(label, bar.x, midY);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, bar.x, midY);
      });
    });
    ctx.restore();
  }
};

// Mesmo padrão de renderMetricasCharts() — destrói as instâncias antigas e
// não faz nada fora da tela de Resultado SPR.
let sprChartInstances = {};
function renderSPRCharts(){
  Object.values(sprChartInstances).forEach(c=>c.destroy());
  sprChartInstances = {};
  const elSemanas = document.getElementById('chartSprSemanas');
  if(!elSemanas || !sprChartData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#9A9DA6' : '#767676';
  const gridColor = isDark ? '#2E3138' : '#E8E8E8';

  // Linha do tempo — trajetória dia a dia de SPR lançado x REF (era por
  // semana antes; virou por dia pra dar pra ver a trajetória mesmo dentro
  // de uma única semana). Respeita o filtro de semana específica, já que
  // usa a mesma base diária (porDiaAsc) dos outros dois gráficos.
  {
    sprChartInstances.semanas = new Chart(elSemanas, {
      type:'line',
      data:{ labels: sprChartData.porDiaAsc.map(d=>d.label), datasets:[
        { label:'SPR Lançado', data: sprChartData.porDiaAsc.map(d=>Number(d.roteirizadoMedio.toFixed(1))), borderColor:'#2F80ED', backgroundColor:'rgba(47,128,237,0.15)', fill:true, tension:0.3 },
        { label:'SPR REF', data: sprChartData.porDiaAsc.map(d=>Number(d.metaMedio.toFixed(1))), borderColor:'#A8A8A8', backgroundColor:'rgba(168,168,168,0.12)', fill:true, tension:0.3 },
      ] },
      options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ ticks:{ color:textColor }, grid:{ color:gridColor } } } }
    });
  }

  // Gap para a referência — a MESMA base diária, só que como delta puro
  // (lançado - REF): verde quando bateu, vermelho quando ficou devendo,
  // pra responder de cara "em que dias a gente perdeu performance".
  const elGap = document.getElementById('chartSprGap');
  if(elGap){
    sprChartInstances.gap = new Chart(elGap, {
      type:'bar',
      data:{ labels: sprChartData.porDiaAsc.map(d=>d.label), datasets:[
        { label:'Delta do dia', data: sprChartData.porDiaAsc.map(d=>Number(d.deltaMedio.toFixed(1))),
          backgroundColor: sprChartData.porDiaAsc.map(d=> d.deltaMedio>=0 ? '#2FAE60' : '#D9362E'), borderRadius:4 },
      ] },
      plugins:[barValueLabelsPlugin],
      options:{ plugins:{ legend:{ display:false } }, scales:{
        x:{ ticks:{ color:textColor }, grid:{ display:false } },
        y:{ ticks:{ color:textColor }, grid:{ color:gridColor } } } }
    });
  }

  // SPR Lançado x REF por dia — lado a lado, pra ver de cara em qual dia o
  // real descolou mais do alvo (granularidade diária; o comparativo por
  // hub fica na lista de oportunidades/destaques + tabela de detalhamento).
  const elMedia = document.getElementById('chartSprMedia');
  if(elMedia){
    sprChartInstances.media = new Chart(elMedia, {
      type:'bar',
      data:{ labels: sprChartData.porDiaAsc.map(d=>d.label),
        datasets:[
          { label:'SPR Lançado', data: sprChartData.porDiaAsc.map(d=>Number(d.roteirizadoMedio.toFixed(1))), backgroundColor:'#2F80ED', borderRadius:4 },
          { label:'SPR REF', data: sprChartData.porDiaAsc.map(d=>Number(d.metaMedio.toFixed(1))), backgroundColor:'#A8A8A8', borderRadius:4 },
        ] },
      plugins:[barValueLabelsPlugin],
      options:{ plugins:{ legend:{ position:'bottom', labels:{ color:textColor } } }, scales:{
        x:{ ticks:{ color:textColor, autoSkip:true, maxRotation:60, minRotation:0 }, grid:{ display:false } },
        y:{ ticks:{ color:textColor }, grid:{ color:gridColor } } } }
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
    <div class="rte-toolbar">
      <button type="button" class="rte-btn" data-rte-cmd="bold" title="Negrito"><b>B</b></button>
      <button type="button" class="rte-btn" data-rte-cmd="italic" title="Itálico"><i>I</i></button>
      <button type="button" class="rte-btn" data-rte-cmd="underline" title="Sublinhado"><u>S</u></button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-rte-cmd="justifyLeft" title="Alinhar à esquerda">≡«</button>
      <button type="button" class="rte-btn" data-rte-cmd="justifyCenter" title="Centralizar">≡</button>
      <button type="button" class="rte-btn" data-rte-cmd="justifyRight" title="Alinhar à direita">»≡</button>
    </div>
    <div id="transmMsg" class="rte-editable" contenteditable="true" data-placeholder="Escreva a mensagem para sua equipe..." style="min-height:110px;margin-bottom:10px;"></div>
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
        <div style="margin-top:4px;white-space:pre-wrap;">${item.texto}</div>
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
      <div style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(item.texto)}</div>
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

  // Filtro de "avaliação média" continua sendo por operação (não por
  // finalização individual): só entram na lista as operações cuja média no
  // período está no teto escolhido — pensado pra achar rápido as operações
  // com pior desempenho. O ranking em si não aparece mais na tela (gráficos
  // e métricas foram retirados daqui a pedido — o foco da aba passou a ser
  // ler o texto do Raio-X, não números).
  const avaliacaoMax = f.avaliacaoMax ? parseInt(f.avaliacaoMax,10) : null;
  if(avaliacaoMax){
    const porOperacao = {};
    rows.forEach(r=>{ (porOperacao[r.operacao] = porOperacao[r.operacao]||[]).push(r.estrelas||0); });
    const opsAbaixo = new Set(Object.entries(porOperacao)
      .filter(([,vals])=> vals.reduce((a,b)=>a+b,0)/vals.length <= avaliacaoMax)
      .map(([op])=>op));
    rows = rows.filter(r=> opsAbaixo.has(r.operacao));
  }

  ocorrenciasExportRows = rows;

  // Agrupado por dia (rows já vem ordenado do mais recente pro mais
  // antigo) — cada grupo vira uma seção com cabeçalho de data, tipo feed
  // de mensagens, em vez de uma lista corrida onde a data se perde no meio
  // do texto pequeno.
  const porDia = [];
  rows.forEach(r=>{
    const grupo = porDia[porDia.length-1];
    if(grupo && grupo.data===r.data) grupo.itens.push(r);
    else porDia.push({ data:r.data, itens:[r] });
  });

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
  <div class="help-text" style="margin-top:-6px;"><b>${rows.length}</b> finalizaç${rows.length===1?'ão':'ões'} no período.</div>
  ${porDia.map(grupo=>`
    <div class="ocorrencia-dia">
      <div class="ocorrencia-dia-titulo">${tituloDiaLongo(grupo.data)}</div>
      ${grupo.itens.map(r=>ocorrenciaCardHtml(r)).join('')}
    </div>`).join('') || '<div class="card"><div class="empty">Nenhuma finalização registrada no período selecionado</div></div>'}`;
}

// Card de uma finalização de Raio-X — texto da observação em primeiro
// plano (é o que o supervisor precisa ler de verdade), nota reduzida a um
// selo pequeno. Nota baixa (1-3★) ganha uma borda colorida pra saltar aos
// olhos numa rolada rápida pelo dia; 4-5★ fica neutro de propósito (não
// precisa de destaque quando está tudo bem).
function ocorrenciaCardHtml(r){
  const nota = r.estrelas||0;
  const cor = nota<=2 ? 'var(--alert)' : nota===3 ? 'var(--folga)' : null;
  return `<div class="ocorrencia-card"${cor?` style="border-left-color:${cor};"`:''}>
    <div class="ocorrencia-card-topo">
      <div class="ocorrencia-quem"><b>${escapeHtml(userById(r.analistaId)?.name||'—')}</b> <span class="ocorrencia-op">${escapeHtml(r.operacao)}</span></div>
      <div class="ocorrencia-info">
        <span class="ocorrencia-nota"${cor?` style="color:${cor};border-color:${cor};"`:''}>★ ${nota}</span>
        <span class="ocorrencia-hora mono" title="${timeAgo(r.ts)}">${r.hora}</span>
      </div>
    </div>
    <div class="ocorrencia-texto">${formatarObservacaoLonga(r.observacao)}</div>
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


// Formulários (Convocações): supervisor liga/desliga, programa a janela de
// abertura/fechamento e edita cada convocação — 4 tipos (ver
// FORMULARIO_TIPO_LABEL, utils.js). DB.formularios/DB.formularioRespostas
// já vêm filtrados pra equipe do supervisor (backend), sem filtro extra
// aqui. Eventos reais em events.js; espelha o padrão de
// supSugerirSuplente (form + lista + resultado expansível).
function supFormularios(myAnalistas){
  const form = uiState.formulariosShowNew ? formularioFormHtml(null) : '';
  const formularios = DB.formularios.slice().sort((a,b)=>b.criadoEm-a.criadoEm);
  const cards = formularios.map(f=>formularioCardHtml(f)).join('');
  return `
  <div class="section-title">Suas convocações
    <span class="spacer" style="flex:1;"></span>
    <button class="btn btn-brand btn-sm" id="btnNovoFormulario">${uiState.formulariosShowNew ? '✕ Cancelar' : '+ Nova convocação'}</button>
  </div>
  ${form}
  ${cards || '<div class="empty">Nenhuma convocação criada ainda.</div>'}`;
}

function formularioFormHtml(editing){
  const agora = Date.now();
  const c = editing || {
    tipo:'domingo_voluntariado', titulo:'', descricao:'',
    abertura: agora, fechamento: agora + 7*86400000,
    periodoInicio: todayISO(), periodoFim: addDaysISO(todayISO(), 30),
    limitePorDia: 3,
  };
  const isEdit = !!editing;
  const prefix = isEdit ? `editf-${editing.id}` : 'newf';
  const usaPeriodo = c.tipo==='domingo_voluntariado' || c.tipo==='folga_escolha';
  return `
  <div class="card edit-form" style="border-color:var(--brand);margin-bottom:16px;">
    <div class="grid-2">
      <div class="field"><label>Tipo de convocação</label>
        <select id="${prefix}-tipo" ${isEdit?'disabled':''}>
          ${Object.entries(FORMULARIO_TIPO_LABEL).map(([k,l])=>`<option value="${k}" ${c.tipo===k?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Título</label><input type="text" id="${prefix}-titulo" value="${escapeHtml(c.titulo)}" placeholder="ex: Voluntários pra domingo — Outubro"></div>
    </div>
    <div class="field" style="margin-top:10px;"><label>Descrição (o que o analista vê)</label><textarea id="${prefix}-descricao" rows="2" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(c.descricao)}</textarea></div>
    <div class="grid-2" style="margin-top:10px;">
      <div class="field"><label>Janela — abre em</label><input type="datetime-local" id="${prefix}-abertura" value="${msParaDatetimeLocal(c.abertura)}"></div>
      <div class="field"><label>Janela — fecha em</label><input type="datetime-local" id="${prefix}-fechamento" value="${msParaDatetimeLocal(c.fechamento)}"></div>
    </div>
    <div class="grid-3" id="${prefix}-periodoWrap" style="margin-top:10px;${usaPeriodo?'':'display:none;'}">
      <div class="field"><label>Período de referência — de</label><input type="date" id="${prefix}-periodoInicio" value="${c.periodoInicio||''}"></div>
      <div class="field"><label>Período de referência — até</label><input type="date" id="${prefix}-periodoFim" value="${c.periodoFim||''}"></div>
      <div class="field" id="${prefix}-limiteWrap" style="${c.tipo==='folga_escolha'?'':'display:none;'}">
        <label>Limite de folgas por dia</label><input type="number" id="${prefix}-limite" min="1" value="${c.limitePorDia||3}">
      </div>
    </div>
    <div class="help-text" id="${prefix}-ajuda">${formularioAjudaTexto(c.tipo)}</div>
    <div class="card-actions" style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn btn-brand btn-sm" id="${prefix}-salvar">${isEdit?'Salvar alterações':'Criar convocação'}</button>
      <button class="btn btn-sm" id="${prefix}-cancelar">Cancelar</button>
    </div>
  </div>`;
}

function formularioAjudaTexto(tipo){
  if(tipo==='domingo_voluntariado') return 'O analista vê e marca cada domingo dentro do período de referência em que topa trabalhar.';
  if(tipo==='folga_escolha') return `O analista escolhe até ${MAX_DIAS_FOLGA_ESCOLHA} dias dentro do período (domingo não entra — tem fluxo próprio) — dias que baterem o limite ficam bloqueados pra novas escolhas.`;
  if(tipo==='reconhecimento_mensal') return 'O analista indica um colega de equipe como destaque do mês, com um motivo.';
  return 'O analista pede um período de férias (início e fim) — fica pendente até você aprovar ou recusar.';
}

function formularioCardHtml(f){
  const status = formularioStatus(f);
  const respostas = DB.formularioRespostas.filter(r=>r.formularioId===f.id);
  const isEditing = uiState.formulariosEditingId===f.id;
  return `
  <div class="card campaign-card">
    <div class="campaign-top">
      <div>
        <div class="tag-row" style="margin-bottom:6px;">
          <span class="tag tag-tipo">${FORMULARIO_TIPO_LABEL[f.tipo]}</span>
          <span class="tag status-${status}">${FORMULARIO_STATUS_LABEL[status]}</span>
        </div>
        <div class="campaign-title">${escapeHtml(f.titulo||'(sem título)')}</div>
        <p class="campaign-desc">${escapeHtml(f.descricao)}</p>
      </div>
      <div class="toggle-row">
        ${status==='pausado'?'Pausada':'Ativa'}
        <label class="toggle-switch">
          <input type="checkbox" class="chk-formulario-ativo" data-id="${f.id}" ${f.ativoManual?'checked':''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="meta-row">
      <span>Janela: <b>${new Date(f.abertura).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b> → <b>${new Date(f.fechamento).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b></span>
      ${f.periodoInicio ? `<span>Período: <b>${f.periodoInicio}–${f.periodoFim}</b></span>` : ''}
      ${f.tipo==='folga_escolha' ? `<span>Limite/dia: <b>${f.limitePorDia}</b></span>` : ''}
      <span><b>${respostas.length}</b> resposta(s)</span>
    </div>
    <div class="card-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-editar-formulario" data-id="${f.id}">${isEditing?'✕ Fechar edição':'✎ Editar'}</button>
      <button class="btn btn-sm btn-excluir-formulario" data-id="${f.id}">🗑 Excluir</button>
      <button class="btn btn-sm btn-resultados-formulario" data-id="${f.id}">${uiState.formulariosExpanded[f.id]?'▾ Ocultar respostas':'▸ Ver respostas'}</button>
    </div>
    ${isEditing ? formularioFormHtml(f) : ''}
    ${uiState.formulariosExpanded[f.id] ? formularioResultsHtml(f, respostas) : ''}
  </div>`;
}

function formularioResultsHtml(f, respostas){
  if(respostas.length===0) return '<div class="empty">Ninguém respondeu ainda.</div>';

  if(f.tipo==='domingo_voluntariado'){
    const domingos = sundaysInRange(f.periodoInicio, f.periodoFim);
    const rows = domingos.map(d=>{
      const voluntarios = respostas.filter(r=>(r.payload.datas||[]).includes(d)).map(r=>userById(r.analistaId)?.name||'—');
      return `<tr><td>${d}</td><td><b>${voluntarios.length}</b> voluntário(s)</td><td class="names-inline">${voluntarios.map(escapeHtml).join(', ')||'—'}</td></tr>`;
    }).join('');
    return `<div style="overflow-x:auto;"><table class="resp-table"><thead><tr><th>Domingo</th><th>Total</th><th>Quem topou</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  if(f.tipo==='folga_escolha'){
    // Quem ainda não respondeu ou respondeu com menos dias do que tem
    // direito (limite = domingosTrabalhados no período, igual ao que o
    // próprio analista vê no formulário — ver render-analista.js). Quem
    // não tem direito a folga nenhuma (limite 0) nunca aparece aqui, já
    // que não há o que ele precisaria escolher.
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===f.supervisorId);
    const pendentesSolicitacao = myAnalistas.map(a=>{
      const limite = domingosTrabalhados(a.id, f.periodoInicio, f.periodoFim).length;
      if(limite===0) return null;
      const resp = respostas.find(r=>r.analistaId===a.id);
      const escolhidos = resp ? (resp.payload.datas||[]).length : 0;
      if(escolhidos>=limite) return null;
      return { name: a.name, escolhidos, limite };
    }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));

    const blocoPendentes = `
      <div class="section-title">Solicitação de folga pendente</div>
      <div class="help-text" style="margin-top:-8px;">Analistas com direito a folga no período que ainda não escolheram todos os dias disponíveis.</div>
      ${pendentesSolicitacao.length===0 ? '<div class="empty" style="margin-bottom:18px;">Todo mundo com direito a folga já escolheu.</div>' : `
      <div style="overflow-x:auto;margin-bottom:18px;"><table class="resp-table"><thead><tr><th>Analista</th><th>Escolhidos</th></tr></thead><tbody>
        ${pendentesSolicitacao.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td><span style="color:var(--alert);font-weight:600;">${p.escolhidos}/${p.limite}</span>${p.escolhidos===0?' · não respondeu':''}</td></tr>`).join('')}
      </tbody></table></div>`}`;

    const dias = diasFolgaEscolha(f.periodoInicio, f.periodoFim);
    const rows = dias.map(d=>{
      const quem = respostas.filter(r=>(r.payload.datas||[]).includes(d)).map(r=>userById(r.analistaId)?.name||'—');
      const pct = Math.min(100, Math.round(quem.length / f.limitePorDia * 100));
      const cheio = quem.length >= f.limitePorDia;
      return `<tr><td>${d}</td><td style="min-width:140px;">
          <span style="${cheio?'color:var(--alert);font-weight:600;':''}">${quem.length}/${f.limitePorDia}${cheio?' · lotado':''}</span>
          <div class="capbar-track"><div class="capbar-fill ${cheio?'full':''}" style="width:${pct}%;"></div></div>
        </td><td class="names-inline">${quem.map(escapeHtml).join(', ')||'—'}</td></tr>`;
    }).join('');

    // Confirmação de cobertura (por analista, não por dia) — marcar avisa o
    // analista que o suplente já foi organizado e a folga já reflete na
    // agenda dele (ver confirmarCobertura, backend). Só entra quem de fato
    // escolheu algum dia (resposta vazia não precisa de cobertura nenhuma).
    const comEscolha = respostas.filter(r=>(r.payload.datas||[]).length>0)
      .sort((a,b)=>(userById(a.analistaId)?.name||'').localeCompare(userById(b.analistaId)?.name||'','pt-BR'));
    const linhasPorAnalista = comEscolha.map(r=>{
      const nome = userById(r.analistaId)?.name || '—';
      const diasTxt = [...(r.payload.datas||[])].sort().map(d=>`${d.slice(8,10)}/${d.slice(5,7)}`).join(', ');
      const confirmado = !!r.confirmadoPeloSupervisor;
      return `<tr>
        <td>${escapeHtml(nome)}</td>
        <td class="mono">${diasTxt}</td>
        <td><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:${confirmado?'600':'400'};color:${confirmado?'var(--done)':'var(--text-muted)'};">
          <input type="checkbox" class="form-folga-confirmar-chk" data-id="${r.id}" ${confirmado?'checked':''}>
          ${confirmado?'✓ Suplente organizado':'Ainda não organizado'}
        </label></td>
      </tr>`;
    }).join('');
    const pendentes = comEscolha.filter(r=>!r.confirmadoPeloSupervisor);

    // Prévia de alocação automática em lote (btnAlocarAutoTodos em events.js)
    // — processa TODAS as respostas pendentes de uma vez (não uma de cada
    // vez), porque quem também está de folga no mesmo dia (outra resposta
    // deste mesmo formulário, ainda sem ausência criada) não pode ser
    // sugerido como suplente, e duas operações do mesmo dia não podem cair
    // na mesma pessoa se os horários batem — isso só dá pra garantir olhando
    // o lote inteiro de uma vez, não resposta por resposta isoladamente.
    // Ao confirmar, marca confirmadoPeloSupervisor de cada analista coberto.
    const aa = uiState.alocarAuto;
    const previewAuto = (aa && aa.formularioId===f.id) ? `
      <div class="card" style="margin-top:14px;border-color:var(--brand);">
        <div class="section-title">Prévia de alocação em lote</div>
        ${aa.items.length===0 ? '<div class="empty">Nenhuma operação encontrada pra cobrir nos dias escolhidos (ou já estão todas cobertas).</div>' :
        Object.entries(aa.items.reduce((acc,it,idx)=>{ (acc[it.respostaId]=acc[it.respostaId]||[]).push({...it,idx}); return acc; },{}))
          .map(([respostaId,itens])=>{
            const nome = userById(itens[0].analistaId)?.name || '—';
            return `<div style="margin-bottom:14px;">
              <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${escapeHtml(nome)}</div>
              ${itens.map(it=>{
                const bm = DB.baseMestra.find(b=>b.id===it.bmId);
                return `<div class="candidate-row" style="flex-wrap:wrap;">
                  <span class="op-tag"><span class="mono" style="color:var(--text-muted);font-weight:400;">${it.data.slice(8,10)}/${it.data.slice(5,7)}</span> ${escapeHtml(bm.operacao)} <span class="mono" style="color:var(--text-muted);font-weight:400;">${bm.horaInicio}–${bm.horaFim}</span></span>
                  <select data-alocarauto-idx="${it.idx}">
                    ${it.semSugestaoAutomatica ? `<option value="">— Sem sugestão automática, escolha manualmente —</option>
                      ${it.candidatos.map(c=>`<option value="${c.id}" ${it.chosenId===c.id?'selected':''}>${escapeHtml(c.name)}${c.status?` — ${escapeHtml(c.status)}`:''}</option>`).join('')}` :
                      it.candidatos.map(c=>`<option value="${c.id}" ${it.chosenId===c.id?'selected':''}>${escapeHtml(c.name)} — ${c.opsHoje} op(s) hoje, ${c.coberturasNoMes} cobertura(s)/mês</option>`).join('')}
                  </select>
                  ${it.semSugestaoAutomatica ? `<span style="width:100%;font-size:11.5px;color:var(--alert);">⚠ Ninguém elegível automaticamente nesse horário — a lista mostra a equipe toda, com o que cada um já tem no dia.</span>` : ''}
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
        <div id="alocarAutoProgress" style="display:none;margin-top:10px;">
          <div class="capbar-track"><div class="capbar-fill" id="alocarAutoProgressFill" style="width:0%;"></div></div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;" id="alocarAutoProgressLabel"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button class="btn" id="btnCancelarAlocacaoAuto">Cancelar</button>
          ${aa.items.length>0 ? `<button class="btn btn-brand" id="btnConfirmarAlocacaoAuto">Confirmar e organizar todos</button>` : ''}
        </div>
      </div>` : '';

    return `${blocoPendentes}
      <div style="overflow-x:auto;"><table class="resp-table"><thead><tr><th>Dia</th><th>Vagas</th><th>Quem escolheu</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="section-title" style="margin-top:18px;">Confirmação de cobertura
        ${pendentes.length>0 ? `<span class="spacer" style="flex:1;"></span><button class="btn btn-sm" data-alocar-auto-todos="${f.id}">🤖 Alocar automaticamente (${pendentes.length} pendente${pendentes.length>1?'s':''})</button>` : ''}
      </div>
      <div class="help-text" style="margin-top:-8px;">Marque quando já tiver organizado o suplente pros dias escolhidos — o analista recebe um aviso de que a folga já está na agenda dele. "Alocar automaticamente" processa todo mundo junto (respeitando jornada, conflitos e quem também está de folga no mesmo dia) e gera uma prévia pra você ajustar antes de confirmar.</div>
      <div style="overflow-x:auto;"><table class="resp-table"><thead><tr><th>Analista</th><th>Dia(s) escolhido(s)</th><th>Cobertura</th></tr></thead><tbody>
        ${linhasPorAnalista || '<tr><td colspan="3" class="empty">Ninguém escolheu dia ainda</td></tr>'}
      </tbody></table></div>
      ${previewAuto}`;
  }

  if(f.tipo==='reconhecimento_mensal'){
    const rows = respostas.map(r=>{
      const quem = userById(r.analistaId)?.name || '—';
      const indicado = userById(r.payload.indicadoId)?.name || '—';
      return `<tr><td>${escapeHtml(quem)}</td><td>${escapeHtml(indicado)}</td><td>${escapeHtml(r.payload.motivo||'—')}</td></tr>`;
    }).join('');
    return `<div style="overflow-x:auto;"><table class="resp-table"><thead><tr><th>Quem indicou</th><th>Quem foi indicado</th><th>Motivo</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ferias_solicitacao
  const statusLabel = {pendente:'Pendente', aprovado:'Aprovado', recusado:'Recusado'};
  const rows = respostas.slice().sort((a,b)=>a.status==='pendente'?-1:1).map(r=>{
    const nome = userById(r.analistaId)?.name || '—';
    return `<tr>
      <td>${escapeHtml(nome)}</td>
      <td>${r.payload.inicio} – ${r.payload.fim}</td>
      <td class="names-inline">${escapeHtml(r.payload.justificativa||'—')}</td>
      <td><span class="tag ${r.status==='aprovado'?'status-aberto':r.status==='recusado'?'status-encerrado':'status-agendado'}">${statusLabel[r.status]||r.status}</span></td>
      <td>${r.status==='pendente' ? `
        <button class="btn btn-sm btn-aprovar-ferias" data-id="${r.id}">✓ Aprovar</button>
        <button class="btn btn-sm btn-recusar-ferias" data-id="${r.id}">✕ Recusar</button>
      ` : (r.status==='recusado' && r.motivoRecusa ? `<span class="names-inline">${escapeHtml(r.motivoRecusa)}</span>` : '')}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow-x:auto;"><table class="resp-table"><thead><tr><th>Analista</th><th>Período</th><th>Justificativa</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

