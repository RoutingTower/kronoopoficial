/* bindMainEvents(): liga todos os listeners de clique/change do #mainArea a cada render. */

// Wiring genérico dos dropdowns de multi-seleção usados em várias telas
// (Métricas do supervisor/coordenador, Dashboard Global, Painel Hora a
// Hora, Status Operacional) — todos seguem o mesmo HTML (botão toggle +
// checkbox "Todos" + lista de checkboxes de item, ver ex. analistaPicker
// em render-supervisor.js). `filtro` é o objeto do uiState (ex.:
// uiState.metricasFiltro), `key` o campo array dele (ex.: "supervisores"),
// `openKey` o campo booleano do uiState que controla o painel aberto.
function bindMultiselect(main, toggleId, todosId, chkClass, filtro, key, openKey){
  const toggle = document.getElementById(toggleId);
  if(toggle) toggle.addEventListener('click', (e)=>{ e.stopPropagation(); uiState[openKey] = !uiState[openKey]; renderMain(); });
  const todos = document.getElementById(todosId);
  if(todos) todos.addEventListener('click', (e)=>{ e.stopPropagation(); });
  if(todos) todos.addEventListener('change', ()=>{ filtro[key] = []; renderMain(); });
  main.querySelectorAll('.'+chkClass).forEach(chk=>{
    chk.addEventListener('click', (e)=>{ e.stopPropagation(); });
    chk.addEventListener('change', ()=>{
      const arr = filtro[key];
      if(chk.checked){ if(!arr.includes(chk.value)) arr.push(chk.value); }
      else { filtro[key] = arr.filter(x=>x!==chk.value); }
      renderMain();
    });
  });
}

