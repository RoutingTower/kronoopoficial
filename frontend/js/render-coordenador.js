/* Telas do papel Coordenador: visão executiva da operação. */

function renderCoordenador(){
  const tabLabel = NAV.coordenador.find(t=>t.k===activeNavKey)?.label || '';
  let content='';
  if(activeNavKey==='acessos') content = coordAcessos();
  else if(activeNavKey==='dashboard') content = coordDashboard();
  else if(activeNavKey==='comunicados') content = coordComunicados();
  else if(activeNavKey==='painel') content = coordPainelHoraAHora();
  else if(activeNavKey==='status') content = coordStatus();
  else if(activeNavKey==='anomalias') content = coordAnomalias();
  return `<div class="page-head"><div><h1 class="page-title">${tabLabel}</h1><div class="page-desc">Visão executiva de toda a operação</div></div></div>${content}`;
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
  const today = todayISO();
  const supIds = usersByRole('supervisor').map(s=>s.id);
  const analistaIds = DB.users.filter(u=>u.role==='analista' && supIds.includes(u.supervisorId)).map(u=>u.id);
  let rows = [];
  analistaIds.forEach(id=>{
    const slots = getDaySlots(id, today);
    slots.forEach(s=>{
      rows.push({analista:userById(id).name, op:s.operacao, hora:s.horaInicio, horaFim:s.horaFim, nome:s.responsavelNome, isSuplente:s.isSuplente, status:computeStatus(s.horaInicio, today, id, s.operacao, s.isOff)});
    });
  });
  rows.sort((a,b)=> hourSortValue(a.hora)-hourSortValue(b.hora));
  return `<div class="card">
  <table><thead><tr><th>Horário</th><th>Analista</th><th>Operação</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
  ${rows.map(r=>`<tr class="${r.isSuplente?'row-suplente':''}"><td class="mono">${r.hora}–${r.horaFim}</td><td>${r.analista}</td><td>${r.op}</td><td>${r.nome} ${r.isSuplente?'<span class="pill pill-suplente">🔁 Suplente</span>':''}</td><td>${statusPill(r.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem registros para hoje</td></tr>'}
  </tbody></table></div>`;
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


function coordDashboard(){
  const totalAnalistas = usersByRole('analista').length;
  const totalSup = usersByRole('supervisor').length;
  const today = todayISO();
  const opsAtivas = DB.baseMestra.filter(b=>today>=b.dataInicio && today<=b.dataFim).length;
  const folgasHoje = new Set(DB.ausencias.filter(a=>a.data===today).map(a=>a.analistaId)).size;
  const avaliacaoBaixa = DB.raioX.filter(r=>(r.estrelas||0)<=2).length;
  return `
  <div class="grid-3" style="margin-bottom:14px;">
    <div class="stat-card"><div class="stat-num">${totalAnalistas}</div><div class="stat-label">Analistas na base</div></div>
    <div class="stat-card"><div class="stat-num">${totalSup}</div><div class="stat-label">Supervisores</div></div>
    <div class="stat-card"><div class="stat-num">${opsAtivas}</div><div class="stat-label">Operações ativas hoje</div></div>
  </div>
  <div class="grid-2">
    <div class="stat-card"><div class="stat-num">${folgasHoje}</div><div class="stat-label">Analistas em folga/férias hoje</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--alert);">${avaliacaoBaixa}</div><div class="stat-label">Raio-X com avaliação baixa (≤2★)</div></div>
  </div>`;
}


function coordStatus(){
  const today = todayISO();
  let done=0,live=0,wait=0,atraso=0;
  DB.baseMestra.filter(b=>today>=b.dataInicio && today<=b.dataFim).forEach(b=>{
    const isOff = DB.ausencias.some(a=>a.baseMestraId===b.id && a.data===today);
    const s = computeStatus(b.horaInicio, today, b.analistaId, b.operacao, isOff);
    if(s==='done') done++; else if(s==='live') live++; else if(s==='atraso') atraso++; else wait++;
  });
  return `<div class="card">
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
  </div>`;
}


function coordAnomalias(){
  const rows = [...DB.raioX].sort((a,b)=>b.ts-a.ts);
  const baixa = rows.filter(r=>(r.estrelas||0)<=2).length;

  const porOperacao = {};
  rows.forEach(r=>{
    if(!porOperacao[r.operacao]) porOperacao[r.operacao] = [];
    porOperacao[r.operacao].push(r.estrelas||0);
  });
  const ranking = Object.entries(porOperacao)
    .map(([op, vals])=>({ op, media: vals.reduce((a,b)=>a+b,0)/vals.length, n: vals.length }))
    .sort((a,b)=> a.media-b.media);

  return `
  <div class="grid-2" style="margin-bottom:16px;">
    <div class="stat-card"><div class="stat-num">${rows.length}</div><div class="stat-label">Registros de Raio-X totais</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--alert);">${baixa}</div><div class="stat-label">Avaliação baixa (≤2★)</div></div>
  </div>
  <div class="card" style="margin-bottom:16px;"><div class="section-title">Avaliação média por operação</div>
  <table><thead><tr><th>Operação</th><th>Avaliação média</th><th>Finalizações</th></tr></thead><tbody>
  ${ranking.map(r=>`<tr><td>${r.op}</td><td>${starDisplay(Math.round(r.media))} <span class="mono" style="color:var(--text-muted);">(${r.media.toFixed(1)})</span></td><td class="mono">${r.n}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sem finalizações registradas</td></tr>'}
  </tbody></table></div>
  <div class="card">
  ${rows.map(r=>`<div class="msg-item">
    <div class="msg-meta">${userById(r.analistaId)?.name} · ${r.operacao} · ${r.data} ${r.hora} · ${timeAgo(r.ts)}</div>
    <div>${starDisplay(r.estrelas)}</div>
    <div style="margin-top:4px;">${escapeHtml(r.observacao||'')}</div>
  </div>`).join('') || '<div class="empty">Nenhum registro</div>'}
  </div>`;
}

