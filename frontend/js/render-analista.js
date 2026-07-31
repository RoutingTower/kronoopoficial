/* Telas do papel Analista: programação, caixa de entrada e lembretes. */

// showLembretes só é true na própria Programação do analista (renderAnalista) —
// a "Programação Analista" do supervisor reusa esta mesma função pra ver a
// rota de qualquer analista da equipe, e lembretes são um to-do pessoal
// (origem:self), não algo que deva aparecer na visão do supervisor.
function renderFlashcardRow(analistaId, dateStr, showLembretes){
  const slots = getDaySlots(analistaId, dateStr);
  const reunioes = getReunioesForDate(analistaId, dateStr);
  const lembretesDoDia = showLembretes ? getLembretesForAnalista(analistaId).filter(l=>(l.data||todayISO())===dateStr) : [];
  const semHora = lembretesDoDia.filter(l=>!l.hora);
  const semHoraCol = showLembretes ? `<div class="flash-col"><div class="flash-time">Sem hora</div>${semHora.length===0 ? `<div class="flash-card off"><div style="color:var(--text-faint);font-size:12px;">Sem lembrete</div></div>` : semHora.map(lembreteCardHTML).join('')}</div>` : '';
  return `<div class="flash-row">` + semHoraCol + HOURS.map(hour=>{
    const items = slots.filter(s=>s.horaInicio===hour);
    const rns = reunioes.filter(r=>r.hora===hour);
    const lembretes = lembretesDoDia.filter(l=>l.hora===hour);
    if(items.length===0 && rns.length===0 && lembretes.length===0){
      return `<div class="flash-col"><div class="flash-time">${hour}</div><div class="flash-card off"><div style="color:var(--text-faint);font-size:12px;">Sem operação</div></div></div>`;
    }
    let cardsHtml = items.map(it=>{
      const status = computeStatus(hour, dateStr, analistaId, it.operacao, it.isOff);
      const raiox = DB.raioX.find(r=>r.analistaId===analistaId && r.operacao===it.operacao && r.hora===it.horaInicio && r.data===dateStr);
      return `<div class="flash-card${status==='atraso'?' flash-card-atraso':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
          <span class="flash-sigla">${it.operacao}</span>${statusPill(status)}
        </div>
        <div class="flash-meta">${it.ciclo} · ${it.horaInicio}–${it.horaFim}</div>
        <div class="flash-meta">${it.isSuplente ? 'Suplente' : 'Titular'}: ${it.responsavelNome}</div>
        ${it.isOff ? `<div class="flash-cover">${it.tipo==='ferias'?'🏖️ Férias':'🌙 Folga'} do titular</div>`
          : it.isCobertura ? `<div class="flash-cover">🔁 Cobrindo ${it.tipo==='ferias'?'férias':'folga'} de ${it.responsavelNome}</div>` : ''}
        ${!it.isOff && analistaId===session?.userId ? (raiox ? `<div class="flash-meta" style="margin-top:6px;">Raio-X: ${starDisplay(raiox.estrelas)}</div>` : `<div class="flash-actions">
            <button class="btn btn-brand" data-finalizar-op="${it.operacao}" data-hora="${it.horaInicio}" data-data="${dateStr}">Finalizar operação</button>
          </div>`) : ''}
      </div>`;
    }).join('');
    cardsHtml += rns.map(r=>`<div class="flash-card reuniao">
      <div class="flash-sigla">📅 Reunião</div>
      <div class="flash-meta">${r.titulo}</div>
      <div class="flash-meta">${r.tipo==='grupo'?'Grupo':'Individual'} · ${r.hora}</div>
    </div>`).join('');
    cardsHtml += lembretes.map(lembreteCardHTML).join('');
    return `<div class="flash-col"><div class="flash-time">${hour}</div>${cardsHtml}</div>`;
  }).join('') + `</div>`;
}