function bindMainEvents(){
  const main = document.getElementById('mainArea');

  // Aba dedicada de Lembretes foi removida — cadastro de um novo agora é
  // um botão na própria Programação que abre modal (ver btnAddLembreteModal
  // em renderAnalista, render-analista.js). Lembretes já existentes
  // continuam aparecendo inline no flashcard do dia (lembreteCardHTML).
  const btnAddLembreteModal = document.getElementById('btnAddLembreteModal');
  if(btnAddLembreteModal) btnAddLembreteModal.addEventListener('click', ()=>{
    openModal(`<h3>Adicionar lembrete</h3>
      <div class="field"><label>Lembrete</label><input id="novoLembreteTxt" placeholder="Escreva um lembrete..."></div>
      <div class="field"><label>Data</label><input type="date" id="novoLembreteData" value="${uiState.analistaDate}"></div>
      <div class="field"><label>Hora (opcional)</label>
        <select id="novoLembreteHora">
          <option value="">Sem hora</option>
          ${HOURS.map(h=>`<option value="${h}">${h}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Observações (opcional)</label><input id="novoLembreteObs" placeholder="Observações..."></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmAddLembrete">Adicionar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmAddLembrete').onclick = async ()=>{
      const txt = document.getElementById('novoLembreteTxt').value.trim();
      if(!txt) return;
      const lembreteData = document.getElementById('novoLembreteData').value || todayISO();
      const hora = document.getElementById('novoLembreteHora').value;
      const obs = document.getElementById('novoLembreteObs').value.trim();
      const entrada = {origem:'self', analistaId:session.userId, criadoPor:session.name, texto:txt, observacoes:obs, data:lembreteData, hora};
      try{
        const novo = await apiCreateLembrete(entrada);
        DB.lembretes.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível criar o lembrete: '+e.message); }
    };
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
  // Legenda de status da grade integrada (Programação Analista do
  // supervisor) — clicar destaca só aquele status, clicar de novo (ou no
  // "Limpar") volta a mostrar tudo igual.
  main.querySelectorAll('[data-status-filtro]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const s = el.dataset.statusFiltro;
      uiState.progStatusFiltro = uiState.progStatusFiltro===s ? null : s;
      renderMain();
    });
  });
  const btnLimparStatusFiltro = document.getElementById('btnLimparStatusFiltro');
  if(btnLimparStatusFiltro) btnLimparStatusFiltro.addEventListener('click', ()=>{ uiState.progStatusFiltro = null; renderMain(); });
  main.querySelectorAll('.toggle-group[data-scope="reunioes"] [data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.reunioesView = el.dataset.view; renderMain(); });
  });
  const datePick = document.getElementById('analistaDatePick');
  if(datePick) datePick.addEventListener('change', ()=>{ uiState.analistaDate = datePick.value; renderMain(); });
  const reunioesDatePick = document.getElementById('reunioesDatePick');
  if(reunioesDatePick) reunioesDatePick.addEventListener('change', ()=>{ uiState.reunioesDate = reunioesDatePick.value; renderMain(); });
  main.querySelectorAll('[data-opfiltro]').forEach(sel=>{
    sel.addEventListener('change', ()=>{ uiState.analistaOpFiltro = sel.value; renderMain(); });
  });

  // data-target diferencia qual calendário está sendo navegado — sem ele,
  // cai no comportamento antigo (Programação do analista/supervisor).
  main.querySelectorAll('[data-daypick]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const ds = cell.dataset.daypick;
      if(cell.dataset.target==='reunioes'){ uiState.reunioesDate = ds; uiState.reunioesView = 'diaria'; }
      else if(session.role==='analista'){ uiState.analistaDate = ds; uiState.analistaView = 'diaria'; }
      else { uiState.progDate = ds; uiState.progView = 'diaria'; }
      renderMain();
    });
  });
  main.querySelectorAll('[data-monthnav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ds = btn.dataset.monthnav;
      if(btn.dataset.target==='reunioes'){ uiState.reunioesDate = ds; }
      else if(btn.dataset.target==='domingos'){ uiState.domingosMes = ds; }
      else if(session.role==='analista'){ uiState.analistaDate = ds; }
      else { uiState.progDate = ds; }
      renderMain();
    });
  });

  main.querySelectorAll('[data-finalizar-op]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const op = btn.dataset.finalizarOp, hora = btn.dataset.hora, data = btn.dataset.data || uiState.analistaDate;
      const ciclo = btn.dataset.ciclo || '';
      const sprMeta = btn.dataset.sprMeta!=='' ? Number(btn.dataset.sprMeta) : null;
      let estrelas = 0;
      openModal(`
        <h3>Finalizar operação — ${op} (${hora})</h3>
        <div class="help-text">Este é o Raio-X da operação: avalie com estrelas, informe o SPR lançado e descreva o que aconteceu. A observação precisa de no mínimo ${RAIOX_MIN_OBS_LEN} caracteres para fechar — tudo isso é obrigatório para finalizar, a não ser que marque "Sem roteirização" abaixo.</div>
        <div class="field">
          <label>Avaliação</label>
          <div id="raioxStars" class="star-picker" style="display:flex;gap:6px;font-size:28px;line-height:1;">
            ${[1,2,3,4,5].map(n=>`<span data-star="${n}" style="cursor:pointer;opacity:0.3;">★</span>`).join('')}
          </div>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" id="raioxSemRot"> Sem roteirização nesse horário</label>
        </div>
        <div class="field">
          <label>SPR lançado (obrigatório)${sprMeta!=null ? ` — SPR REF: ${sprMeta}` : ' (sem SPR REF cadastrado pra essa operação/ciclo)'}</label>
          <input type="number" id="raioxSprReal" step="any" placeholder="Ex.: 108">
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
      const semRotEl = document.getElementById('raioxSemRot');
      const obsEl = document.getElementById('raioxObs');
      const sprRealEl = document.getElementById('raioxSprReal');
      const counterEl = document.getElementById('raioxCounter');
      const confirmBtn = document.getElementById('confirmFinalizar');
      function updateState(){
        const semRot = semRotEl.checked;
        sprRealEl.disabled = semRot;
        sprRealEl.style.opacity = semRot ? '0.4' : '1';
        const len = obsEl.value.trim().length;
        if(semRot){
          counterEl.textContent = 'Observação opcional (sem roteirização nesse horário)';
          counterEl.style.color = 'var(--text-faint)';
          confirmBtn.disabled = !(estrelas>=1);
        } else {
          counterEl.textContent = `${len} / ${RAIOX_MIN_OBS_LEN} caracteres mínimos`;
          counterEl.style.color = len>=RAIOX_MIN_OBS_LEN ? 'var(--done)' : 'var(--text-faint)';
          const sprValido = sprRealEl.value.trim()!=='' && !Number.isNaN(Number(sprRealEl.value));
          confirmBtn.disabled = !(estrelas>=1 && len>=RAIOX_MIN_OBS_LEN && sprValido);
        }
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
      semRotEl.addEventListener('change', updateState);
      obsEl.addEventListener('input', updateState);
      sprRealEl.addEventListener('input', updateState);
      confirmBtn.onclick = async ()=>{
        const semRot = semRotEl.checked;
        const observacao = obsEl.value.trim();
        const sprReal = Number(sprRealEl.value);
        if(estrelas<1) return;
        if(!semRot && (observacao.length<RAIOX_MIN_OBS_LEN || sprRealEl.value.trim()==='' || Number.isNaN(sprReal))) return;
        const entrada = {analistaId:session.userId, operacao:op, hora, data, estrelas, observacao,
          sprRoteirizado: semRot ? 0 : sprReal, sprMeta: semRot ? null : sprMeta, ciclo, semRoteirizacao:semRot};
        confirmBtn.disabled = true;
        try{
          const novo = await apiCreateRaioX(entrada);
          DB.raioX.push(novo);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível finalizar: '+e.message); confirmBtn.disabled = false; }
      };
    });
  });

  // "Ver Particularidade" — nota compartilhada por Operação+Supervisor (uma
  // só, upsert), pensada pra passagem de bastão entre turnos. Só fecha pelo
  // "X" (modalLocked, ver ui.js/main.js) pra não perder texto por engano
  // clicando fora ou (se um dia existir) apertando Esc.
  main.querySelectorAll('[data-particularidade-op]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const operacao = btn.dataset.particularidadeOp;
      const supervisorId = btn.dataset.particularidadeSup;
      const isCobertura = btn.dataset.particularidadeCobertura === '1';
      const coberturaAnalistaId = btn.dataset.particularidadeAnalista;
      const coberturaData = btn.dataset.particularidadeData;
      const jaCiente = btn.dataset.ciente === '1';
      const souEuCobrindo = isCobertura && session.userId === coberturaAnalistaId;
      const cienteRegistro = isCobertura ? DB.particularidadeCiente.find(c=>c.analistaId===coberturaAnalistaId && c.operacao===operacao && c.data===coberturaData) : null;
      const existente = DB.particularidades.find(p=>p.supervisorId===supervisorId && p.operacao===operacao);
      // Só o titular fixo dessa operação (o card não é cobertura) ou o
      // supervisor podem editar — quem só está cobrindo o hub (suplente)
      // vê a nota, mas não mexe nela (ver upsertParticularidade, backend).
      const podeEditar = session.role==='supervisor' || (!isCobertura && session.userId===coberturaAnalistaId);
      modalLocked = true;
      openModalLarge(`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <h3 style="margin:0;">⚙️ Particularidades — ${escapeHtml(operacao)}</h3>
          <button id="btnFecharParticularidade" title="Fechar" style="background:none;border:none;color:var(--text-muted);font-size:24px;line-height:1;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="help-text" style="margin-top:6px;">
          ${existente ? `Última atualização: ${new Date(existente.atualizadoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} por ${escapeHtml(existente.atualizadoPor)}` : 'Nenhuma atualização registrada ainda — seja o primeiro a preencher.'}
        </div>
        ${isCobertura ? `<div class="help-text" style="margin-top:6px;${jaCiente?'color:var(--done);':'color:var(--alert);'}">
          ${jaCiente ? `✓ Ciência confirmada em ${new Date(cienteRegistro.ts).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} por ${escapeHtml(userById(coberturaAnalistaId)?.name||'—')}` : '⚠ Cobertura ainda sem confirmação de ciência.'}
        </div>` : ''}
        <div class="field" style="margin-top:14px;">
          <label>Particularidades da operação</label>
          ${podeEditar ? `<div class="rte-toolbar">
            <button type="button" class="rte-btn" data-rte-cmd="bold" title="Negrito"><b>B</b></button>
            <button type="button" class="rte-btn" data-rte-cmd="italic" title="Itálico"><i>I</i></button>
            <button type="button" class="rte-btn" data-rte-cmd="underline" title="Sublinhado"><u>S</u></button>
            <span class="rte-sep"></span>
            <button type="button" class="rte-btn" data-rte-cmd="justifyLeft" title="Alinhar à esquerda">≡«</button>
            <button type="button" class="rte-btn" data-rte-cmd="justifyCenter" title="Centralizar">≡</button>
            <button type="button" class="rte-btn" data-rte-cmd="justifyRight" title="Alinhar à direita">»≡</button>
          </div>` : ''}
          <div id="particularidadeTexto" class="rte-editable" contenteditable="${podeEditar?'true':'false'}" data-placeholder="Ex.: acessos, contatos, procedimentos específicos, cuidados na passagem de turno...">${existente?.texto||''}</div>
          ${podeEditar ? '' : '<div class="help-text" style="margin-top:4px;">Só o analista titular dessa operação ou o supervisor podem editar.</div>'}
        </div>
        <div style="display:flex;justify-content:${(souEuCobrindo && !jaCiente) ? 'space-between' : 'flex-end'};align-items:center;margin-top:14px;gap:8px;">
          ${(souEuCobrindo && !jaCiente) ? `<button class="btn" id="btnCienteParticularidade">✓ Estou ciente</button>` : ''}
          ${podeEditar ? `<button class="btn btn-brand" id="btnSalvarParticularidade">Salvar</button>` : ''}
        </div>`);
      document.getElementById('btnFecharParticularidade').onclick = closeModal;
      const editorParticularidade = document.getElementById('particularidadeTexto');
      // mousedown+preventDefault (não click) pra não perder a seleção de
      // texto no editor antes do execCommand rodar — clicar num botão tira
      // o foco do contenteditable por padrão.
      document.querySelectorAll('.rte-btn').forEach(rteBtn=>{
        rteBtn.addEventListener('mousedown', e=>{
          e.preventDefault();
          document.execCommand(rteBtn.dataset.rteCmd, false, null);
          editorParticularidade.focus();
        });
      });
      // Colar de fontes externas (Word/Google Docs/e-mail) traz cor/fonte
      // junto do negrito/alinhamento — mantém só o que a barrinha também
      // produz (limparHtmlColado, utils.js) e já deixa URL solta como link.
      editorParticularidade.addEventListener('paste', e=>{
        e.preventDefault();
        const cd = e.clipboardData || window.clipboardData;
        const html = cd.getData('text/html');
        const limpo = html ? limparHtmlColado(html) : escapeHtml(cd.getData('text/plain')).replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, limpo);
        linkify(editorParticularidade);
      });
      const btnSalvarParticularidade = document.getElementById('btnSalvarParticularidade');
      if(btnSalvarParticularidade) btnSalvarParticularidade.onclick = async ()=>{
        const btnSalvar = document.getElementById('btnSalvarParticularidade');
        linkify(editorParticularidade);
        const texto = editorParticularidade.innerHTML;
        btnSalvar.disabled = true;
        try{
          const salvo = await apiSalvarParticularidade({ supervisorId, operacao, texto });
          const idx = DB.particularidades.findIndex(p=>p.id===salvo.id);
          if(idx>=0) DB.particularidades[idx] = salvo; else DB.particularidades.push(salvo);
          closeModal();
          renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); btnSalvar.disabled = false; }
      };
      const btnCiente = document.getElementById('btnCienteParticularidade');
      if(btnCiente) btnCiente.onclick = async ()=>{
        btnCiente.disabled = true;
        try{
          const novo = await apiMarcarCiente({ analistaId: coberturaAnalistaId, operacao, data: coberturaData });
          DB.particularidadeCiente.push(novo);
          closeModal();
          renderMain();
        }catch(e){ alert('Não foi possível confirmar: '+e.message); btnCiente.disabled = false; }
      };
    });
  });

  // Confirmar presença numa reunião — sempre em nome de quem clica (o
  // backend já força analistaId=caller, ver reuniaoPresenca.controller.js).
  main.querySelectorAll('[data-marcar-presenca]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const reuniaoId = btn.dataset.marcarPresenca;
      btn.disabled = true;
      try{
        const novo = await apiMarcarPresenca(reuniaoId);
        DB.reuniaoPresenca.push(novo);
        renderMain();
      }catch(e){ alert('Não foi possível confirmar presença: '+e.message); btn.disabled = false; }
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
      <div class="field"><label>Dias da semana</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${WEEKDAYS.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg-2);padding:5px 8px;border-radius:6px;"><input type="checkbox" class="fMestraDia" value="${d}" checked> ${d}</label>`).join('')}
        </div>
      </div>
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
      const diasTodos = Array.from(document.querySelectorAll('.fMestraDia')).map(c=>c.value);
      const diasMarcados = Array.from(document.querySelectorAll('.fMestraDia:checked')).map(c=>c.value);
      const dias = diasMarcados.length===diasTodos.length ? [] : diasMarcados;
      const entrada = {analistaId, operacao:document.getElementById('fOp').value||'OP', ciclo:document.getElementById('fCiclo').value,
        horaInicio:document.getElementById('fHi').value, horaFim:document.getElementById('fHf').value, titular, dias,
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

  // Resultado SPR (supResultadoSPR/coordResultadoSPR).
  main.querySelectorAll('[data-sprfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.sprfiltro;
      uiState.sprFiltro[key] = inp.value;
      if((key==='inicio'||key==='fim') && uiState.sprFiltro.inicio > uiState.sprFiltro.fim){
        uiState.sprFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });

  // Abre o histórico do analista (ver analistaTimelineModal em
  // render-coordenador.js) — qualquer nome marcado com esse atributo
  // (Dashboard Global: lista de risco; Painel Hora a Hora: coluna Analista).
  main.querySelectorAll('[data-analista-timeline]').forEach(el=>{
    el.addEventListener('click', ()=> analistaTimelineModal(el.dataset.analistaTimeline));
  });

  // Botões "Exportar Excel" das telas do coordenador (render-coordenador.js).
  const btnExportDashboard = document.getElementById('btnExportDashboard');
  if(btnExportDashboard) btnExportDashboard.addEventListener('click', exportarDashboard);
  const btnExportPainel = document.getElementById('btnExportPainel');
  if(btnExportPainel) btnExportPainel.addEventListener('click', exportarPainelHoraAHora);
  const btnExportStatus = document.getElementById('btnExportStatus');
  if(btnExportStatus) btnExportStatus.addEventListener('click', exportarStatus);
  const btnExportAnomalias = document.getElementById('btnExportAnomalias');
  if(btnExportAnomalias) btnExportAnomalias.addEventListener('click', exportarAnomalias);
  const btnExportMetricas = document.getElementById('btnExportMetricas');
  if(btnExportMetricas) btnExportMetricas.addEventListener('click', exportarMetricas);
  // Mesmos botões, agora também nas telas equivalentes do supervisor
  // (render-supervisor.js: supGrade, supOcorrencias).
  const btnExportGrade = document.getElementById('btnExportGrade');
  if(btnExportGrade) btnExportGrade.addEventListener('click', exportarGrade);
  const btnExportDomingos = document.getElementById('btnExportDomingos');
  if(btnExportDomingos) btnExportDomingos.addEventListener('click', ()=>{
    exportarRelatorioExcel(`controle-domingos_${uiState.domingosMes.slice(0,7)}.xlsx`, ['Analista','Data','Status','Tipo'], domingosExportRows);
  });
  const btnExportOcorrencias = document.getElementById('btnExportOcorrencias');
  if(btnExportOcorrencias) btnExportOcorrencias.addEventListener('click', exportarOcorrencias);
  const btnExportSPR = document.getElementById('btnExportSPR');
  if(btnExportSPR) btnExportSPR.addEventListener('click', exportarSPR);

  bindMultiselect(main, 'btnMetricasAnalistaToggle', 'metricasAnalistaTodos', 'metricasAnalistaChk', uiState.metricasFiltro, 'analistas', 'metricasAnalistaDropdownOpen');
  // Filtro por Supervisor da tela de Métricas do coordenador (ver
  // coordMetricas em render-coordenador.js) e das outras telas executivas.
  bindMultiselect(main, 'btnMetricasSupervisorToggle', 'metricasSupervisorTodos', 'metricasSupervisorChk', uiState.metricasFiltro, 'supervisores', 'metricasSupervisorDropdownOpen');
  bindMultiselect(main, 'btnDashboardSupervisorToggle', 'dashboardSupervisorTodos', 'dashboardSupervisorChk', uiState.dashboardFiltro, 'supervisores', 'dashboardSupervisorDropdownOpen');
  bindMultiselect(main, 'btnPainelSupervisorToggle', 'painelSupervisorTodos', 'painelSupervisorChk', uiState.painelFiltro, 'supervisores', 'painelSupervisorDropdownOpen');
  bindMultiselect(main, 'btnStatusSupervisorToggle', 'statusSupervisorTodos', 'statusSupervisorChk', uiState.statusFiltro, 'supervisores', 'statusSupervisorDropdownOpen');
  bindMultiselect(main, 'btnSprAnalistaToggle', 'sprAnalistaTodos', 'sprAnalistaChk', uiState.sprFiltro, 'analistas', 'sprAnalistaDropdownOpen');
  bindMultiselect(main, 'btnSprSupervisorToggle', 'sprSupervisorTodos', 'sprSupervisorChk', uiState.sprFiltro, 'supervisores', 'sprSupervisorDropdownOpen');

  const metricasPanel = main.querySelector('.multiselect-panel');
  if(metricasPanel) metricasPanel.addEventListener('click', e=>e.stopPropagation());

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
    const bms = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, data));
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
      <div class="grid-2"><div class="field"><label>Data</label><input type="date" id="fRData" value="${uiState.reunioesDate||todayISO()}"></div>
      <div class="field"><label>Hora início</label><select id="fRHora">${REUNIAO_HORAS.map(h=>`<option>${h}</option>`).join('')}</select></div></div>
      <div class="grid-2">
        <div class="field"><label>Hora fim</label><input type="time" id="fRHoraFim"></div>
        <div class="field"><label>Duração rápida</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn" data-duracao="15">15 min</button>
            <button type="button" class="btn" data-duracao="20">20 min</button>
            <button type="button" class="btn" data-duracao="40">40 min</button>
            <button type="button" class="btn" data-duracao="60">1 hora</button>
          </div>
        </div>
      </div>
      <div class="field" id="fRAnalistaWrap" style="display:none;"><label>Analista</label><select id="fRAnalista">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>Link (opcional)</label><input id="fRLink" placeholder="https://..."></div>
      <div class="field"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="fRRepetir"> Repetir em mais de uma data</label></div>
      <div id="fRRepetirWrap" style="display:none;">
        <div class="field">
          <label>Dias da semana</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${WEEKDAY_LABELS.map((lbl,i)=>`<label style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:400;"><input type="checkbox" class="fRDia" value="${i}"> ${lbl}</label>`).join('')}
          </div>
        </div>
        <div class="field"><label>Repetir até</label><input type="date" id="fRRepetirAte"></div>
        <div class="help-text" style="margin-top:-6px;">Limitado a no máximo 2 meses a partir da data inicial.</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovaReuniao">Agendar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    const tipoSel = document.getElementById('fRTipo');
    const wrap = document.getElementById('fRAnalistaWrap');
    tipoSel.addEventListener('change', ()=>{ wrap.style.display = tipoSel.value==='individual' ? 'block':'none'; });
    const fRHora = document.getElementById('fRHora');
    const fRHoraFim = document.getElementById('fRHoraFim');
    document.querySelectorAll('[data-duracao]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ fRHoraFim.value = addMinutesToTime(fRHora.value, Number(btn.dataset.duracao)); });
    });
    const fRData = document.getElementById('fRData');
    const fRRepetir = document.getElementById('fRRepetir');
    const repetirWrap = document.getElementById('fRRepetirWrap');
    const fRRepetirAte = document.getElementById('fRRepetirAte');
    function syncRepetirAteMax(){
      const max = addMonthsISO(fRData.value||todayISO(), 2);
      fRRepetirAte.max = max;
      if(!fRRepetirAte.value || fRRepetirAte.value>max) fRRepetirAte.value = max;
    }
    fRRepetir.addEventListener('change', ()=>{
      repetirWrap.style.display = fRRepetir.checked ? 'block':'none';
      if(fRRepetir.checked) syncRepetirAteMax();
    });
    fRData.addEventListener('change', ()=>{ if(fRRepetir.checked) syncRepetirAteMax(); });
    document.getElementById('confirmNovaReuniao').onclick = async ()=>{
      const tipo = tipoSel.value;
      const analistaIds = tipo==='individual' ? [document.getElementById('fRAnalista').value] : [];
      const base = {tipo, titulo:document.getElementById('fRTitulo').value||'Reunião',
        hora:fRHora.value, horaFim:fRHoraFim.value, analistaIds, supervisorId:session.userId, criadoPor:session.name,
        link:normalizeUrl(document.getElementById('fRLink').value.trim())};
      const dataInicio = fRData.value;
      let datas = [dataInicio];
      if(fRRepetir.checked){
        const dias = [...document.querySelectorAll('.fRDia:checked')].map(el=>Number(el.value));
        if(dias.length){
          const limite = addMonthsISO(dataInicio, 2);
          const fim = fRRepetirAte.value && fRRepetirAte.value<=limite ? fRRepetirAte.value : limite;
          datas = [];
          let cursor = dataInicio;
          while(cursor<=fim){
            if(dias.includes(new Date(cursor+'T00:00:00').getDay())) datas.push(cursor);
            cursor = addDaysISO(cursor, 1);
          }
          if(datas.length===0) datas = [dataInicio];
        }
      }
      let count=0, fail=0;
      for(const d of datas){
        try{ const novo = await apiCreateReuniao({...base, data:d}); DB.reunioes.push(novo); count++; }
        catch(e){ fail++; }
      }
      closeModal(); renderMain();
      if(datas.length>1) alert(`${count} reunião(ões) agendada(s).${fail?` ${fail} falharam.`:''}`);
      else if(fail) alert('Não foi possível agendar.');
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
        <div class="field"><label>Hora início</label><select id="fEditRHora">${REUNIAO_HORAS.map(h=>`<option ${h===r.hora?'selected':''}>${h}</option>`).join('')}</select></div></div>
        <div class="grid-2">
          <div class="field"><label>Hora fim</label><input type="time" id="fEditRHoraFim" value="${escapeHtml(r.horaFim||'')}"></div>
          <div class="field"><label>Duração rápida</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn" data-duracao="15">15 min</button>
              <button type="button" class="btn" data-duracao="20">20 min</button>
              <button type="button" class="btn" data-duracao="40">40 min</button>
              <button type="button" class="btn" data-duracao="60">1 hora</button>
            </div>
          </div>
        </div>
        <div class="field" id="fEditRAnalistaWrap" style="${r.tipo==='individual'?'':'display:none;'}"><label>Analista</label><select id="fEditRAnalista">${myAnalistas.map(a=>`<option value="${a.id}" ${a.id===r.analistaIds[0]?'selected':''}>${a.name}</option>`).join('')}</select></div>
        <div class="field"><label>Link (opcional)</label><input id="fEditRLink" value="${escapeHtml(r.link||'')}" placeholder="https://..."></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarReuniao">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const tipoSel = document.getElementById('fEditRTipo');
      const wrap = document.getElementById('fEditRAnalistaWrap');
      tipoSel.addEventListener('change', ()=>{ wrap.style.display = tipoSel.value==='individual' ? 'block':'none'; });
      const fEditRHora = document.getElementById('fEditRHora');
      const fEditRHoraFim = document.getElementById('fEditRHoraFim');
      document.querySelectorAll('[data-duracao]').forEach(btn=>{
        btn.addEventListener('click', ()=>{ fEditRHoraFim.value = addMinutesToTime(fEditRHora.value, Number(btn.dataset.duracao)); });
      });
      document.getElementById('confirmEditarReuniao').onclick = async ()=>{
        const tipo = tipoSel.value;
        const analistaIds = tipo==='individual' ? [document.getElementById('fEditRAnalista').value] : [];
        const patch = {tipo, titulo:document.getElementById('fEditRTitulo').value||'Reunião',
          horaFim:fEditRHoraFim.value,
          data:document.getElementById('fEditRData').value, hora:document.getElementById('fEditRHora').value, analistaIds,
          link:normalizeUrl(document.getElementById('fEditRLink').value.trim())};
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

  const btnNovoSpr = document.getElementById('btnNovoSpr');
  if(btnNovoSpr) btnNovoSpr.addEventListener('click', ()=>{
    openModal(`<h3>Nova entrada SPR</h3>
      <div class="field"><label>Operação</label><input id="fSprOp" list="sprOpList" placeholder="ex: LM Hub_SP_Atibaia_Ponte_Alta"></div>
      <div class="field"><label>Ciclo</label><input id="fSprCiclo" list="sprCicloList" placeholder="ex: T3"></div>
      <div class="field"><label>SPR</label><input id="fSprValor" type="number" placeholder="ex: 92"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovoSpr">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovoSpr').onclick = async ()=>{
      const operacao = document.getElementById('fSprOp').value.trim();
      const ciclo = document.getElementById('fSprCiclo').value.trim();
      const spr = document.getElementById('fSprValor').value;
      if(!operacao || !ciclo || spr===''){ alert('Preencha operação, ciclo e SPR.'); return; }
      const entrada = {supervisorId:session.userId, operacao, ciclo, spr: Number(spr)};
      try{
        const novo = await apiCreateSpr(entrada);
        DB.sprs.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });

  main.querySelectorAll('[data-editar-spr]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const s = DB.sprs.find(x=>x.id===btn.dataset.editarSpr);
      if(!s) return;
      openModal(`<h3>Editar SPR</h3>
        <div class="field"><label>Operação</label><input id="fEditSprOp" list="sprOpList" value="${escapeHtml(s.operacao)}"></div>
        <div class="field"><label>Ciclo</label><input id="fEditSprCiclo" list="sprCicloList" value="${escapeHtml(s.ciclo)}"></div>
        <div class="field"><label>SPR</label><input id="fEditSprValor" type="number" value="${s.spr}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarSpr">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarSpr').onclick = async ()=>{
        const operacao = document.getElementById('fEditSprOp').value.trim();
        const ciclo = document.getElementById('fEditSprCiclo').value.trim();
        const spr = document.getElementById('fEditSprValor').value;
        if(!operacao || !ciclo || spr===''){ alert('Preencha operação, ciclo e SPR.'); return; }
        const patch = {operacao, ciclo, spr: Number(spr)};
        try{
          const atualizado = await apiUpdateSpr(s.id, patch);
          DB.sprs = DB.sprs.map(x=>x.id===s.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });

  main.querySelectorAll('[data-excluir-spr]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta entrada de SPR?')) return;
      const id = btn.dataset.excluirSpr;
      try{ await apiDeleteSpr(id); DB.sprs = DB.sprs.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnBaixarModeloSpr = document.getElementById('btnBaixarModeloSpr');
  if(btnBaixarModeloSpr) btnBaixarModeloSpr.addEventListener('click', ()=>{
    downloadXLSX('modelo_spr.xlsx', ['operacao','ciclo','spr'], ['LM Hub_SP_Atibaia_Ponte_Alta','T3','92']);
  });
  const fileImportSpr = document.getElementById('fileImportSpr');
  if(fileImportSpr) fileImportSpr.addEventListener('change', async ()=>{
    const file = fileImportSpr.files[0]; if(!file) return;
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportSpr.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    openProgressModal('Importando SPR...');
    for(const [idx, r] of rows.entries()){
      const operacao = (r.operacao||'').trim();
      const ciclo = (r.ciclo||'').trim();
      if(!operacao || !ciclo || r.spr===''||r.spr===undefined){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      // Reimportar a mesma planilha (SPR atualizado) atualiza a entrada já
      // existente pra essa Operação+Ciclo, em vez de duplicar linha.
      const existente = DB.sprs.find(s=>s.supervisorId===session.userId && s.operacao===operacao && s.ciclo===ciclo);
      try{
        if(existente){
          const atualizado = await apiUpdateSpr(existente.id, {spr: Number(r.spr)});
          DB.sprs = DB.sprs.map(x=>x.id===existente.id ? atualizado : x);
        } else {
          const novo = await apiCreateSpr({supervisorId:session.userId, operacao, ciclo, spr: Number(r.spr)});
          DB.sprs.push(novo);
        }
        ok++;
      }catch(e){ console.error('Falha ao importar SPR', r, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportSpr.value='';
    renderMain();
    alert(`Importação concluída: ${ok} entrada(s) salva(s)${fail?`, ${fail} linha(s) ignorada(s) (campos obrigatórios ausentes)`:''}.`);
  });

  const btnBaixarModeloMestra = document.getElementById('btnBaixarModeloMestra');
  if(btnBaixarModeloMestra) btnBaixarModeloMestra.addEventListener('click', ()=>{
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const exemplo = myAnalistas[0]?.name || 'Nome do Analista';
    downloadXLSX('modelo_base_mestra.xlsx',
      ['analista','operacao','ciclo','hora_inicio','hora_fim','dias','data_inicio','data_fim'],
      [exemplo,'COL-A','T3','19:00','23:00','seg,ter,qua,qui,sex', todayISO(), '2026-12-31']);
  });
  const fileImportMestra = document.getElementById('fileImportMestra');
  if(fileImportMestra) fileImportMestra.addEventListener('change', async ()=>{
    const file = fileImportMestra.files[0]; if(!file) return;
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportMestra.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    const pendentes = [];
    openProgressModal('Importando operações fixas...');
    for(const [idx, r] of rows.entries()){
      if(!r.operacao || !r.hora_inicio || !r.hora_fim){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      // Coluna "dias" vazia/ausente = roda todo dia (ver bmRodaNoDia em utils.js).
      const dias = (r.dias||'').split(',').map(d=>d.trim().toLowerCase()).filter(Boolean);
      const a = findAnalistaByName(myAnalistas, r.analista);
      if(!a){
        pendentes.push({nomeOriginal:r.analista||'', operacao:r.operacao, ciclo:r.ciclo||'T3',
          horaInicio:r.hora_inicio, horaFim:r.hora_fim, dias,
          dataInicio:r.data_inicio||todayISO(), dataFim:r.data_fim||'2026-12-31', analistaId:''});
        updateProgressModal(idx+1, rows.length);
        continue;
      }
      const entrada = {analistaId:a.id, operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, titular:a.name, dias,
        dataInicio:r.data_inicio||todayISO(), dataFim:r.data_fim||'2026-12-31'};
      try{ DB.baseMestra.push(await apiCreateBaseMestra(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar', r.analista, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportMestra.value='';
    if(pendentes.length) uiState.importPendentes = {tipo:'basemestra', items:pendentes};
    renderMain();
    alert(`Importação concluída: ${ok} entrada(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s) (campos obrigatórios ausentes)`:''}${pendentes.length?`, ${pendentes.length} nome(s) não encontrado(s) — corrija no aviso no topo da tela.`:''}.`);
  });

  const btnBaixarModeloReuniao = document.getElementById('btnBaixarModeloReuniao');
  if(btnBaixarModeloReuniao) btnBaixarModeloReuniao.addEventListener('click', ()=>{
    downloadXLSX('modelo_reunioes.xlsx',
      ['titulo','tipo','data','hora_inicio','hora_fim','analistas','link'],
      ['Café da Madrugada','grupo', todayISO(), '00:00','00:20','','https://meet.google.com/exemplo']);
  });
  const fileImportReuniao = document.getElementById('fileImportReuniao');
  if(fileImportReuniao) fileImportReuniao.addEventListener('change', async ()=>{
    const file = fileImportReuniao.files[0]; if(!file) return;
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportReuniao.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    const naoEncontrados = new Set();
    openProgressModal('Importando reuniões...');
    for(const [idx, r] of rows.entries()){
      const titulo = (r.titulo||'').trim();
      const tipo = (r.tipo||'').trim().toLowerCase()==='individual' ? 'individual' : 'grupo';
      const data = (r.data||'').trim();
      const hora = (r.hora_inicio||'').trim();
      if(!titulo || !data || !hora){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      // Coluna "analistas" vazia + tipo grupo = toda a equipe (mesma
      // convenção do modal Nova reunião, ver btnNovaReuniao). Em tipo
      // individual precisa bater com exatamente um analista.
      const nomes = (r.analistas||'').split(',').map(s=>s.trim()).filter(Boolean);
      let analistaIds = [];
      if(tipo==='individual'){
        const a = findAnalistaByName(myAnalistas, nomes[0]||'');
        if(!a){ if(nomes[0]) naoEncontrados.add(nomes[0]); fail++; updateProgressModal(idx+1, rows.length); continue; }
        analistaIds = [a.id];
      } else {
        nomes.forEach(nome=>{
          const a = findAnalistaByName(myAnalistas, nome);
          if(a) analistaIds.push(a.id); else naoEncontrados.add(nome);
        });
      }
      const entrada = {tipo, titulo, data, hora, horaFim:(r.hora_fim||'').trim(), analistaIds,
        supervisorId:session.userId, criadoPor:session.name, link:normalizeUrl((r.link||'').trim())};
      try{ DB.reunioes.push(await apiCreateReuniao(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar reunião', r, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportReuniao.value='';
    renderMain();
    alert(`Importação concluída: ${ok} reunião(ões) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s)`:''}${naoEncontrados.size?`, nome(s) não encontrado(s): ${[...naoEncontrados].join(', ')}`:''}.`);
  });

  main.querySelectorAll('[data-pendente-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const idx = parseInt(sel.dataset.pendenteIdx, 10);
      if(uiState.importPendentes) uiState.importPendentes.items[idx].analistaId = sel.value;
    });
  });

  main.querySelectorAll('[data-pendente-sup-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const idx = parseInt(sel.dataset.pendenteSupIdx, 10);
      if(uiState.importPendentes) uiState.importPendentes.items[idx].suplenteNome = sel.value;
    });
  });

  const btnDescartarPendentes = document.getElementById('btnDescartarPendentes');
  if(btnDescartarPendentes) btnDescartarPendentes.addEventListener('click', ()=>{
    uiState.importPendentes = null;
    renderMain();
  });

  const btnAplicarPendentes = document.getElementById('btnAplicarPendentes');
  if(btnAplicarPendentes) btnAplicarPendentes.addEventListener('click', async ()=>{
    const p = uiState.importPendentes;
    if(!p) return;
    // Cobertura exige os 2 nomes resolvidos (folgando E suplente) antes de
    // aplicar a linha — deixar passar com só um deles resolvido criaria a
    // cobertura com um nome ainda não validado.
    const selecionados = p.items.filter(it => p.tipo==='suplencias' ? (it.analistaId && it.suplenteNome) : it.analistaId);
    if(selecionados.length===0){ uiState.importPendentes = null; renderMain(); return; }
    let ok=0, fail=0;
    openProgressModal('Aplicando correções...');
    for(const [idx, it] of selecionados.entries()){
      try{
        if(p.tipo==='basemestra'){
          const a = userById(it.analistaId);
          const entrada = {analistaId:it.analistaId, operacao:it.operacao, ciclo:it.ciclo,
            horaInicio:it.horaInicio, horaFim:it.horaFim, titular:a.name, dias:it.dias,
            dataInicio:it.dataInicio, dataFim:it.dataFim};
          DB.baseMestra.push(await apiCreateBaseMestra(entrada));
        } else if(p.tipo==='suplencias'){
          const entrada = {operacao:it.operacao, ciclo:it.ciclo, horaInicio:it.horaInicio, horaFim:it.horaFim,
            suplente:it.suplenteNome, dataCobertura:it.dataCobertura, analistaOriginalId:it.analistaId};
          DB.suplencias.push(await apiCreateSuplencia(entrada));
        }
        ok++;
      }catch(e){ console.error('Falha ao aplicar correção de importação', it, e); fail++; }
      updateProgressModal(idx+1, selecionados.length);
    }
    closeModal();
    uiState.importPendentes = null;
    renderMain();
    alert(`Correções aplicadas: ${ok} adicionada(s)${fail?`, ${fail} falharam`:''}.`);
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
        <div class="field"><label>Dias da semana</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${WEEKDAYS.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg-2);padding:5px 8px;border-radius:6px;"><input type="checkbox" class="fEditMestraDia" value="${d}" ${(!b.dias||b.dias.length===0||b.dias.includes(d))?'checked':''}> ${d}</label>`).join('')}
          </div>
        </div>
        <div class="grid-2"><div class="field"><label>Vigência início</label><input type="date" id="fEditDi" value="${b.dataInicio}"></div>
        <div class="field"><label>Vigência fim</label><input type="date" id="fEditDf" value="${b.dataFim}"></div></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarMestra">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarMestra').onclick = async ()=>{
        const diasTodos = Array.from(document.querySelectorAll('.fEditMestraDia')).map(c=>c.value);
        const diasMarcados = Array.from(document.querySelectorAll('.fEditMestraDia:checked')).map(c=>c.value);
        const patch = {
          operacao: document.getElementById('fEditOp').value || b.operacao,
          ciclo: document.getElementById('fEditCiclo').value || b.ciclo,
          horaInicio: document.getElementById('fEditHi').value,
          horaFim: document.getElementById('fEditHf').value,
          dias: diasMarcados.length===diasTodos.length ? [] : diasMarcados,
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
    const pendentes = [];
    openProgressModal('Importando coberturas avulsas...');
    for(const [idx, r] of rows.entries()){
      if(!r.suplente || !r.operacao || !r.hora_inicio || !r.hora_fim || !r.data_cobertura){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      // Os dois nomes da linha (folgando e suplente) passam pelo mesmo
      // matching tolerante a acento/caixa/pontuação — sem isso, uma
      // diferença de digitação no suplente virava um nome "diferente" do
      // cadastro, e a cobertura sumia da própria agenda dele (Programação,
      // Métricas etc. comparam por nome exato).
      const orig = findAnalistaByName(myAnalistas, r.analista_original);
      const sup = findAnalistaByName(myAnalistas, r.suplente);
      if(!orig || !sup){
        pendentes.push({
          nomeOriginalTitular:r.analista_original||'', nomeOriginalSuplente:r.suplente||'',
          operacao:r.operacao, ciclo:r.ciclo||'T3', horaInicio:r.hora_inicio, horaFim:r.hora_fim, dataCobertura:r.data_cobertura,
          analistaId: orig ? orig.id : '', suplenteNome: sup ? sup.name : '',
        });
        updateProgressModal(idx+1, rows.length);
        continue;
      }
      const entrada = {operacao:r.operacao, ciclo:r.ciclo||'T3',
        horaInicio:r.hora_inicio, horaFim:r.hora_fim, suplente:sup.name,
        dataCobertura:r.data_cobertura, analistaOriginalId:orig.id};
      try{ DB.suplencias.push(await apiCreateSuplencia(entrada)); ok++; }
      catch(e){ console.error('Falha ao importar cobertura', e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportSuplencia.value='';
    if(pendentes.length) uiState.importPendentes = {tipo:'suplencias', items:pendentes};
    renderMain();
    alert(`Importação concluída: ${ok} cobertura(s) adicionada(s)${fail?`, ${fail} linha(s) ignorada(s) (campos obrigatórios ausentes)`:''}${pendentes.length?`, ${pendentes.length} nome(s) não encontrado(s) — corrija no aviso no topo da tela.`:''}.`);
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

  main.querySelectorAll('[data-particularidadesfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{ uiState.particularidadesFiltro[inp.dataset.particularidadesfiltro] = inp.value; renderMain(); });
  });
  const btnExportParticularidades = document.getElementById('btnExportParticularidades');
  if(btnExportParticularidades) btnExportParticularidades.addEventListener('click', ()=>{
    exportarRelatorioExcel('particularidades-auditoria.xlsx', ['Operação','Titular','Conteúdo','Atualizado por','Atualizado em'], particularidadesAuditoriaExportRows);
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

  // Mesmo padrão acima, só que pra tela de Ocorrências do coordenador (ver
  // coordAnomalias em render-coordenador.js).
  main.querySelectorAll('[data-anomaliasfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.anomaliasfiltro;
      uiState.anomaliasFiltro[key] = inp.value;
      if((key==='inicio'||key==='fim') && uiState.anomaliasFiltro.inicio > uiState.anomaliasFiltro.fim){
        uiState.anomaliasFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });

  // Filtro de data do Painel Hora a Hora do coordenador (ver
  // coordPainelHoraAHora em render-coordenador.js).
  main.querySelectorAll('[data-painelfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      uiState.painelFiltro[inp.dataset.painelfiltro] = inp.value;
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

  const cfgRefreshData = document.getElementById('cfgRefreshData');
  if(cfgRefreshData) cfgRefreshData.addEventListener('click', async ()=>{
    const label = cfgRefreshData.textContent;
    cfgRefreshData.disabled = true;
    cfgRefreshData.textContent = 'Atualizando...';
    try{
      await loadDB();
      renderMain();
    }catch(e){
      alert('Não foi possível atualizar: '+e.message);
      cfgRefreshData.disabled = false;
      cfgRefreshData.textContent = label;
    }
  });
}
