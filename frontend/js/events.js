/* bindMainEvents(): liga todos os listeners de clique/change do #mainArea a cada render. */

function bindMainEvents(){
  const main = document.getElementById('mainArea');

  const btnAddLembrete = document.getElementById('btnAddLembrete');
  if(btnAddLembrete) btnAddLembrete.addEventListener('click', async ()=>{
    const input = document.getElementById('novoLembreteTxt');
    const dataInput = document.getElementById('novoLembreteData');
    const horaInput = document.getElementById('novoLembreteHora');
    const obsInput = document.getElementById('novoLembreteObs');
    const txt = input.value.trim();
    if(!txt) return;
    const lembreteData = dataInput.value || todayISO();
    const entrada = {origem:'self', analistaId:session.userId, criadoPor:session.name, texto:txt, observacoes: obsInput.value.trim(), data: lembreteData, hora: horaInput.value||''};
    uiState.lembretesDate = lembreteData;
    if(session.demoMode){
      DB.lembretes.push({id:uid('lb'), ...entrada, done:false, ts:Date.now()});
      renderMain();
      return;
    }
    try{
      const novo = await apiCreateLembrete(entrada);
      DB.lembretes.push(novo);
      renderMain();
    }catch(e){ alert('Não foi possível criar o lembrete: '+e.message); }
  });
  main.querySelectorAll('.toggle-group[data-scope="lembretes"] [data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.lembretesView = el.dataset.view; renderMain(); });
  });
  main.querySelectorAll('[data-lembrete-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const l = DB.lembretes.find(x=>x.id===el.dataset.lembreteToggle);
      if(!l) return;
      const done = !l.done;
      if(session.demoMode){ l.done = done; renderMain(); return; }
      try{ await apiUpdateLembrete(l.id, {done}); l.done = done; renderMain(); }
      catch(e){ alert('Não foi possível atualizar o lembrete: '+e.message); }
    });
  });
  main.querySelectorAll('[data-lembrete-del]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.dataset.lembreteDel;
      if(session.demoMode){ DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteLembrete(id); DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir o lembrete: '+e.message); }
    });
  });
  main.querySelectorAll('[data-lembretenav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ uiState.lembretesDate = btn.dataset.lembretenav; renderMain(); });
  });

  main.querySelectorAll('[data-inbox-row]').forEach(row=>{
    row.addEventListener('click', ()=>{ uiState.inboxSelected = row.dataset.inboxRow; renderMain(); });
  });

  main.querySelectorAll('[data-confirmar-leitura]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const r = DB.recados.find(x=>x.id===btn.dataset.confirmarLeitura);
      if(!r) return;
      if(session.demoMode){
        r.lidoPor = r.lidoPor||[]; if(!r.lidoPor.includes(session.userId)) r.lidoPor.push(session.userId);
        renderMain(); return;
      }
      try{
        const atualizado = await apiUpdateRecado(r.id, {marcarLido: session.userId});
        r.lidoPor = atualizado.lidoPor;
        renderMain();
      }catch(e){ console.error('KronoOP: falha ao confirmar leitura.', e); }
    });
  });

  main.querySelectorAll('.toggle-group[data-scope="analista"] [data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.analistaView = el.dataset.view; renderMain(); });
  });
  main.querySelectorAll('.toggle-group[data-scope="sup"] [data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.progView = el.dataset.view; renderMain(); });
  });
  const datePick = document.getElementById('analistaDatePick');
  if(datePick) datePick.addEventListener('change', ()=>{ uiState.analistaDate = datePick.value; renderMain(); });

  main.querySelectorAll('[data-daypick]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const ds = cell.dataset.daypick;
      if(session.role==='analista'){ uiState.analistaDate = ds; uiState.analistaView = 'diaria'; }
      else { uiState.progDate = ds; uiState.progView = 'diaria'; }
      renderMain();
    });
  });
  main.querySelectorAll('[data-monthnav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ds = btn.dataset.monthnav;
      if(session.role==='analista'){ uiState.analistaDate = ds; }
      else { uiState.progDate = ds; }
      renderMain();
    });
  });

  main.querySelectorAll('[data-finalizar-op]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const op = btn.dataset.finalizarOp, hora = btn.dataset.hora, data = btn.dataset.data || uiState.analistaDate;
      let estrelas = 0;
      openModal(`
        <h3>Finalizar operação — ${op} (${hora})</h3>
        <div class="help-text">Este é o Raio-X da operação: avalie com estrelas e descreva o que aconteceu. A observação precisa de no mínimo ${RAIOX_MIN_OBS_LEN} caracteres para fechar — esse passo é obrigatório para finalizar.</div>
        <div class="field">
          <label>Avaliação</label>
          <div id="raioxStars" class="star-picker" style="display:flex;gap:6px;font-size:28px;line-height:1;">
            ${[1,2,3,4,5].map(n=>`<span data-star="${n}" style="cursor:pointer;opacity:0.3;">★</span>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Observação (Raio-X da operação)</label>
          <textarea id="raioxObs" rows="5" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;" placeholder="Descreva com detalhes o que aconteceu nessa operação..."></textarea>
          <div id="raioxCounter" style="font-size:11.5px;color:var(--text-faint);margin-top:4px;">0 / ${RAIOX_MIN_OBS_LEN} caracteres mínimos</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmFinalizar" disabled>Fechar finalização</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const starsEl = document.getElementById('raioxStars');
      const obsEl = document.getElementById('raioxObs');
      const counterEl = document.getElementById('raioxCounter');
      const confirmBtn = document.getElementById('confirmFinalizar');
      function updateState(){
        const len = obsEl.value.trim().length;
        counterEl.textContent = `${len} / ${RAIOX_MIN_OBS_LEN} caracteres mínimos`;
        counterEl.style.color = len>=RAIOX_MIN_OBS_LEN ? 'var(--done)' : 'var(--text-faint)';
        confirmBtn.disabled = !(estrelas>=1 && len>=RAIOX_MIN_OBS_LEN);
      }
      starsEl.querySelectorAll('[data-star]').forEach(s=>{
        s.addEventListener('click', ()=>{
          estrelas = parseInt(s.dataset.star,10);
          starsEl.querySelectorAll('[data-star]').forEach(x=>{
            const active = parseInt(x.dataset.star,10) <= estrelas;
            x.style.opacity = active ? '1' : '0.3';
            x.style.color = active ? 'var(--brand)' : '';
          });
          updateState();
        });
      });
      obsEl.addEventListener('input', updateState);
      confirmBtn.onclick = async ()=>{
        const observacao = obsEl.value.trim();
        if(estrelas<1 || observacao.length<RAIOX_MIN_OBS_LEN) return;
        const entrada = {analistaId:session.userId, operacao:op, hora, data, estrelas, observacao};
        if(session.demoMode){
          DB.raioX.push({id:uid('rx'), ...entrada, ts:Date.now()});
          closeModal(); renderMain();
          return;
        }
        confirmBtn.disabled = true;
        try{
          const novo = await apiCreateRaioX(entrada);
          DB.raioX.push(novo);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível finalizar: '+e.message); confirmBtn.disabled = false; }
      };
    });
  });

  const btnNovoAnalista = document.getElementById('btnNovoAnalista');
  if(btnNovoAnalista) btnNovoAnalista.addEventListener('click', ()=>{
    openModal(`<h3>Novo Analista</h3>
      <div class="field"><label>Nome completo</label><input id="fName"></div>
      <div class="field"><label>E-mail</label><input id="fEmail"></div>
      <div class="field"><label>Senha inicial</label><input id="fPass" value="demo123"></div>
      <div class="field"><label>Dias de trabalho</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${WEEKDAYS.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg-2);padding:5px 8px;border-radius:6px;"><input type="checkbox" class="fDia" value="${d}" ${['seg','ter','qua','qui','sex'].includes(d)?'checked':''}> ${d}</label>`).join('')}
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Jornada — início</label><select id="fJHi">${HOURS.map(h=>`<option ${h==='19:00'?'selected':''}>${h}</option>`).join('')}</select></div>
        <div class="field"><label>Jornada — fim</label><select id="fJHf">${HOURS.map(h=>`<option ${h==='01:00'?'selected':''}>${h}</option>`).join('')}</select></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovoAnalista">Cadastrar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovoAnalista').onclick = async ()=>{
      const name = document.getElementById('fName').value.trim();
      const email = document.getElementById('fEmail').value.trim();
      const password = document.getElementById('fPass').value.trim() || 'demo123';
      const dias = Array.from(document.querySelectorAll('.fDia:checked')).map(c=>c.value);
      const horaInicio = document.getElementById('fJHi').value;
      const horaFim = document.getElementById('fJHf').value;
      if(!name || !email) return;
      const jornada = {dias, horaInicio, horaFim};
      if(session.demoMode){
        DB.users.push({id:uid('u_ana'), role:'analista', name, email, supervisorId:session.userId, active:true, jornada});
        closeModal(); renderMain();
        return;
      }
      try{
        const novo = await apiCreateUser({ role:'analista', name, email, password, supervisorId:session.userId, jornada });
        DB.users.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível cadastrar: '+e.message); }
    };
  });

  const btnBaixarModeloAnalista = document.getElementById('btnBaixarModeloAnalista');
  if(btnBaixarModeloAnalista) btnBaixarModeloAnalista.addEventListener('click', ()=>{
    downloadXLSX('modelo_analistas.xlsx',
      ['nome','email','senha','dias','hora_inicio','hora_fim'],
      ['Nome Completo','nome@kronoop.local','demo123','seg,ter,qua,qui,sex','19:00','01:00']);
  });
  const fileImportAnalista = document.getElementById('fileImportAnalista');
  if(fileImportAnalista) fileImportAnalista.addEventListener('change', async ()=>{
    const file = fileImportAnalista.files[0]; if(!file) return;
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportAnalista.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    for(const r of rows){
      const name = (r.nome||'').trim();
      const email = (r.email||'').trim();
      if(!name || !email){ fail++; continue; }
      const dias = (r.dias||'').split(',').map(d=>d.trim().toLowerCase()).filter(Boolean);
      const jornada = { dias: dias.length?dias:['seg','ter','qua','qui','sex'], horaInicio:r.hora_inicio||'19:00', horaFim:r.hora_fim||'01:00' };
      if(session.demoMode){
        DB.users.push({id:uid('u_ana'), role:'analista', name, email, supervisorId:session.userId, active:true, jornada});
        ok++; continue;
      }
      const password = (r.senha||'').trim() || 'demo123';
      try{
        const novo = await apiCreateUser({ role:'analista', name, email, password, supervisorId:session.userId, jornada });
        DB.users.push(novo);
        ok++;
      }catch(e){ console.error('Falha ao importar', name, e); fail++; }
    }
    fileImportAnalista.value=''; renderMain();
    alert(`Importação concluída: ${ok} analista(s) adicionado(s)${fail?`, ${fail} linha(s) ignorada(s) (nome/e-mail ausente ou e-mail já cadastrado)`:''}.`);
  });

  const btnNovaMestra = document.getElementById('btnNovaMestra');
  if(btnNovaMestra) btnNovaMestra.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    openModal(`<h3>Nova entrada — Operações Fixas</h3>
      <div class="field"><label>Analista (titular)</label><select id="fAnalista">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>Operação (sigla)</label><input id="fOp" placeholder="ex: COL-A"></div>
      <div class="field"><label>Ciclo</label><input id="fCiclo" value="T3"></div>
      <div class="grid-2"><div class="field"><label>Início</label><select id="fHi">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div>
      <div class="field"><label>Fim</label><select id="fHf">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div></div>
      <div class="grid-2"><div class="field"><label>Vigência início</label><input type="date" id="fDi" value="${todayISO()}"></div>
      <div class="field"><label>Vigência fim</label><input type="date" id="fDf" value="2026-12-31"></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovaMestra">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovaMestra').onclick = async ()=>{
      const analistaId = document.getElementById('fAnalista').value;
      const titular = userById(analistaId).name;
      const entrada = {analistaId, operacao:document.getElementById('fOp').value||'OP', ciclo:document.getElementById('fCiclo').value,
        horaInicio:document.getElementById('fHi').value, horaFim:document.getElementById('fHf').value, titular,
        dataInicio:document.getElementById('fDi').value, dataFim:document.getElementById('fDf').value};
      if(session.demoMode){ DB.baseMestra.push({id:uid('bm'), ...entrada}); closeModal(); renderMain(); return; }
      try{
        const novo = await apiCreateBaseMestra(entrada);
        DB.baseMestra.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });

  const btnNovaSuplencia = document.getElementById('btnNovaSuplencia');
  if(btnNovaSuplencia) btnNovaSuplencia.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    openModal(`<h3>Nova cobertura avulsa</h3>
      <div class="field"><label>Analista original (quem está sendo coberto)</label><select id="fOrig">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>Suplente</label><select id="fSup">${myAnalistas.map(a=>`<option value="${a.name}">${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>Operação</label><input id="fOp2" placeholder="ex: COL-B"></div>
      <div class="grid-2"><div class="field"><label>Início</label><select id="fHi2">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div>
      <div class="field"><label>Fim</label><select id="fHf2">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div></div>
      <div class="field"><label>Data da cobertura</label><input type="date" id="fData" value="${todayISO()}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovaSuplencia">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovaSuplencia').onclick = async ()=>{
      const analistaOriginalId = document.getElementById('fOrig').value;
      const entrada = {operacao:document.getElementById('fOp2').value||'OP', ciclo:'T3',
        horaInicio:document.getElementById('fHi2').value, horaFim:document.getElementById('fHf2').value,
        suplente:document.getElementById('fSup').value||'—', dataCobertura:document.getElementById('fData').value, analistaOriginalId};
      if(session.demoMode){ DB.suplencias.push({id:uid('sp'), ...entrada}); closeModal(); renderMain(); return; }
      try{
        const novo = await apiCreateSuplencia(entrada);
        DB.suplencias.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });

  main.querySelectorAll('[data-gradefilter]').forEach(sel=>{
    sel.addEventListener('change', ()=>{ uiState.gradeFilters[sel.dataset.gradefilter] = sel.value; renderMain(); });
  });

  main.querySelectorAll('[data-metricasfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.metricasfiltro;
      uiState.metricasFiltro[key] = inp.value;
      if(uiState.metricasFiltro.inicio > uiState.metricasFiltro.fim){
        uiState.metricasFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });

  const progSel = document.getElementById('progAnalistaSel');
  if(progSel) progSel.addEventListener('change', ()=>{ uiState.progAnalista = progSel.value; renderMain(); });
  const progDate = document.getElementById('progDateSel');
  if(progDate) progDate.addEventListener('change', ()=>{ uiState.progDate = progDate.value; renderMain(); });

  const btnGerarSugestao = document.getElementById('btnGerarSugestao');
  if(btnGerarSugestao) btnGerarSugestao.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const analistaId = document.getElementById('sugAnalista').value;
    const data = document.getElementById('sugData').value;
    const tipo = document.getElementById('sugTipo').value;
    const bms = DB.baseMestra.filter(b=>b.analistaId===analistaId && data>=b.dataInicio && data<=b.dataFim);
    const items = bms.map(bm=>{
      const candidatos = candidatosParaSlot(myAnalistas, analistaId, bm, data);
      return { bmId: bm.id, candidatos, chosenId: candidatos[0]?.id || '' };
    });
    uiState.sugerir = { analistaId, data, tipo, items };
    renderMain();
  });
  main.querySelectorAll('[data-sugerir-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const idx = parseInt(sel.dataset.sugerirIdx,10);
      uiState.sugerir.items[idx].chosenId = sel.value;
    });
  });
  const btnConfirmarSugestao = document.getElementById('btnConfirmarSugestao');
  if(btnConfirmarSugestao) btnConfirmarSugestao.addEventListener('click', async ()=>{
    const st = uiState.sugerir;
    let count=0, fail=0;
    for(const it of st.items){
      if(!it.chosenId) continue;
      const bm = DB.baseMestra.find(b=>b.id===it.bmId);
      const entrada = {analistaId:st.analistaId, baseMestraId:bm.id, operacao:bm.operacao, ciclo:bm.ciclo,
        horaInicio:bm.horaInicio, horaFim:bm.horaFim, data:st.data, tipo:st.tipo, suplenteId:it.chosenId};
      if(session.demoMode){
        DB.ausencias.push({id:uid('af'), ...entrada});
        count++; continue;
      }
      try{
        const novo = await apiCreateAusencia(entrada);
        DB.ausencias.push(novo);
        count++;
      }catch(e){ console.error('KronoOP: falha ao cobrir operação.', e); fail++; }
    }
    uiState.sugerir = null;
    renderMain();
    alert(`${count} operação(ões) coberta(s) com sucesso.${fail?` ${fail} falharam.`:''}`);
  });

  const btnNovaReuniao = document.getElementById('btnNovaReuniao');
  if(btnNovaReuniao) btnNovaReuniao.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    openModal(`<h3>Nova reunião</h3>
      <div class="field"><label>Tipo</label><select id="fRTipo"><option value="grupo">Grupo</option><option value="individual">Individual</option></select></div>
      <div class="field"><label>Título</label><input id="fRTitulo" placeholder="ex: Alinhamento semanal"></div>
      <div class="grid-2"><div class="field"><label>Data</label><input type="date" id="fRData" value="${todayISO()}"></div>
      <div class="field"><label>Hora</label><select id="fRHora">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div></div>
      <div class="field" id="fRAnalistaWrap" style="display:none;"><label>Analista</label><select id="fRAnalista">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovaReuniao">Agendar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    const tipoSel = document.getElementById('fRTipo');
    const wrap = document.getElementById('fRAnalistaWrap');
    tipoSel.addEventListener('change', ()=>{ wrap.style.display = tipoSel.value==='individual' ? 'block':'none'; });
    document.getElementById('confirmNovaReuniao').onclick = async ()=>{
      const tipo = tipoSel.value;
      const analistaIds = tipo==='individual' ? [document.getElementById('fRAnalista').value] : [];
      const entrada = {tipo, titulo:document.getElementById('fRTitulo').value||'Reunião', data:document.getElementById('fRData').value,
        hora:document.getElementById('fRHora').value, analistaIds, supervisorId:session.userId, criadoPor:session.name};
      if(session.demoMode){ DB.reunioes.push({id:uid('rn'), ...entrada}); closeModal(); renderMain(); return; }
      try{
        const novo = await apiCreateReuniao(entrada);
        DB.reunioes.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível agendar: '+e.message); }
    };
  });

  const btnNovoPlantao = document.getElementById('btnNovoPlantao');
  if(btnNovoPlantao) btnNovoPlantao.addEventListener('click', ()=>{
    openModal(`<h3>Definir plantão na minha ausência</h3>
      <div class="field"><label>Data da ausência</label><input type="date" id="fPData" value="${todayISO()}"></div>
      <div class="field"><label>Cargo do plantonista</label><select id="fPRole"><option>Supervisor</option><option>Analista</option><option>Coordenador</option></select></div>
      <div class="field"><label>Nome do plantonista</label><input id="fPNome" placeholder="ex: Thiago Barros"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovoPlantao">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovoPlantao').onclick = async ()=>{
      const entrada = {supervisorAusenteId:session.userId, data:document.getElementById('fPData').value,
        coberturaRole:document.getElementById('fPRole').value, coberturaNome:document.getElementById('fPNome').value||'—'};
      if(session.demoMode){ DB.plantoes.push({id:uid('pl'), ...entrada}); closeModal(); renderMain(); return; }
      try{
        const novo = await apiCreatePlantao(entrada);
        DB.plantoes.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });

  const btnBaixarModeloMestra = document.getElementById('btnBaixarModeloMestra');
  if(btnBaixarModeloMestra) btnBaixarModeloMestra.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const exemplo = myAnalistas[0]?.name || 'Nome do Analista';
    downloadXLSX('modelo_base_mestra.xlsx',
      ['analista','operacao','ciclo','hora_inicio','hora_fim','data_inicio','data_fim'],
      [exemplo,'COL-A','T3','19:00','23:00', todayISO(), '2026-12-31']);
  });
  const fileImportMestra = document.getElementById('fileImportMestra');
  if(fileImportMestra) fileImportMestra.addEventListener('change', async ()=>{
    const file = fileImportMestra.files[0]; if(!file) return;
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportMestra.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    for(const r of rows){
      const a = findAnalistaByName(myAnalistas, r.analista);
      if(!a || !r.operacao || !r.hora_inicio || !r.hora_fim){ fail++; continue; }
      const entrada = {analistaId:a.id, operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, titular:a.name,
        dataInicio:r.data_inicio||todayISO(), dataFim:r.data_fim||'2026-12-31'};
      if(session.demoMode){ DB.baseMestra.push({id:uid('bm'), ...entrada}); ok++; continue; }
      try{ DB.baseMestra.push(await apiCreateBaseMestra(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar', r.analista, e); fail++; }
    }
    fileImportMestra.value=''; renderMain();
    alert(`Importação concluída: ${ok} entrada(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s) (analista ou campos não reconhecidos)`:''}.`);
  });

  main.querySelectorAll('[data-excluir-mestra]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta operação fixa? Ela deixará de aparecer na base do analista.')) return;
      const id = btn.dataset.excluirMestra;
      if(session.demoMode){ DB.baseMestra = DB.baseMestra.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteBaseMestra(id); DB.baseMestra = DB.baseMestra.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnBaixarModeloSuplencia = document.getElementById('btnBaixarModeloSuplencia');
  if(btnBaixarModeloSuplencia) btnBaixarModeloSuplencia.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const exemplo = myAnalistas[0]?.name || 'Nome do Analista Original';
    downloadXLSX('modelo_coberturas_avulsas.xlsx',
      ['analista_original','suplente','operacao','ciclo','hora_inicio','hora_fim','data_cobertura'],
      [exemplo,'Nome do Suplente','COL-B','T3','19:00','23:00', todayISO()]);
  });
  const fileImportSuplencia = document.getElementById('fileImportSuplencia');
  if(fileImportSuplencia) fileImportSuplencia.addEventListener('change', async ()=>{
    const file = fileImportSuplencia.files[0]; if(!file) return;
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportSuplencia.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    for(const r of rows){
      const orig = findAnalistaByName(myAnalistas, r.analista_original);
      if(!orig || !r.suplente || !r.operacao || !r.hora_inicio || !r.hora_fim || !r.data_cobertura){ fail++; continue; }
      const entrada = {operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, suplente:r.suplente,
        dataCobertura:r.data_cobertura, analistaOriginalId:orig.id};
      if(session.demoMode){ DB.suplencias.push({id:uid('sp'), ...entrada}); ok++; continue; }
      try{ DB.suplencias.push(await apiCreateSuplencia(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar cobertura', e); fail++; }
    }
    fileImportSuplencia.value=''; renderMain();
    alert(`Importação concluída: ${ok} cobertura(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s)`:''}.`);
  });

  main.querySelectorAll('[data-excluir-suplencia]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta cobertura avulsa?')) return;
      const id = btn.dataset.excluirSuplencia;
      if(session.demoMode){ DB.suplencias = DB.suplencias.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteSuplencia(id); DB.suplencias = DB.suplencias.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnBaixarModeloAusencia = document.getElementById('btnBaixarModeloAusencia');
  if(btnBaixarModeloAusencia) btnBaixarModeloAusencia.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const exemplo = myAnalistas[0]?.name || 'Nome do Analista';
    const opExemplo = DB.baseMestra.find(b=>b.analistaId===myAnalistas[0]?.id)?.operacao || 'COL-A';
    downloadXLSX('modelo_folgas_ferias_por_operacao.xlsx',
      ['analista','operacao','data','tipo','suplente'],
      [exemplo, opExemplo, todayISO(), 'folga', 'Nome do Suplente']);
  });
  const fileImportAusencia = document.getElementById('fileImportAusencia');
  if(fileImportAusencia) fileImportAusencia.addEventListener('change', async ()=>{
    const file = fileImportAusencia.files[0]; if(!file) return;
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportAusencia.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    for(const r of rows){
      const a = findAnalistaByName(myAnalistas, r.analista);
      const tipo = (r.tipo||'').trim().toLowerCase();
      if(!a || !r.data || !r.operacao || (tipo!=='folga' && tipo!=='ferias')){ fail++; continue; }
      const bm = DB.baseMestra.find(b=>b.analistaId===a.id && b.operacao===r.operacao && r.data>=b.dataInicio && r.data<=b.dataFim);
      if(!bm){ fail++; continue; }
      const suplenteMatch = myAnalistas.find(x=>x.name.trim().toLowerCase()===(r.suplente||'').trim().toLowerCase());
      const entrada = {analistaId:a.id, baseMestraId:bm.id, operacao:bm.operacao, ciclo:bm.ciclo,
        horaInicio:bm.horaInicio, horaFim:bm.horaFim, data:r.data, tipo, suplenteId:suplenteMatch?.id||null, suplenteNome:suplenteMatch?null:(r.suplente||'')};
      if(session.demoMode){ DB.ausencias.push({id:uid('af'), ...entrada}); ok++; continue; }
      try{ DB.ausencias.push(await apiCreateAusencia(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar ausência', e); fail++; }
    }
    fileImportAusencia.value=''; renderMain();
    alert(`Importação concluída: ${ok} registro(s) adicionado(s)${fail?`, ${fail} linha(s) ignorada(s) (analista/operação não encontrados)`:''}.`);
  });

  main.querySelectorAll('[data-editar-ausencia]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const a = DB.ausencias.find(x=>x.id===btn.dataset.editarAusencia);
      if(!a) return;
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      const suplenteAtual = userById(a.suplenteId)?.name || a.suplenteNome || '';
      openModal(`<h3>Editar folga/férias</h3>
        <div class="help-text">${userById(a.analistaId)?.name||'—'} · ${a.operacao}</div>
        <div class="field"><label>Data</label><input type="date" id="fEditAusenciaData" value="${a.data}"></div>
        <div class="field"><label>Tipo</label>
          <select id="fEditAusenciaTipo">
            <option value="folga" ${a.tipo==='folga'?'selected':''}>Folga</option>
            <option value="ferias" ${a.tipo==='ferias'?'selected':''}>Férias</option>
          </select>
        </div>
        <div class="field"><label>Suplente</label>
          <select id="fEditAusenciaSup">
            <option value="">Sem suplente</option>
            ${myAnalistas.map(x=>`<option value="${x.name}" ${x.name===suplenteAtual?'selected':''}>${x.name}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditAusencia">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditAusencia').onclick = async ()=>{
        const supName = document.getElementById('fEditAusenciaSup').value;
        const supMatch = myAnalistas.find(x=>x.name===supName);
        const patch = {
          data: document.getElementById('fEditAusenciaData').value || a.data,
          tipo: document.getElementById('fEditAusenciaTipo').value,
          suplenteId: supMatch?.id || null,
          suplenteNome: supMatch ? null : (supName || ''),
        };
        if(session.demoMode){ Object.assign(a, patch); closeModal(); renderMain(); return; }
        try{
          const atualizado = await apiUpdateAusencia(a.id, patch);
          Object.assign(a, atualizado);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });
  main.querySelectorAll('[data-excluir-ausencia]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este registro de folga/férias?')) return;
      const id = btn.dataset.excluirAusencia;
      if(session.demoMode){ DB.ausencias = DB.ausencias.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteAusencia(id); DB.ausencias = DB.ausencias.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-editar-recado]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = DB.recados.find(x=>x.id===btn.dataset.editarRecado);
      openModal(`<h3>Editar comunicado</h3>
        <div class="field"><label>Título</label><input id="fEditRecadoTitulo" value="${escapeHtml(r.titulo||'')}"></div>
        <div class="field"><label>Mensagem</label><textarea id="fEditRecado" rows="4" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(r.texto)}</textarea></div>
        <div class="field"><label>Observações</label><textarea id="fEditRecadoObs" rows="2" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(r.observacoes||'')}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditRecado">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditRecado').onclick = async ()=>{
        const novo = document.getElementById('fEditRecado').value.trim();
        if(!novo) return;
        const patch = {
          texto: novo,
          titulo: document.getElementById('fEditRecadoTitulo').value.trim(),
          observacoes: document.getElementById('fEditRecadoObs').value.trim(),
        };
        if(session.demoMode){ Object.assign(r, patch, {editado:true}); closeModal(); renderMain(); return; }
        try{
          const atualizado = await apiUpdateRecado(r.id, patch);
          Object.assign(r, atualizado);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });
  main.querySelectorAll('[data-excluir-recado]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este comunicado? Ele deixará de aparecer para os analistas.')) return;
      const id = btn.dataset.excluirRecado;
      if(session.demoMode){ DB.recados = DB.recados.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteRecado(id); DB.recados = DB.recados.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnEnviarLembrete = document.getElementById('btnEnviarLembrete');
  if(btnEnviarLembrete) btnEnviarLembrete.addEventListener('click', async ()=>{
    const alvo = document.getElementById('lembreteAlvo').value;
    const txt = document.getElementById('lembreteTxt').value.trim();
    if(!txt) return;
    const titulo = document.getElementById('lembreteTitulo').value.trim();
    const obs = document.getElementById('lembreteObs').value.trim();
    const target = alvo==='all' ? 'all_ana_'+session.userId : alvo;
    const data = document.getElementById('lembreteData').value || todayISO();
    const hora = document.getElementById('lembreteHora').value || '';
    const entrada = {origem:'supervisor', target, criadoPor:session.name, titulo, texto:txt, observacoes: obs, data, hora};
    if(session.demoMode){ DB.lembretes.push({id:uid('lb'), ...entrada, done:false, ts:Date.now()}); renderMain(); return; }
    try{
      const novo = await apiCreateLembrete(entrada);
      DB.lembretes.push(novo);
      renderMain();
    }catch(e){ alert('Não foi possível enviar: '+e.message); }
  });

  const btnEnviarRecado = document.getElementById('btnEnviarRecado');
  if(btnEnviarRecado) btnEnviarRecado.addEventListener('click', async ()=>{
    const txt = document.getElementById('transmMsg').value.trim();
    if(!txt) return;
    const titulo = document.getElementById('transmTitulo').value.trim();
    const obs = document.getElementById('transmObs').value.trim();
    const entrada = {from:`${session.name} (Supervisor)`, to:'all_ana_'+session.userId, titulo, texto:txt, observacoes: obs};
    if(session.demoMode){ DB.recados.push({id:uid('rc'), ...entrada, ts:Date.now(), lidoPor:[]}); renderMain(); return; }
    try{
      const novo = await apiCreateRecado(entrada);
      DB.recados.push(novo);
      renderMain();
    }catch(e){ alert('Não foi possível enviar: '+e.message); }
  });

  main.querySelectorAll('[data-enviofiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.enviofiltro;
      uiState.envioFiltro[key] = inp.value;
      if(uiState.envioFiltro.inicio > uiState.envioFiltro.fim){
        uiState.envioFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });
  main.querySelectorAll('[data-excluir-lembrete-enviado]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este lembrete enviado?')) return;
      const id = btn.dataset.excluirLembreteEnviado;
      if(session.demoMode){ DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); return; }
      try{ await apiDeleteLembrete(id); DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-ocorrenciafiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.ocorrenciafiltro;
      uiState.ocorrenciasFiltro[key] = inp.value;
      if(key!=='analista' && uiState.ocorrenciasFiltro.inicio > uiState.ocorrenciasFiltro.fim){
        uiState.ocorrenciasFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });

  main.querySelectorAll('[data-resetpw]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const u = userById(btn.dataset.resetpw);
      openModal(`<h3>Resetar senha — ${u.name}</h3>
        <div class="field"><label>Nova senha</label><input id="fNewPass" value="demo123"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmReset">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmReset').onclick = async ()=>{
        const novaSenha = document.getElementById('fNewPass').value || 'demo123';
        if(session.demoMode){ closeModal(); return; } // sem conta real pra resetar
        try{
          await apiUpdateUser(u.id, { password: novaSenha });
          closeModal();
        }catch(e){ alert('Não foi possível resetar a senha: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-analista]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const u = userById(btn.dataset.excluirAnalista);
      if(!u) return;
      if(!confirm(`Excluir ${u.name}? Essa ação não pode ser desfeita.`)) return;
      if(session.demoMode){
        DB.users = DB.users.filter(x=>x.id!==u.id);
        renderMain();
        return;
      }
      try{
        await apiDeleteUser(u.id);
        DB.users = DB.users.filter(x=>x.id!==u.id);
        renderMain();
      }catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnNovoSupervisor = document.getElementById('btnNovoSupervisor');
  if(btnNovoSupervisor) btnNovoSupervisor.addEventListener('click', ()=>{
    openModal(`<h3>Novo Supervisor</h3>
      <div class="field"><label>Nome completo</label><input id="fName2"></div>
      <div class="field"><label>E-mail</label><input id="fEmail2"></div>
      <div class="field"><label>Senha inicial</label><input id="fPass2" value="demo123"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovoSupervisor">Cadastrar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovoSupervisor').onclick = async ()=>{
      const name = document.getElementById('fName2').value.trim();
      const email = document.getElementById('fEmail2').value.trim();
      const password = document.getElementById('fPass2').value.trim() || 'demo123';
      if(!name || !email) return;
      if(session.demoMode){
        DB.users.push({id:uid('u_sup'), role:'supervisor', name, email, coordenadorId:session.userId, active:true});
        closeModal(); renderMain();
        return;
      }
      try{
        const novo = await apiCreateUser({ role:'supervisor', name, email, password, coordenadorId:session.userId });
        DB.users.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível cadastrar: '+e.message); }
    };
  });
}