function renderAnalista(){
  const dateStr = uiState.analistaDate;
  let coberturas=0, folgas=0;
  for(let i=-3;i<=3;i++){
    const ds = addDaysISO(dateStr, i);
    const slots = getDaySlots(session.userId, ds);
    if(slots.some(s=>s.isOff)) folgas++;
  }
  coberturas = DB.ausencias.filter(a=>a.suplenteId===session.userId).length + DB.suplencias.filter(s=>s.suplente===session.name).length;
  const todaySlots = getDaySlots(session.userId, dateStr);
  return `
  ${plantaoBannerFor(session.userId, dateStr)}
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
  <div class="grid-3" style="margin-bottom:22px;">
    <div class="stat-card"><div class="stat-num">${todaySlots.length}</div><div class="stat-label">Operações hoje</div></div>
    <div class="stat-card"><div class="stat-num">${coberturas}</div><div class="stat-label">Coberturas feitas (total)</div></div>
    <div class="stat-card"><div class="stat-num">${folgas}</div><div class="stat-label">Dias com folga/férias (7 dias)</div></div>
  </div>
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">
    <input type="date" id="analistaDatePick" value="${dateStr}" class="mono" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:8px;">
  </div>
  ${uiState.analistaView==='diaria' ? renderFlashcardRow(session.userId, dateStr, true)
    : uiState.analistaView==='semanal' ? renderAnalistaSemanal(session.userId, dateStr)
    : renderAnalistaMensal(session.userId, dateStr)}
  `;
}


function renderAnalistaSemanal(analistaId, dateStr){
  let cols='';
  for(let i=0;i<7;i++){
    const ds = addDaysISO(dateStr, i);
    const slots = getDaySlots(analistaId, ds);
    const dd = new Date(ds+'T00:00:00');
    const label = dd.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
    cols += `<div class="flash-col" style="min-width:160px;">
      <div class="flash-time">${label}</div>
      ${slots.length===0 ? `<div class="flash-card off"><span style="color:var(--text-faint);font-size:12px;">Sem operação</span></div>`
      : slots.map(s=>`<div class="flash-card${s.isOff?' off':''}">
          <div class="flash-sigla" style="font-size:13px;">${s.operacao}</div>
          <div class="flash-meta">${s.horaInicio}–${s.horaFim}</div>
          ${s.isOff?`<div class="flash-cover">${s.tipo==='ferias'?'Férias':'Folga'} · cobre: ${s.responsavelNome}</div>`
            :s.isCobertura?`<div class="flash-cover">Cobrindo ${s.tipo==='ferias'?'férias':'folga'} de ${s.responsavelNome}</div>`:''}
        </div>`).join('')}
    </div>`;
  }
  return `<div class="flash-row">${cols}</div>`;
}

/* Mensal no mesmo formato da visão semanal: uma coluna por dia do mês, com flash-cards */

function renderAnalistaMensal(analistaId, dateStr){
  const ref = new Date(dateStr+'T00:00:00');
  const year = ref.getFullYear(), month = ref.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevDate = new Date(year, month-1, 1).toISOString().slice(0,10);
  const nextDate = new Date(year, month+1, 1).toISOString().slice(0,10);
  let cols='';
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dd = new Date(ds+'T00:00:00');
    const slots = getDaySlots(analistaId, ds);
    const label = dd.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
    cols += `<div class="flash-col" style="min-width:160px;">
      <div class="flash-time" data-daypick="${ds}" style="cursor:pointer;">${label}</div>
      ${slots.length===0 ? `<div class="flash-card off"><span style="color:var(--text-faint);font-size:12px;">Sem operação</span></div>`
      : slots.map(s=>`<div class="flash-card${s.isOff?' off':''}">
          <div class="flash-sigla" style="font-size:13px;">${s.operacao}</div>
          <div class="flash-meta">${s.horaInicio}–${s.horaFim}</div>
          ${s.isOff?`<div class="flash-cover">${s.tipo==='ferias'?'Férias':'Folga'} · cobre: ${s.responsavelNome}</div>`
            :s.isCobertura?`<div class="flash-cover">Cobrindo ${s.tipo==='ferias'?'férias':'folga'} de ${s.responsavelNome}</div>`:''}
        </div>`).join('')}
    </div>`;
  }
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <button class="btn" data-monthnav="${prevDate}">‹ Mês anterior</button>
    <div class="section-title" style="margin:0;">${MONTH_NAMES[month]} ${year}</div>
    <button class="btn" data-monthnav="${nextDate}">Próximo mês ›</button>
  </div>
  <div class="flash-row">${cols}</div>`;
}


function renderRecadosAnalista(){
  const my = recadosParaAnalista(session.userId).sort((a,b)=>b.ts-a.ts);
  if(!uiState.inboxSelected || !my.find(m=>m.id===uiState.inboxSelected)) uiState.inboxSelected = my[0]?.id || null;
  const sel = my.find(m=>m.id===uiState.inboxSelected);
  const naoLidas = my.filter(r=>!(r.lidoPor||[]).includes(session.userId)).length;
  return `
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


