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
      try{ await apiUpdateLembrete(l.id, {done}); l.done = done; renderMain(); }
      catch(e){ alert('Não foi possível atualizar o lembrete: '+e.message); }
    });
  });
  main.querySelectorAll('[data-lembrete-del]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.dataset.lembreteDel;
      try{ await apiDeleteLembrete(id); DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir o lembrete: '+e.message); }
    });
  });
  main.querySelectorAll('[data-lembretenav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ uiState.lembretesDate = btn.dataset.lembretenav; renderMain(); });
  });

  const btnEnviarFeedback = document.getElementById('btnEnviarFeedback');
  if(btnEnviarFeedback) btnEnviarFeedback.addEventListener('click', async ()=>{
    const msgEl = document.getElementById('feedbackMsg');
    setFormMsg(msgEl, '', true);
    const txt = document.getElementById('feedbackTxt').value.trim();
    if(!txt){ setFormMsg(msgEl, 'Escreva sua mensagem antes de enviar.', true); return; }
    btnEnviarFeedback.disabled = true;
    try{
      await apiCreateFeedback({texto: txt});
      document.getElementById('feedbackTxt').value = '';
      setFormMsg(document.getElementById('feedbackMsg'), 'Feedback enviado — obrigado!', false);
    }catch(e){
      setFormMsg(msgEl, 'Não foi possível enviar: '+e.message, true);
    }
    btnEnviarFeedback.disabled = false;
  });

  main.querySelectorAll('[data-inbox-row]').forEach(row=>{
    row.addEventListener('click', ()=>{ uiState.inboxSelected = row.dataset.inboxRow; renderMain(); });
  });

  main.querySelectorAll('[data-confirmar-leitura]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const r = DB.recados.find(x=>x.id===btn.dataset.confirmarLeitura);
      if(!r) return;
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
  main.querySelectorAll('[data-opfiltro]').forEach(sel=>{
    sel.addEventListener('change', ()=>{ uiState.analistaOpFiltro = sel.value; renderMain(); });
  });

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
    openProgressModal('Importando analistas...');
    for(const [idx, r] of rows.entries()){
      const name = (r.nome||'').trim();
      const email = (r.email||'').trim();
      if(!name || !email){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      const dias = (r.dias||'').split(',').map(d=>d.trim().toLowerCase()).filter(Boolean);
      const jornada = { dias: dias.length?dias:['seg','ter','qua','qui','sex'], horaInicio:r.hora_inicio||'19:00', horaFim:r.hora_fim||'01:00' };
      const password = (r.senha||'').trim() || 'demo123';
      try{
        const novo = await apiCreateUser({ role:'analista', name, email, password, supervisorId:session.userId, jornada });
        DB.users.push(novo);
        ok++;
      }catch(e){ console.error('Falha ao importar', name, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
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
      <div class="grid-2"><div class="field"><label>Operação</label><input id="fOp2" placeholder="ex: COL-B"></div>
      <div class="field"><label>Ciclo</label><input id="fCiclo2" value="T3"></div></div>
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
      const entrada = {operacao:document.getElementById('fOp2').value||'OP', ciclo:document.getElementById('fCiclo2').value||'T3',
        horaInicio:document.getElementById('fHi2').value, horaFim:document.getElementById('fHf2').value,
        suplente:document.getElementById('fSup').value||'—', dataCobertura:document.getElementById('fData').value, analistaOriginalId};
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
      try{
        const novo = await apiCreatePlantao(entrada);
        DB.plantoes.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });

  main.querySelectorAll('[data-editar-reuniao]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = DB.reunioes.find(x=>x.id===btn.dataset.editarReuniao);
      if(!r) return;
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      openModal(`<h3>Editar reunião</h3>
        <div class="field"><label>Tipo</label><select id="fEditRTipo"><option value="grupo" ${r.tipo==='grupo'?'selected':''}>Grupo</option><option value="individual" ${r.tipo==='individual'?'selected':''}>Individual</option></select></div>
        <div class="field"><label>Título</label><input id="fEditRTitulo" value="${r.titulo}"></div>
        <div class="grid-2"><div class="field"><label>Data</label><input type="date" id="fEditRData" value="${r.data}"></div>
        <div class="field"><label>Hora</label><select id="fEditRHora">${HOURS.map(h=>`<option ${h===r.hora?'selected':''}>${h}</option>`).join('')}</select></div></div>
        <div class="field" id="fEditRAnalistaWrap" style="${r.tipo==='individual'?'':'display:none;'}"><label>Analista</label><select id="fEditRAnalista">${myAnalistas.map(a=>`<option value="${a.id}" ${a.id===r.analistaIds[0]?'selected':''}>${a.name}</option>`).join('')}</select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarReuniao">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const tipoSel = document.getElementById('fEditRTipo');
      const wrap = document.getElementById('fEditRAnalistaWrap');
      tipoSel.addEventListener('change', ()=>{ wrap.style.display = tipoSel.value==='individual' ? 'block':'none'; });
      document.getElementById('confirmEditarReuniao').onclick = async ()=>{
        const tipo = tipoSel.value;
        const analistaIds = tipo==='individual' ? [document.getElementById('fEditRAnalista').value] : [];
        const patch = {tipo, titulo:document.getElementById('fEditRTitulo').value||'Reunião',
          data:document.getElementById('fEditRData').value, hora:document.getElementById('fEditRHora').value, analistaIds};
        try{
          const atualizado = await apiUpdateReuniao(r.id, patch);
          DB.reunioes = DB.reunioes.map(x=>x.id===r.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-reuniao]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta reunião?')) return;
      const id = btn.dataset.excluirReuniao;
      try{ await apiDeleteReuniao(id); DB.reunioes = DB.reunioes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-editar-plantao]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = DB.plantoes.find(x=>x.id===btn.dataset.editarPlantao);
      if(!p) return;
      openModal(`<h3>Editar plantão</h3>
        <div class="field"><label>Data da ausência</label><input type="date" id="fEditPData" value="${p.data}"></div>
        <div class="field"><label>Cargo do plantonista</label><select id="fEditPRole">
          ${['Supervisor','Analista','Coordenador'].map(r=>`<option ${p.coberturaRole===r?'selected':''}>${r}</option>`).join('')}
        </select></div>
        <div class="field"><label>Nome do plantonista</label><input id="fEditPNome" value="${p.coberturaNome}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarPlantao">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarPlantao').onclick = async ()=>{
        const patch = {data:document.getElementById('fEditPData').value,
          coberturaRole:document.getElementById('fEditPRole').value, coberturaNome:document.getElementById('fEditPNome').value||'—'};
        try{
          const atualizado = await apiUpdatePlantao(p.id, patch);
          DB.plantoes = DB.plantoes.map(x=>x.id===p.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-plantao]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este plantão?')) return;
      const id = btn.dataset.excluirPlantao;
      try{ await apiDeletePlantao(id); DB.plantoes = DB.plantoes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
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
    openProgressModal('Importando operações fixas...');
    for(const [idx, r] of rows.entries()){
      const a = findAnalistaByName(myAnalistas, r.analista);
      if(!a || !r.operacao || !r.hora_inicio || !r.hora_fim){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      const entrada = {analistaId:a.id, operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, titular:a.name,
        dataInicio:r.data_inicio||todayISO(), dataFim:r.data_fim||'2026-12-31'};
      try{ DB.baseMestra.push(await apiCreateBaseMestra(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar', r.analista, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportMestra.value=''; renderMain();
    alert(`Importação concluída: ${ok} entrada(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s) (analista ou campos não reconhecidos)`:''}.`);
  });

  main.querySelectorAll('[data-editar-mestra]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const b = DB.baseMestra.find(x=>x.id===btn.dataset.editarMestra);
      if(!b) return;
      openModal(`<h3>Editar operação fixa</h3>
        <div class="field"><label>Operação (sigla)</label><input id="fEditOp" value="${b.operacao}"></div>
        <div class="field"><label>Ciclo</label><input id="fEditCiclo" value="${b.ciclo}"></div>
        <div class="grid-2"><div class="field"><label>Início</label><select id="fEditHi">${HOURS.map(h=>`<option ${h===b.horaInicio?'selected':''}>${h}</option>`).join('')}</select></div>
        <div class="field"><label>Fim</label><select id="fEditHf">${HOURS.map(h=>`<option ${h===b.horaFim?'selected':''}>${h}</option>`).join('')}</select></div></div>
        <div class="grid-2"><div class="field"><label>Vigência início</label><input type="date" id="fEditDi" value="${b.dataInicio}"></div>
        <div class="field"><label>Vigência fim</label><input type="date" id="fEditDf" value="${b.dataFim}"></div></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarMestra">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarMestra').onclick = async ()=>{
        const patch = {
          operacao: document.getElementById('fEditOp').value || b.operacao,
          ciclo: document.getElementById('fEditCiclo').value || b.ciclo,
          horaInicio: document.getElementById('fEditHi').value,
          horaFim: document.getElementById('fEditHf').value,
          dataInicio: document.getElementById('fEditDi').value,
          dataFim: document.getElementById('fEditDf').value,
        };
        try{
          const atualizado = await apiUpdateBaseMestra(b.id, patch);
          DB.baseMestra = DB.baseMestra.map(x=>x.id===b.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-mestra]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta operação fixa? Ela deixará de aparecer na base do analista.')) return;
      const id = btn.dataset.excluirMestra;
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
    openProgressModal('Importando coberturas avulsas...');
    for(const [idx, r] of rows.entries()){
      const orig = findAnalistaByName(myAnalistas, r.analista_original);
      if(!orig || !r.suplente || !r.operacao || !r.hora_inicio || !r.hora_fim || !r.data_cobertura){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      const entrada = {operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, suplente:r.suplente,
        dataCobertura:r.data_cobertura, analistaOriginalId:orig.id};
      try{ DB.suplencias.push(await apiCreateSuplencia(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar cobertura', e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportSuplencia.value=''; renderMain();
    alert(`Importação concluída: ${ok} cobertura(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s)`:''}.`);
  });

  main.querySelectorAll('[data-excluir-suplencia]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta cobertura avulsa?')) return;
      const id = btn.dataset.excluirSuplencia;
      try{ await apiDeleteSuplencia(id); DB.suplencias = DB.suplencias.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-editar-suplencia]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const s = DB.suplencias.find(x=>x.id===btn.dataset.editarSuplencia);
      if(!s) return;
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      openModal(`<h3>Editar cobertura avulsa</h3>
        <div class="help-text">Cobrindo: ${userById(s.analistaOriginalId)?.name||'—'}</div>
        <div class="field"><label>Suplente</label><select id="fEditSupSuplente">${myAnalistas.map(a=>`<option value="${a.name}" ${a.name===s.suplente?'selected':''}>${a.name}</option>`).join('')}</select></div>
        <div class="grid-2"><div class="field"><label>Operação</label><input id="fEditSupOp" value="${s.operacao}"></div>
        <div class="field"><label>Ciclo</label><input id="fEditSupCiclo" value="${s.ciclo||'T3'}"></div></div>
        <div class="grid-2"><div class="field"><label>Início</label><select id="fEditSupHi">${HOURS.map(h=>`<option ${h===s.horaInicio?'selected':''}>${h}</option>`).join('')}</select></div>
        <div class="field"><label>Fim</label><select id="fEditSupHf">${HOURS.map(h=>`<option ${h===s.horaFim?'selected':''}>${h}</option>`).join('')}</select></div></div>
        <div class="field"><label>Data da cobertura</label><input type="date" id="fEditSupData" value="${s.dataCobertura}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarSuplencia">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarSuplencia').onclick = async ()=>{
        const patch = {
          operacao: document.getElementById('fEditSupOp').value || s.operacao,
          ciclo: document.getElementById('fEditSupCiclo').value || s.ciclo || 'T3',
          horaInicio: document.getElementById('fEditSupHi').value,
          horaFim: document.getElementById('fEditSupHf').value,
          suplente: document.getElementById('fEditSupSuplente').value,
          dataCobertura: document.getElementById('fEditSupData').value,
        };
        try{
          const atualizado = await apiUpdateSuplencia(s.id, patch);
          DB.suplencias = DB.suplencias.map(x=>x.id===s.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-suplenciafiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.suplenciafiltro;
      uiState.suplenciasFiltro[key] = inp.value;
      if((key==='inicio'||key==='fim') && uiState.suplenciasFiltro.inicio && uiState.suplenciasFiltro.fim && uiState.suplenciasFiltro.inicio > uiState.suplenciasFiltro.fim){
        uiState.suplenciasFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });

  const btnExcluirTodasSuplencias = document.getElementById('btnExcluirTodasSuplencias');
  if(btnExcluirTodasSuplencias) btnExcluirTodasSuplencias.addEventListener('click', async ()=>{
    const ids = Array.from(main.querySelectorAll('[data-excluir-suplencia]')).map(b=>b.dataset.excluirSuplencia);
    if(ids.length===0) return;
    if(!confirm(`Excluir ${ids.length} cobertura(s) avulsa(s) (conforme o filtro atual)? Essa ação não pode ser desfeita.`)) return;
    let ok=0, fail=0;
    openProgressModal('Excluindo coberturas avulsas...');
    for(const [idx, id] of ids.entries()){
      try{ await apiDeleteSuplencia(id); DB.suplencias = DB.suplencias.filter(x=>x.id!==id); ok++; }
      catch(e){ fail++; }
      updateProgressModal(idx+1, ids.length);
    }
    closeModal();
    renderMain();
    if(fail) alert(`${ok} excluída(s), ${fail} falharam.`);
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
      try{ await apiDeleteLembrete(id); DB.lembretes = DB.lembretes.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-excluir-feedback]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este feedback?')) return;
      const id = btn.dataset.excluirFeedback;
      try{ await apiDeleteFeedback(id); DB.feedbacks = DB.feedbacks.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  main.querySelectorAll('[data-ocorrenciafiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.ocorrenciafiltro;
      uiState.ocorrenciasFiltro[key] = inp.value;
      if((key==='inicio'||key==='fim') && uiState.ocorrenciasFiltro.inicio > uiState.ocorrenciasFiltro.fim){
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
        try{
          await apiUpdateUser(u.id, { password: novaSenha });
          closeModal();
        }catch(e){ alert('Não foi possível resetar a senha: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-editar-analista]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const u = userById(btn.dataset.editarAnalista);
      if(!u) return;
      const diasAtuais = (u.jornada && u.jornada.dias) || ['seg','ter','qua','qui','sex'];
      openModal(`<h3>Editar Analista</h3>
        <div class="field"><label>Nome completo</label><input id="fEditName" value="${u.name}"></div>
        <div class="field"><label>E-mail</label><input id="fEditEmail" value="${u.email}"></div>
        <div class="field"><label>Dias de trabalho</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${WEEKDAYS.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg-2);padding:5px 8px;border-radius:6px;"><input type="checkbox" class="fEditDia" value="${d}" ${diasAtuais.includes(d)?'checked':''}> ${d}</label>`).join('')}
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Jornada — início</label><select id="fEditJHi">${HOURS.map(h=>`<option ${h===(u.jornada?.horaInicio||'19:00')?'selected':''}>${h}</option>`).join('')}</select></div>
          <div class="field"><label>Jornada — fim</label><select id="fEditJHf">${HOURS.map(h=>`<option ${h===(u.jornada?.horaFim||'01:00')?'selected':''}>${h}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarAnalista">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarAnalista').onclick = async ()=>{
        const name = document.getElementById('fEditName').value.trim();
        const email = document.getElementById('fEditEmail').value.trim();
        const dias = Array.from(document.querySelectorAll('.fEditDia:checked')).map(c=>c.value);
        const horaInicio = document.getElementById('fEditJHi').value;
        const horaFim = document.getElementById('fEditJHf').value;
        if(!name || !email) return;
        const patch = { name, email, jornada: {dias, horaInicio, horaFim} };
        try{
          const atualizado = await apiUpdateUser(u.id, patch);
          DB.users = DB.users.map(x=>x.id===u.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-analista]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const u = userById(btn.dataset.excluirAnalista);
      if(!u) return;
      if(!confirm(`Excluir ${u.name}? Essa ação não pode ser desfeita.`)) return;
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
      try{
        const novo = await apiCreateUser({ role:'supervisor', name, email, password, coordenadorId:session.userId });
        DB.users.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível cadastrar: '+e.message); }
    };
  });

  const cfgSaveEmail = document.getElementById('cfgSaveEmail');
  if(cfgSaveEmail) cfgSaveEmail.addEventListener('click', async ()=>{
    const msgEl = document.getElementById('cfgEmailMsg');
    setFormMsg(msgEl, '', true);
    const me = userById(session.userId);
    const newEmail = document.getElementById('cfgNewEmail').value.trim();
    const curPass = document.getElementById('cfgEmailCurPass').value;
    if(!newEmail || !curPass){ setFormMsg(msgEl, 'Preencha o novo e-mail e a senha atual.', true); return; }
    cfgSaveEmail.disabled = true;
    try{
      await KronoAuth.reauthenticate(me.email, curPass);
      const atualizado = await apiUpdateUser(session.userId, { email: newEmail });
      DB.users = DB.users.map(x=>x.id===session.userId ? atualizado : x);
      renderMain();
      setFormMsg(document.getElementById('cfgEmailMsg'), 'E-mail atualizado com sucesso.', false);
    }catch(e){
      setFormMsg(msgEl, KronoAuth.friendlyError(e), true);
      cfgSaveEmail.disabled = false;
    }
  });

  const cfgSavePass = document.getElementById('cfgSavePass');
  if(cfgSavePass) cfgSavePass.addEventListener('click', async ()=>{
    const msgEl = document.getElementById('cfgPassMsg');
    setFormMsg(msgEl, '', true);
    const me = userById(session.userId);
    const curPass = document.getElementById('cfgCurPass').value;
    const newPass = document.getElementById('cfgNewPass').value;
    const newPass2 = document.getElementById('cfgNewPass2').value;
    if(!curPass || !newPass){ setFormMsg(msgEl, 'Preencha a senha atual e a nova senha.', true); return; }
    if(newPass !== newPass2){ setFormMsg(msgEl, 'A confirmação não confere com a nova senha.', true); return; }
    if(newPass.length < 6){ setFormMsg(msgEl, 'A nova senha deve ter ao menos 6 caracteres.', true); return; }
    cfgSavePass.disabled = true;
    try{
      await KronoAuth.reauthenticate(me.email, curPass);
      await KronoAuth.changePassword(newPass);
      document.getElementById('cfgCurPass').value='';
      document.getElementById('cfgNewPass').value='';
      document.getElementById('cfgNewPass2').value='';
      setFormMsg(msgEl, 'Senha atualizada com sucesso.', false);
    }catch(e){
      setFormMsg(msgEl, KronoAuth.friendlyError(e), true);
    }
    cfgSavePass.disabled = false;
  });
}