function renderLembretesDia(my, dateStr){
  const doDia = my.filter(l=>(l.data||todayISO())===dateStr);
  const semHora = doDia.filter(l=>!l.hora);
  const semHoraCol = `<div class="flash-col"><div class="flash-time">Sem hora</div>${semHora.length===0?`<div class="flash-card off"><span style="color:var(--text-faint);font-size:12px;">—</span></div>`:semHora.map(lembreteCardHTML).join('')}</div>`;
  const hourCols = HOURS.map(hour=>{
    const items = doDia.filter(l=>l.hora===hour);
    return `<div class="flash-col"><div class="flash-time">${hour}</div>${items.length===0?`<div class="flash-card off"><span style="color:var(--text-faint);font-size:12px;">Sem lembrete</span></div>`:items.map(lembreteCardHTML).join('')}</div>`;
  }).join('');
  return `<div class="flash-row">${semHoraCol}${hourCols}</div>`;
}


function renderLembretesSemana(my, dateStr){
  const d0 = new Date(dateStr+'T00:00:00');
  let cols='';
  for(let i=0;i<7;i++){
    const dd = new Date(d0); dd.setDate(dd.getDate()+i); const ds = dd.toISOString().slice(0,10);
    const items = my.filter(l=>(l.data||todayISO())===ds).sort((a,b)=>(a.hora||'99').localeCompare(b.hora||'99'));
    const label = dd.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
    cols += `<div class="flash-col" style="min-width:180px;">
      <div class="flash-time" data-lembretenav="${ds}" style="cursor:pointer;">${label}</div>
      ${items.length===0 ? `<div class="flash-card off"><span style="color:var(--text-faint);font-size:12px;">Sem lembrete</span></div>` : items.map(lembreteCardHTML).join('')}
    </div>`;
  }
  return `<div class="flash-row">${cols}</div>`;
}


function renderLembretesMensal(my, dateStr){
  const todayStr = todayISO();
  const ref = new Date(dateStr+'T00:00:00');
  const year = ref.getFullYear(), month = ref.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const chip = l=>{
    const bg = l.done ? 'var(--bg-2)' : (l.origem==='supervisor' ? 'rgba(124,77,255,0.12)' : 'rgba(238,77,45,0.1)');
    const color = l.done ? 'var(--text-faint)' : (l.origem==='supervisor' ? 'var(--suplente)' : 'var(--brand)');
    const title = l.origem==='supervisor' ? `De ${l.criadoPor}` : 'Seu lembrete';
    return `<div style="display:flex;align-items:center;gap:4px;font-size:10.5px;padding:3px 6px;border-radius:5px;background:${bg};color:${color};">
      <span data-lembrete-toggle="${l.id}" style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${l.done?'text-decoration:line-through;':''}" title="${title}: ${escapeHtml(l.texto)}${l.hora?' · '+l.hora:''}${l.observacoes?' — '+escapeHtml(l.observacoes):''}">${l.hora?`${l.hora} `:''}${escapeHtml(l.texto)}</span>
      ${l.origem==='self' ? `<span data-lembrete-del="${l.id}" style="cursor:pointer;opacity:0.6;flex-shrink:0;">×</span>` : ''}
    </div>`;
  };
  let cells = '';
  for(let i=0;i<startWeekday;i++){
    cells += `<div style="min-height:96px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);opacity:0.45;"></div>`;
  }
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const items = my.filter(l=>(l.data||todayStr)===ds).sort((a,b)=>(a.hora||'99').localeCompare(b.hora||'99'));
    const isToday = ds===todayStr;
    cells += `<div data-lembretenav="${ds}" style="cursor:pointer;min-height:96px;padding:7px;border:1px solid ${isToday?'var(--brand)':'var(--border)'};border-radius:8px;background:var(--panel);display:flex;flex-direction:column;gap:4px;overflow:hidden;">
      <div class="mono" style="font-size:11px;color:${isToday?'var(--brand)':'var(--text-faint)'};font-weight:${isToday?'700':'400'};">${day}</div>
      ${items.map(chip).join('')}
    </div>`;
  }
  const trailing = (7 - ((startWeekday+daysInMonth) % 7)) % 7;
  for(let i=0;i<trailing;i++){
    cells += `<div style="min-height:96px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);opacity:0.45;"></div>`;
  }
  return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;">
    ${WEEKDAY_LABELS.map(w=>`<div style="text-align:center;font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;">${w}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">${cells}</div>`;
}


function renderLembretes(){
  const dateStr = uiState.lembretesDate || todayISO();
  const view = uiState.lembretesView || 'semanal';
  const my = getLembretesForAnalista(session.userId);
  const pendentes = my.filter(l=>!l.done).length;

  const d = new Date(dateStr+'T00:00:00');
  let navPrev, navNext, label;
  if(view==='diaria'){
    const p=new Date(d); p.setDate(p.getDate()-1); const n=new Date(d); n.setDate(n.getDate()+1);
    navPrev=p.toISOString().slice(0,10); navNext=n.toISOString().slice(0,10);
    label = d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
  } else if(view==='semanal'){
    const p=new Date(d); p.setDate(p.getDate()-7); const n=new Date(d); n.setDate(n.getDate()+7);
    navPrev=p.toISOString().slice(0,10); navNext=n.toISOString().slice(0,10);
    const endW=new Date(d); endW.setDate(endW.getDate()+6);
    label = `${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} – ${endW.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
  } else {
    const p=new Date(d.getFullYear(), d.getMonth()-1, 1); const n=new Date(d.getFullYear(), d.getMonth()+1, 1);
    navPrev=p.toISOString().slice(0,10); navNext=n.toISOString().slice(0,10);
    label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  const body = view==='diaria' ? renderLembretesDia(my, dateStr) : view==='semanal' ? renderLembretesSemana(my, dateStr) : renderLembretesMensal(my, dateStr);

  return `
  <div class="page-head">
    <div><h1 class="page-title">Lembretes</h1><div class="page-desc">${pendentes>0?`${pendentes} pendente(s) · `:''}To-dos em formato kanban, com hora e data</div></div>
    <div class="toggle-group" data-scope="lembretes">
      <button data-view="diaria" class="${view==='diaria'?'active':''}">Diária</button>
      <button data-view="semanal" class="${view==='semanal'?'active':''}">Semanal</button>
      <button data-view="mensal" class="${view==='mensal'?'active':''}">Mensal</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px;">
    <div class="section-title">Novo lembrete</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <input id="novoLembreteTxt" placeholder="Escreva um lembrete..." style="flex:1;min-width:200px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);">
      <input type="date" id="novoLembreteData" value="${dateStr}" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);">
      <select id="novoLembreteHora" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);">
        <option value="">Sem hora</option>
        ${HOURS.map(h=>`<option value="${h}">${h}</option>`).join('')}
      </select>
      <button class="btn btn-brand" id="btnAddLembrete">Adicionar</button>
    </div>
    <input id="novoLembreteObs" placeholder="Observações (opcional)..." style="width:100%;margin-top:8px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);">
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <button class="btn" data-lembretenav="${navPrev}">‹</button>
      <div class="section-title" style="margin:0;text-transform:capitalize;">${label}</div>
      <button class="btn" data-lembretenav="${navNext}">›</button>
    </div>
    ${body}
  </div>`;
}
