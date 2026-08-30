/* bindMainEvents(): liga todos os listeners de clique/change do #mainArea a cada render. */

// Wiring genérico dos dropdowns de multi-seleção usados em várias telas
// (Métricas, Dashboard Global, Painel Hora a Hora, Status Operacional,
// Resultado SPR) — todos seguem o mesmo HTML (botão toggle + checkbox
// "Todos" + lista de checkboxes de item, ver ex. o picker de Supervisor
// dentro de coordMetricas em render-coordenador.js). `filtro` é o objeto
// do uiState (ex.: uiState.metricasFiltro), `key` o campo array dele
// (ex.: "supervisores"), `openKey` o campo booleano do uiState que
// controla o painel aberto.
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

// Escala de Domingo (ver supGerarEscalaDomingo/escalaDomAnalistaPicker em
// render-supervisor.js): a grade de chips fica dentro de uma caixa (modal)
// em vez de aberta direto no card — escolher 10-14 pessoas ocupava espaço
// demais na tela principal. Cada toggle re-renderiza só o CONTEÚDO do
// modal (openModal de novo, sem fechar) pra refletir o chip marcado/
// desmarcado e o contador, sem mexer no resto da tela.
// Duas caixas (Disponíveis / Escalados, ver .escaladom-dual no CSS) — clicar
// no nome move de um lado pro outro. Só a busca + clique num nome
// re-renderizam as DUAS LISTAS (escalaDomRenderLists), nunca o modal
// inteiro — re-montar tudo a cada tecla digitada perderia o foco/cursor do
// campo de busca.
// Mesmo modal serve os dois grupos (dia = 'A'|'B'): analista inativo nunca
// aparece. Diferente do antigo par sábado/domingo, aqui um analista PODE
// estar nos dois grupos de propósito (cobre todo domingo marcado, sem
// folga cruzada forçada) — não precisa de aviso nem confirmação.
function escalaDomElegiveis(myAnalistas){
  return myAnalistas.filter(a=>a.active);
}
function escalaDomModalBody(dia){
  const titulo = dia==='A' ? 'Grupo A' : 'Grupo B';
  return `<h3>${titulo}</h3>
    <div class="help-text" style="margin-top:-4px;margin-bottom:10px;">Só analistas ativos aparecem aqui. Um analista pode estar nos dois grupos (cobre todo domingo marcado, não só metade).</div>
    <div class="field" style="margin-bottom:10px;"><input type="text" id="escalaDomBusca" placeholder="Buscar por nome..."></div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <button type="button" class="btn" id="btnEscalaDomModalTodos" style="padding:4px 10px;font-size:11.5px;">Selecionar todos</button>
      <button type="button" class="btn" id="btnEscalaDomModalLimpar" style="padding:4px 10px;font-size:11.5px;">Limpar</button>
      <span class="help-text" id="escalaDomContador" style="margin:0 0 0 auto;"></span>
    </div>
    <div class="escaladom-dual">
      <div class="escaladom-col">
        <div class="escaladom-col-title">Disponíveis</div>
        <div class="escaladom-list" id="escalaDomListaDisponiveis"></div>
      </div>
      <div class="escaladom-col">
        <div class="escaladom-col-title">Escalados</div>
        <div class="escaladom-list" id="escalaDomListaEscalados"></div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-brand" id="btnFecharEscalaDomModal">Fechar</button>
    </div>`;
}
function escalaDomRenderLists(myAnalistas, dia){
  const key = dia==='A' ? 'escalaDomGrupoA' : 'escalaDomGrupoB';
  const elegiveis = escalaDomElegiveis(myAnalistas);
  const elegiveisIds = new Set(elegiveis.map(a=>a.id));
  uiState[key] = uiState[key].filter(id=>elegiveisIds.has(id));
  const sel = uiState[key];
  const busca = normalizarNome(document.getElementById('escalaDomBusca')?.value || '');
  const bate = a => !busca || normalizarNome(a.name).includes(busca);
  const disponiveis = elegiveis.filter(a=>!sel.includes(a.id) && bate(a));
  const escalados = elegiveis.filter(a=>sel.includes(a.id) && bate(a));
  document.getElementById('escalaDomListaDisponiveis').innerHTML = disponiveis.map(a=>`<button type="button" class="escaladom-item" data-id="${a.id}">${escapeHtml(a.name)}</button>`).join('')
    || '<div class="help-text" style="padding:8px;">Ninguém encontrado</div>';
  document.getElementById('escalaDomListaEscalados').innerHTML = escalados.map(a=>`<button type="button" class="escaladom-item checked" data-id="${a.id}">${escapeHtml(a.name)}</button>`).join('')
    || '<div class="help-text" style="padding:8px;">Ninguém ainda</div>';
  document.getElementById('escalaDomContador').textContent = `${sel.length} selecionado${sel.length===1?'':'s'}`;
  document.querySelectorAll('#escalaDomListaDisponiveis .escaladom-item').forEach(btn=>{
    btn.onclick = ()=>{ if(!sel.includes(btn.dataset.id)) sel.push(btn.dataset.id); escalaDomRenderLists(myAnalistas, dia); };
  });
  document.querySelectorAll('#escalaDomListaEscalados .escaladom-item').forEach(btn=>{
    btn.onclick = ()=>{ uiState[key] = sel.filter(id=>id!==btn.dataset.id); escalaDomRenderLists(myAnalistas, dia); };
  });
}
function wireEscalaDomModal(myAnalistas, dia){
  const key = dia==='A' ? 'escalaDomGrupoA' : 'escalaDomGrupoB';
  escalaDomRenderLists(myAnalistas, dia);
  document.getElementById('escalaDomBusca').addEventListener('input', ()=> escalaDomRenderLists(myAnalistas, dia));
  document.getElementById('btnEscalaDomModalTodos').onclick = ()=>{
    uiState[key] = escalaDomElegiveis(myAnalistas).map(a=>a.id);
    escalaDomRenderLists(myAnalistas, dia);
  };
  document.getElementById('btnEscalaDomModalLimpar').onclick = ()=>{ uiState[key] = []; escalaDomRenderLists(myAnalistas, dia); };
  document.getElementById('btnFecharEscalaDomModal').onclick = ()=>{ closeModal(); renderMain(); };
}

// Formulários (Convocações): form de criar/editar (ver formularioFormHtml,
// render-supervisor.js) — reaproveitado pra "newf" (nova) e "editf-{id}"
// (edição), diferenciados só pelo prefix e por editingFormulario ser null
// ou não. tipo não é editável depois de criado (mudaria o formato das
// respostas já enviadas).
function wireFormularioForm(prefix, editingFormulario){
  const tipoSel = document.getElementById(`${prefix}-tipo`);
  if(!tipoSel) return;
  const periodoWrap = document.getElementById(`${prefix}-periodoWrap`);
  const limiteWrap = document.getElementById(`${prefix}-limiteWrap`);
  const ajuda = document.getElementById(`${prefix}-ajuda`);
  tipoSel.addEventListener('change', ()=>{
    const usaPeriodo = tipoSel.value==='domingo_voluntariado' || tipoSel.value==='folga_escolha';
    periodoWrap.style.display = usaPeriodo ? '' : 'none';
    limiteWrap.style.display = tipoSel.value==='folga_escolha' ? '' : 'none';
    ajuda.textContent = formularioAjudaTexto(tipoSel.value);
  });
  document.getElementById(`${prefix}-cancelar`).onclick = ()=>{
    uiState.formulariosShowNew = false;
    uiState.formulariosEditingId = null;
    renderMain();
  };
  document.getElementById(`${prefix}-salvar`).onclick = async ()=>{
    const tipo = tipoSel.value;
    const usaPeriodo = tipo==='domingo_voluntariado' || tipo==='folga_escolha';
    const abertura = new Date(document.getElementById(`${prefix}-abertura`).value).getTime();
    const fechamento = new Date(document.getElementById(`${prefix}-fechamento`).value).getTime();
    if(!abertura || !fechamento || fechamento<=abertura){
      alert('Confira a janela — o fechamento precisa ser depois da abertura.');
      return;
    }
    const dados = {
      tipo,
      titulo: document.getElementById(`${prefix}-titulo`).value.trim() || 'Convocação sem título',
      descricao: document.getElementById(`${prefix}-descricao`).value.trim(),
      abertura, fechamento,
      periodoInicio: usaPeriodo ? (document.getElementById(`${prefix}-periodoInicio`).value || null) : null,
      periodoFim: usaPeriodo ? (document.getElementById(`${prefix}-periodoFim`).value || null) : null,
      limitePorDia: tipo==='folga_escolha' ? (Number(document.getElementById(`${prefix}-limite`).value) || 1) : null,
    };
    try{
      if(editingFormulario){
        const { tipo: _tipoIgnorado, ...patch } = dados;
        const atualizado = await apiUpdateFormulario(editingFormulario.id, patch);
        DB.formularios = DB.formularios.map(f=>f.id===editingFormulario.id ? atualizado : f);
        uiState.formulariosEditingId = null;
      } else {
        const novo = await apiCreateFormulario(dados);
        DB.formularios.push(novo);
        uiState.formulariosShowNew = false;
      }
      renderMain();
    }catch(e){ alert('Não foi possível salvar: '+e.message); }
  };
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
  main.querySelectorAll('.toggle-group[data-scope="analista-layout"] [data-layout]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.analistaDiariaLayout = el.dataset.layout; renderMain(); });
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

  // Arrastar-e-soltar na Programação Analista (Diária, supervisor) — move
  // um card de operação pra linha de outro analista. Nada é gravado no
  // clique/solte: só empilha em uiState.progMoves (ver renderProgramacaoIntegrada,
  // que já desenha o resultado como prévia) até o supervisor clicar em
  // "Salvar alterações". dragPayload guarda os dados do card sendo
  // arrastado fora do dataTransfer — Firefox/Chrome não deixam ler
  // dataTransfer.getData() de verdade no dragover, só no drop, e a gente
  // precisa saber o payload durante o dragover pra nada (só highlight), mas
  // precisa dele completo e confiável no drop.
  // Carga de cada analista candidato naquele dia/mês — mesmas duas métricas
  // que candidatosParaSlot usa pra priorizar (utils.js), só que aqui pra
  // TODO mundo do time, não só pra quem passa nos filtros. Ordenado do
  // melhor (sem conflito, menor carga) pro pior. Compartilhado entre o
  // badge que aparece durante o arrasto (mostrarCargaDurantoDrag) e o modal
  // do botão "mover" (abrirModalMover) — mesmo critério nos dois lugares.
  // apenasVisiveis=true (usado só pelo badge de arrasto) restringe a quem
  // já tem uma linha na grade — só ela tem onde colar o badge. O modal usa
  // o padrão (time inteiro): dá pra escalar alguém que não apareceu na
  // grade hoje por não ter nenhuma operação (analista "livre" no dia).
  function calcularCargaParaMover(payload, {apenasVisiveis=false}={}){
    let ids;
    if(apenasVisiveis){
      const zonas = [...main.querySelectorAll('[data-drop-analista]')];
      ids = [...new Set(zonas.map(z=>z.dataset.dropAnalista))];
    } else {
      const origem = userById(payload.origemAnalistaId);
      ids = DB.users.filter(u=>u.role==='analista' && u.active && u.supervisorId===origem?.supervisorId).map(u=>u.id);
    }
    ids = ids.filter(id=>id!==payload.origemAnalistaId);
    const mesRef = payload.data.slice(0,7);
    const infos = ids.map(id=>{
      const opsHoje = DB.baseMestra.filter(b=>b.analistaId===id && bmRodaNoDia(b, payload.data))
        .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===payload.data)).length;
      const coberturasNoMes = DB.ausencias.filter(x=>x.suplenteId===id && x.data.slice(0,7)===mesRef).length;
      const conflito = conflitoAoMoverPara(id, payload.data, payload.horaInicio, payload.horaFim);
      return { id, name: userById(id)?.name || '—', opsHoje, coberturasNoMes, conflito };
    });
    infos.sort((a,b)=> (a.conflito?1:0)-(b.conflito?1:0) || a.opsHoje-b.opsHoje || a.coberturasNoMes-b.coberturasNoMes);
    return infos;
  }
  // Badge de carga durante o arrasto — manipulação direta do DOM (não passa
  // por renderMain) porque um re-render no meio do gesto de arrastar
  // cancela o drag em alguns navegadores.
  function mostrarCargaDurantoDrag(payload){
    const infos = calcularCargaParaMover(payload, {apenasVisiveis:true});
    const melhorId = infos.find(i=>!i.conflito)?.id;
    infos.forEach(info=>{
      const label = main.querySelector(`.prog-row-label[data-drop-analista="${info.id}"]`);
      if(!label) return;
      const badge = document.createElement('span');
      badge.className = 'prog-carga-badge' + (info.conflito ? ' prog-carga-conflito' : info.id===melhorId ? ' prog-carga-melhor' : '');
      badge.dataset.cargaBadge = '1';
      badge.textContent = info.conflito ? `⚠ ${info.conflito}` : `${info.opsHoje} op · ${info.coberturasNoMes} cob/mês`;
      label.appendChild(badge);
    });
  }
  function limparCargaDrag(){
    main.querySelectorAll('[data-carga-badge]').forEach(el=>el.remove());
  }

  // Acha o compromisso que realmente bate no horário do destino — só os
  // dois casos "resolvíveis" (própria operação ou outra cobertura que ele
  // já faz; jornada/folga/vigência não têm o que mover pra desfazer). Usado
  // só pela cascata automática de registrarMovimento.
  function acharConflitoParaCascata(analistaId, dataStr, horaInicio, horaFim){
    const s1 = hourSortValue(horaInicio), e1 = hourSortValue(horaFim);
    const opsProprias = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, dataStr))
      .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===dataStr));
    const bmConflitante = opsProprias.find(b=>rangesOverlap(s1,e1, hourSortValue(b.horaInicio), hourSortValue(b.horaFim)));
    if(bmConflitante) return { tipo:'fixa', bm:bmConflitante };
    const ausConflitante = DB.ausencias.filter(x=>x.suplenteId===analistaId && x.data===dataStr)
      .find(x=>rangesOverlap(s1,e1, hourSortValue(x.horaInicio), hourSortValue(x.horaFim)));
    if(ausConflitante) return { tipo:'cobertura', ausencia:ausConflitante };
    return null;
  }

  // Registra (ou atualiza, se já existia) uma pendência de movimento —
  // usado tanto pelo drop do arrasto quanto pela escolha no modal do botão
  // "mover" (abrirModalMover), pra manter as duas vias 100% equivalentes.
  //
  // Cascata automática: se o destino escolhido já tem algo batendo bem
  // nesse horário (própria operação ou outra cobertura), em vez de só
  // empilhar dois compromissos conflitando na mesma pessoa, procura outro
  // analista livre pra assumir ESSE conflitante e registra isso também
  // como pendência (some/edita normalmente em "Ver detalhes", igual
  // qualquer outra). Só acontece quando acha alguém pra receber a troca —
  // sem candidato, cai no comportamento de antes (só avisa o conflito).
  // Cadeia de 2 saltos: quando o destino não serve DIRETO pro pendente (nem
  // dá pra resolver só trocando o compromisso exato que bate no horário —
  // ex.: o choque dele é de jornada, não de agenda, ou simplesmente não tem
  // nenhum conflito "exato" mas ele também não é elegível), procura uma
  // operação fixa (sem suplente ainda) de QUALQUER outro analista do time
  // que o destino consiga assumir sem problema — e cujo DONO, uma vez
  // livre dela, consiga cobrir o pendente original no lugar do destino.
  // Exemplo real: escalar o Natanael pra Caucaia, mas ele não serve pra
  // Caucaia — porém serve pra Paulista (do Gabriel), e o Gabriel, livre da
  // Paulista, serve pra Caucaia. Resultado: Natanael pega Paulista, Gabriel
  // pega Caucaia — o pendente original sai coberto por outra pessoa, não
  // pelo destino escolhido, mas o destino ainda "entra" na escala.
  function acharCadeiaDeTroca(payload, destinoId){
    const destino = userById(destinoId);
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===destino?.supervisorId);
    const candidatosHubs = [];
    myAnalistas.forEach(a=>{
      if(a.id===destinoId || a.id===payload.origemAnalistaId) return;
      DB.baseMestra.filter(b=>b.analistaId===a.id && bmRodaNoDia(b, payload.data) && b.id!==payload.bmId)
        .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===payload.data))
        .forEach(bm=>candidatosHubs.push({bm, dono:a}));
    });
    for(const {bm, dono} of candidatosHubs){
      if(conflitoAoMoverPara(destinoId, payload.data, bm.horaInicio, bm.horaFim)) continue;
      const conflitoDono = conflitoAoMoverPara(dono.id, payload.data, payload.horaInicio, payload.horaFim);
      if(conflitoDono){
        // Só serve se o próprio hub que estamos liberando (bm) for o único
        // motivo do bloqueio dele — senão essa troca não resolve nada.
        const causa = acharConflitoParaCascata(dono.id, payload.data, payload.horaInicio, payload.horaFim);
        if(!causa || causa.tipo!=='fixa' || causa.bm.id!==bm.id) continue;
      }
      return {
        cascata: { categoria:'fixa', bmId:bm.id, titularId:dono.id, origemAnalistaId:dono.id,
          operacao:bm.operacao, ciclo:bm.ciclo, horaInicio:bm.horaInicio, horaFim:bm.horaFim, data:payload.data },
        novoDestinoPrincipal: dono.id,
      };
    }
    return null;
  }

  function registrarMovimento(payload, destinoId){
    let conflito = conflitoAoMoverPara(destinoId, payload.data, payload.horaInicio, payload.horaFim);
    const cascata = acharConflitoParaCascata(destinoId, payload.data, payload.horaInicio, payload.horaFim);
    let resolvido = false;
    if(cascata){
      const destino = userById(destinoId);
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===destino?.supervisorId);
      let payloadCascata, titularCascata;
      if(cascata.tipo==='fixa'){
        const bm = cascata.bm;
        titularCascata = destinoId;
        payloadCascata = { categoria:'fixa', bmId:bm.id, titularId:destinoId, origemAnalistaId:destinoId,
          operacao:bm.operacao, ciclo:bm.ciclo, horaInicio:bm.horaInicio, horaFim:bm.horaFim, data:payload.data };
      } else {
        const aus = cascata.ausencia;
        const bm = DB.baseMestra.find(b=>b.id===aus.baseMestraId);
        titularCascata = aus.analistaId;
        payloadCascata = { categoria:'cobertura', bmId:aus.baseMestraId, titularId:aus.analistaId, origemAnalistaId:destinoId,
          operacao: bm?.operacao || aus.operacao, ciclo: bm?.ciclo || aus.ciclo, horaInicio:aus.horaInicio, horaFim:aus.horaFim, data:payload.data };
      }
      const candidatos = candidatosParaSlot(myAnalistas, titularCascata, {horaInicio:payloadCascata.horaInicio, horaFim:payloadCascata.horaFim}, payload.data)
        .filter(c=>c.id!==destinoId);
      if(candidatos.length>0){
        registrarMovimentoSimples(payloadCascata, candidatos[0].id);
        conflito = null; // resolvido em cascata — a principal não bate mais em nada
        resolvido = true;
      }
    }
    if(!resolvido && conflito){
      const cadeia = acharCadeiaDeTroca(payload, destinoId);
      if(cadeia){
        registrarMovimentoSimples(cadeia.cascata, destinoId);
        registrarMovimentoSimples(payload, cadeia.novoDestinoPrincipal, null);
        return;
      }
    }
    registrarMovimentoSimples(payload, destinoId, conflito);
  }
  function registrarMovimentoSimples(payload, destinoId, conflitoForcado){
    const destino = userById(destinoId);
    const conflito = conflitoForcado!==undefined ? conflitoForcado : conflitoAoMoverPara(destinoId, payload.data, payload.horaInicio, payload.horaFim);
    const chave = `${payload.bmId}|${payload.categoria}|${payload.data}|${payload.origemAnalistaId}`;
    const existente = uiState.progMoves.find(m=>m.id===chave);
    const move = {
      id: chave, categoria: payload.categoria, bmId: payload.bmId, titularId: payload.titularId,
      origemAnalistaId: payload.origemAnalistaId, operacao: payload.operacao, ciclo: payload.ciclo,
      horaInicio: payload.horaInicio, horaFim: payload.horaFim, data: payload.data,
      destinoAnalistaId: destinoId, destinoNome: destino?.name || '—', conflito,
    };
    if(existente) Object.assign(existente, move);
    else uiState.progMoves.push(move);
  }

  // Botão "mover" no card — alternativa ao arrastar pra quem usa touch
  // (celular/tablet), onde o drag-and-drop nativo é ruim ou nem funciona.
  // Abre um modal com a mesma lista/ordem de carga do badge de arrasto;
  // escolher uma opção grava a pendência do mesmo jeito que um drop faria.
  function abrirModalMover(payload){
    const infos = calcularCargaParaMover(payload);
    const linhas = infos.map(info=>`
      <button class="prog-mover-opcao${info.conflito?' prog-mover-opcao-conflito':''}" data-mover-escolher="${info.id}">
        <span class="prog-mover-nome">${escapeHtml(info.name)}</span>
        <span class="prog-mover-info">${info.conflito ? `⚠ ${escapeHtml(info.conflito)}` : `${info.opsHoje} op · ${info.coberturasNoMes} cob/mês`}</span>
      </button>`).join('');
    openModal(`<h3>Mover ${escapeHtml(payload.operacao)}</h3>
      <div class="help-text" style="margin-top:-6px;">${payload.horaInicio}–${payload.horaFim} · ${payload.data.slice(8,10)}/${payload.data.slice(5,7)} — escolha quem recebe:</div>
      <div class="prog-mover-lista">${linhas || '<div class="empty">Nenhum outro analista disponível na grade agora.</div>'}</div>`);
    document.querySelectorAll('[data-mover-escolher]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        registrarMovimento(payload, btn.dataset.moverEscolher);
        closeModal();
        renderMain();
      });
    });
  }
  main.querySelectorAll('[data-mover-categoria]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      abrirModalMover({
        categoria: btn.dataset.moverCategoria, bmId: btn.dataset.moverBmid, titularId: btn.dataset.moverTitularid,
        origemAnalistaId: btn.dataset.moverOrigemid, operacao: btn.dataset.moverOperacao, ciclo: btn.dataset.moverCiclo,
        horaInicio: btn.dataset.moverHorainicio, horaFim: btn.dataset.moverHorafim, data: btn.dataset.moverData,
      });
    });
  });

  // "Redistribuir automaticamente" na faixa de pendência de domingo —
  // resolve TODOS os hubs pendentes daquele dia de uma vez, sem precisar
  // clicar "Escalar suplente" um por um. Reaproveita os mesmos data-mover-*
  // já presentes em cada item da lista (nenhum dado novo, só lê do DOM) e a
  // mesma registrarMovimento (com cadeia de troca automática já embutida).
  // "reservas" evita que o LOTE escale a mesma pessoa duas vezes em
  // horários que batem — calcularCargaParaMover/conflitoAoMoverPara só
  // enxergam o banco real e as pendências JÁ salvas, não as que este
  // mesmo clique está gerando agora.
  const btnRedistribuirDominical = document.getElementById('btnRedistribuirDominical');
  if(btnRedistribuirDominical) btnRedistribuirDominical.addEventListener('click', ()=>{
    const botoes = [...document.querySelectorAll('.prog-pendencia-dom [data-mover-categoria]')];
    const reservas = [];
    let resolvidos = 0;
    botoes.forEach(btn=>{
      const payload = {
        categoria: btn.dataset.moverCategoria, bmId: btn.dataset.moverBmid, titularId: btn.dataset.moverTitularid,
        origemAnalistaId: btn.dataset.moverOrigemid, operacao: btn.dataset.moverOperacao, ciclo: btn.dataset.moverCiclo,
        horaInicio: btn.dataset.moverHorainicio, horaFim: btn.dataset.moverHorafim, data: btn.dataset.moverData,
      };
      const s1 = hourSortValue(payload.horaInicio), e1 = hourSortValue(payload.horaFim);
      const infos = calcularCargaParaMover(payload).filter(i=>
        !reservas.some(r=>r.analistaId===i.id && r.data===payload.data && rangesOverlap(s1,e1, hourSortValue(r.horaInicio), hourSortValue(r.horaFim)))
      );
      const melhor = infos[0];
      if(!melhor) return;
      const antesLen = uiState.progMoves.length;
      registrarMovimento(payload, melhor.id);
      uiState.progMoves.slice(antesLen).forEach(m=>{
        reservas.push({ analistaId:m.destinoAnalistaId, data:m.data, horaInicio:m.horaInicio, horaFim:m.horaFim });
      });
      resolvidos++;
    });
    renderMain();
    alert(`${resolvidos} de ${botoes.length} hub(s) pendente(s) tiveram um suplente sugerido. Revise em "Ver detalhes" antes de salvar.`);
  });

  let dragPayload = null;
  main.querySelectorAll('[data-drag-categoria]').forEach(card=>{
    card.addEventListener('dragstart', (e)=>{
      dragPayload = {
        categoria: card.dataset.dragCategoria,
        bmId: card.dataset.dragBmid,
        titularId: card.dataset.dragTitularid,
        origemAnalistaId: card.dataset.dragOrigemid,
        operacao: card.dataset.dragOperacao,
        ciclo: card.dataset.dragCiclo,
        horaInicio: card.dataset.dragHorainicio,
        horaFim: card.dataset.dragHorafim,
        data: card.dataset.dragData,
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragPayload.bmId);
      card.classList.add('prog-arrastando');
      mostrarCargaDurantoDrag(dragPayload);
    });
    card.addEventListener('dragend', ()=>{ card.classList.remove('prog-arrastando'); dragPayload = null; limparCargaDrag(); });
  });
  main.querySelectorAll('[data-drop-analista]').forEach(zona=>{
    zona.addEventListener('dragover', (e)=>{
      if(!dragPayload) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    zona.addEventListener('dragenter', (e)=>{
      if(!dragPayload) return;
      e.preventDefault();
      main.querySelectorAll(`[data-drop-analista="${zona.dataset.dropAnalista}"]`).forEach(el=>el.classList.add('prog-drop-alvo'));
    });
    zona.addEventListener('dragleave', ()=>{
      main.querySelectorAll(`[data-drop-analista="${zona.dataset.dropAnalista}"]`).forEach(el=>el.classList.remove('prog-drop-alvo'));
    });
    zona.addEventListener('drop', (e)=>{
      e.preventDefault();
      main.querySelectorAll('.prog-drop-alvo').forEach(el=>el.classList.remove('prog-drop-alvo'));
      if(!dragPayload) return;
      const destinoId = zona.dataset.dropAnalista;
      if(destinoId===dragPayload.origemAnalistaId){ dragPayload=null; return; }
      registrarMovimento(dragPayload, destinoId);
      dragPayload = null;
      renderMain();
    });
  });
  main.querySelectorAll('[data-remove-move]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      uiState.progMoves = uiState.progMoves.filter(m=>m.id!==btn.dataset.removeMove);
      renderMain();
    });
  });
  const btnToggleProgMoves = document.getElementById('btnToggleProgMoves');
  if(btnToggleProgMoves) btnToggleProgMoves.addEventListener('click', ()=>{
    uiState.progMovesExpandido = !uiState.progMovesExpandido;
    renderMain();
  });
  const btnDescartarProgMoves = document.getElementById('btnDescartarProgMoves');
  if(btnDescartarProgMoves) btnDescartarProgMoves.addEventListener('click', ()=>{
    if(uiState.progMoves.length>0 && !confirm('Descartar todas as alterações pendentes de posição?')) return;
    uiState.progMoves = [];
    renderMain();
  });
  const btnSalvarProgMoves = document.getElementById('btnSalvarProgMoves');
  if(btnSalvarProgMoves) btnSalvarProgMoves.addEventListener('click', async ()=>{
    const moves = uiState.progMoves;
    const avisoConflito = moves.some(m=>m.conflito) ? `\n\nAtenção: ${moves.filter(m=>m.conflito).length} dessas alterações têm um aviso de conflito (jornada, folga ou horário batendo) — a movimentação acontece mesmo assim.` : '';
    if(!confirm(`Aplicar ${moves.length} alteração(ões) na escala?${avisoConflito}`)) return;
    btnSalvarProgMoves.disabled = true;
    let ok=0, fail=0;
    for(const m of moves){
      try{
        if(m.categoria==='fixa'){
          const nova = await apiCreateAusencia({analistaId:m.titularId, baseMestraId:m.bmId, operacao:m.operacao, ciclo:m.ciclo,
            horaInicio:m.horaInicio, horaFim:m.horaFim, data:m.data, tipo:'folga', suplenteId:m.destinoAnalistaId, suplenteNome:m.destinoNome});
          DB.ausencias.push(nova);
        } else if(m.categoria==='cobertura'){
          const existente = DB.ausencias.find(a=>a.baseMestraId===m.bmId && a.data===m.data && a.analistaId===m.titularId);
          if(!existente) throw new Error('cobertura original não encontrada (pode já ter sido alterada por outra pessoa)');
          const atualizada = await apiUpdateAusencia(existente.id, {suplenteId:m.destinoAnalistaId, suplenteNome:m.destinoNome});
          DB.ausencias = DB.ausencias.map(a=>a.id===existente.id ? atualizada : a);
        } else {
          // 'avulsa' — Suplências ad-hoc (ver suplencias.controller.js): não
          // tem suplenteId, só o nome mesmo (campo texto "suplente").
          const atualizada = await apiUpdateSuplencia(m.bmId, {suplente:m.destinoNome});
          DB.suplencias = DB.suplencias.map(s=>s.id===m.bmId ? atualizada : s);
        }
        ok++;
      }catch(e){ console.error('KronoOP: falha ao mover operação.', m, e); fail++; }
    }
    uiState.progMoves = [];
    renderMain();
    alert(`${ok} alteração(ões) aplicada(s) com sucesso.${fail?` ${fail} falharam.`:''}`);
  });
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
      // Só fecha pelo "Cancelar" ou enviando de verdade — texto de
      // observação (mínimo 150 caracteres) é fácil de perder num clique
      // sem querer fora do modal (mesmo motivo da Particularidade,
      // modalLocked, ver ui.js/main.js).
      modalLocked = true;
      openModal(`
        <h3>Enviar Raio-X — ${op} (${hora})</h3>
        <div class="help-text">Avalie com estrelas, informe o SPR lançado e descreva o que aconteceu. A observação precisa de no mínimo ${RAIOX_MIN_OBS_LEN} caracteres para fechar — tudo isso é obrigatório, a não ser que marque "Sem roteirização" abaixo. O tempo de execução vem da planilha de roteirização, não precisa informar aqui.</div>
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
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" id="raioxSemOrfaos"> Sem órfãos</label>
        </div>
        <div class="field">
          <label>Órfãos (opcional)</label>
          <input type="number" id="raioxOrfaos" step="1" min="0" placeholder="Quantidade de pedidos órfãos">
        </div>
        <div class="field">
          <label>Observação (Raio-X da operação)</label>
          <textarea id="raioxObs" rows="5" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;" placeholder="Descreva com detalhes o que aconteceu nessa operação..."></textarea>
          <div id="raioxCounter" style="font-size:11.5px;color:var(--text-faint);margin-top:4px;">0 / ${RAIOX_MIN_OBS_LEN} caracteres mínimos</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmFinalizar" disabled>Enviar Raio-X</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const starsEl = document.getElementById('raioxStars');
      const semRotEl = document.getElementById('raioxSemRot');
      const obsEl = document.getElementById('raioxObs');
      const sprRealEl = document.getElementById('raioxSprReal');
      const semOrfaosEl = document.getElementById('raioxSemOrfaos');
      const orfaosEl = document.getElementById('raioxOrfaos');
      const counterEl = document.getElementById('raioxCounter');
      const confirmBtn = document.getElementById('confirmFinalizar');
      function updateState(){
        const semRot = semRotEl.checked;
        sprRealEl.disabled = semRot;
        sprRealEl.style.opacity = semRot ? '0.4' : '1';
        // Órfãos não se aplica sem roteirização (nada foi roteirizado pra
        // sobrar órfão), e "Sem órfãos" marcado já fixa o valor em 0 — nos
        // dois casos o campo numérico fica travado.
        const semOrfaos = semOrfaosEl.checked;
        orfaosEl.disabled = semRot || semOrfaos;
        orfaosEl.style.opacity = (semRot || semOrfaos) ? '0.4' : '1';
        if(semOrfaos) orfaosEl.value = '0';
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
      semOrfaosEl.addEventListener('change', updateState);
      confirmBtn.onclick = async ()=>{
        const semRot = semRotEl.checked;
        const observacao = obsEl.value.trim();
        const sprReal = Number(sprRealEl.value);
        if(estrelas<1) return;
        if(!semRot && (observacao.length<RAIOX_MIN_OBS_LEN || sprRealEl.value.trim()==='' || Number.isNaN(sprReal))) return;
        // Nulo = "não informado" (registro antigo ou ninguém preencheu ainda);
        // 0 é uma resposta de verdade ("Sem órfãos" marcado), não o padrão.
        const orfaos = semRot ? null : (semOrfaosEl.checked ? 0 : (orfaosEl.value.trim()==='' ? null : Number(orfaosEl.value)));
        const entrada = {analistaId:session.userId, operacao:op, hora, data, estrelas, observacao,
          sprRoteirizado: semRot ? 0 : sprReal, sprMeta: semRot ? null : sprMeta, ciclo, semRoteirizacao:semRot, orfaos};
        confirmBtn.disabled = true;
        try{
          const novo = await apiCreateRaioX(entrada);
          DB.raioX.push(novo);
          // DB.raioXHistorico (Resultado SPR/Tempo de Execução) é uma busca
          // separada (ver loadDB, state.js) — sem isso, essa finalização só
          // apareceria lá depois do próximo heartbeat de 10min.
          DB.raioXHistorico.push(novo);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível enviar: '+e.message); confirmBtn.disabled = false; }
      };
    });
  });

  // Editar/Excluir um Raio-X já fechado — só aparece pro supervisor olhando
  // a operação de alguém da equipe (ver renderExecucaoActions,
  // render-analista.js): preenchimento incorreto ou roteirização cancelada
  // depois do fato. Mesmos campos do Finalizar, só que preenchidos com o
  // que já foi lançado, e sem os campos de início/fim manual (não mexe em
  // Tempo de Execução aqui — ver updateRaioX, backend).
  main.querySelectorAll('[data-editar-raiox]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = DB.raioX.find(x=>x.id===btn.dataset.editarRaiox);
      if(!r) return;
      let estrelas = r.estrelas || 0;
      openModal(`
        <h3>Editar Raio-X — ${escapeHtml(r.operacao)} (${r.hora})</h3>
        <div class="help-text">Corrige um preenchimento incorreto ou marca a roteirização como cancelada. A observação precisa de no mínimo ${RAIOX_MIN_OBS_LEN} caracteres, a não ser que marque "Sem roteirização".</div>
        <div class="field">
          <label>Avaliação</label>
          <div id="raioxEditStars" class="star-picker" style="display:flex;gap:6px;font-size:28px;line-height:1;">
            ${[1,2,3,4,5].map(n=>`<span data-star="${n}" style="cursor:pointer;opacity:${n<=estrelas?'1':'0.3'};color:${n<=estrelas?'var(--brand)':''};">★</span>`).join('')}
          </div>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" id="raioxEditSemRot" ${r.semRoteirizacao?'checked':''}> Sem roteirização nesse horário</label>
        </div>
        <div class="field">
          <label>SPR lançado</label>
          <input type="number" id="raioxEditSprReal" step="any" value="${r.semRoteirizacao ? '' : escapeHtml(String(r.sprRoteirizado ?? ''))}">
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" id="raioxEditSemOrfaos" ${r.orfaos===0?'checked':''}> Sem órfãos</label>
        </div>
        <div class="field">
          <label>Órfãos (opcional)</label>
          <input type="number" id="raioxEditOrfaos" step="1" min="0" value="${r.orfaos!=null && r.orfaos>0 ? r.orfaos : ''}">
        </div>
        <div class="field">
          <label>Observação (Raio-X da operação)</label>
          <textarea id="raioxEditObs" rows="5" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(r.semRoteirizacao ? '' : (r.observacao||''))}</textarea>
          <div id="raioxEditCounter" style="font-size:11.5px;color:var(--text-faint);margin-top:4px;"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarRaiox">Salvar alterações</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const starsEl = document.getElementById('raioxEditStars');
      const semRotEl = document.getElementById('raioxEditSemRot');
      const obsEl = document.getElementById('raioxEditObs');
      const sprRealEl = document.getElementById('raioxEditSprReal');
      const semOrfaosEl = document.getElementById('raioxEditSemOrfaos');
      const orfaosEl = document.getElementById('raioxEditOrfaos');
      const counterEl = document.getElementById('raioxEditCounter');
      const confirmBtn = document.getElementById('confirmEditarRaiox');
      function updateState(){
        const semRot = semRotEl.checked;
        sprRealEl.disabled = semRot;
        sprRealEl.style.opacity = semRot ? '0.4' : '1';
        const semOrfaos = semOrfaosEl.checked;
        orfaosEl.disabled = semRot || semOrfaos;
        orfaosEl.style.opacity = (semRot || semOrfaos) ? '0.4' : '1';
        if(semOrfaos) orfaosEl.value = '0';
        const len = obsEl.value.trim().length;
        counterEl.textContent = semRot ? 'Observação opcional (sem roteirização nesse horário)' : `${len} / ${RAIOX_MIN_OBS_LEN} caracteres mínimos`;
        counterEl.style.color = (semRot || len>=RAIOX_MIN_OBS_LEN) ? 'var(--done)' : 'var(--text-faint)';
      }
      starsEl.querySelectorAll('[data-star]').forEach(s=>{
        s.addEventListener('click', ()=>{
          estrelas = parseInt(s.dataset.star,10);
          starsEl.querySelectorAll('[data-star]').forEach(x=>{
            const active = parseInt(x.dataset.star,10) <= estrelas;
            x.style.opacity = active ? '1' : '0.3';
            x.style.color = active ? 'var(--brand)' : '';
          });
        });
      });
      semRotEl.addEventListener('change', updateState);
      obsEl.addEventListener('input', updateState);
      semOrfaosEl.addEventListener('change', updateState);
      updateState();
      confirmBtn.onclick = async ()=>{
        const semRot = semRotEl.checked;
        const observacao = obsEl.value.trim();
        const sprReal = Number(sprRealEl.value);
        if(estrelas<1) return;
        if(!semRot && (observacao.length<RAIOX_MIN_OBS_LEN || sprRealEl.value.trim()==='' || Number.isNaN(sprReal))) return;
        const orfaos = semRot ? null : (semOrfaosEl.checked ? 0 : (orfaosEl.value.trim()==='' ? null : Number(orfaosEl.value)));
        const patch = {estrelas, observacao, semRoteirizacao:semRot, sprRoteirizado: semRot ? 0 : sprReal, sprMeta: semRot ? null : r.sprMeta, orfaos};
        confirmBtn.disabled = true;
        try{
          const atualizado = await apiUpdateRaioX(r.id, patch);
          Object.assign(r, atualizado);
          // r veio de DB.raioX — DB.raioXHistorico é uma cópia separada (ver
          // loadDB, state.js), precisa ser atualizada à parte pra Resultado
          // SPR/Tempo de Execução não continuar mostrando o valor antigo.
          const rHistorico = DB.raioXHistorico.find(x=>x.id===r.id);
          if(rHistorico) Object.assign(rHistorico, atualizado);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); confirmBtn.disabled = false; }
      };
    });
  });
  main.querySelectorAll('[data-excluir-raiox]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este Raio-X? A operação volta a aparecer como pendente de finalização.')) return;
      const id = btn.dataset.excluirRaiox;
      btn.disabled = true;
      try{
        await apiDeleteRaioX(id);
        DB.raioX = DB.raioX.filter(x=>x.id!==id);
        DB.raioXHistorico = DB.raioXHistorico.filter(x=>x.id!==id);
        renderMain();
      }catch(e){ alert('Não foi possível excluir: '+e.message); btn.disabled = false; }
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

  // Nova cobertura avulsa — "Nova cobertura avulsa" lança tipo folga
  // (comportamento de sempre) e "Cobertura de férias" lança tipo férias;
  // mesmo modal pros dois, só muda o tipo gravado.
  function abrirModalNovaSuplencia(tipo){
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const ferias = tipo==='ferias';
    const titulo = ferias ? 'Nova cobertura avulsa — Férias' : 'Nova cobertura avulsa';
    openModal(`<h3>${titulo}</h3>
      <div class="field"><label>Analista original (quem está sendo coberto)</label><select id="fOrig">${myAnalistas.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>Suplente</label><select id="fSup">${myAnalistas.map(a=>`<option value="${a.name}">${a.name}</option>`).join('')}</select></div>
      <div class="grid-2"><div class="field"><label>Operação</label><input id="fOp2" placeholder="ex: COL-B"></div>
      <div class="field"><label>Ciclo</label><input id="fCiclo2" value="T3"></div></div>
      <div class="grid-2"><div class="field"><label>Início</label><select id="fHi2">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div>
      <div class="field"><label>Fim</label><select id="fHf2">${HOURS.map(h=>`<option>${h}</option>`).join('')}</select></div></div>
      ${ferias ? `<div class="grid-2">
        <div class="field"><label>Início das férias</label><input type="date" id="fDataIni" value="${todayISO()}"></div>
        <div class="field"><label>Fim das férias</label><input type="date" id="fDataFim" value="${todayISO()}"></div>
      </div>
      <div class="help-text">Lança uma cobertura avulsa por dia, do início ao fim (os dois incluídos).</div>`
        : `<div class="field"><label>Data da cobertura</label><input type="date" id="fData" value="${todayISO()}"></div>`}
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovaSuplencia">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovaSuplencia').onclick = async ()=>{
      const analistaOriginalId = document.getElementById('fOrig').value;
      const base = {operacao:document.getElementById('fOp2').value||'OP', ciclo:document.getElementById('fCiclo2').value||'T3',
        horaInicio:document.getElementById('fHi2').value, horaFim:document.getElementById('fHf2').value,
        suplente:document.getElementById('fSup').value||'—', analistaOriginalId, tipo};
      if(ferias){
        const ini = document.getElementById('fDataIni').value, fim = document.getElementById('fDataFim').value;
        if(!ini || !fim || fim<ini){ alert('Selecione um período de férias válido (fim não pode ser antes do início).'); return; }
        const datas = [];
        for(let d=ini; d<=fim; d=addDaysISO(d,1)) datas.push(d);
        let ok=0, fail=0;
        openProgressModal('Lançando cobertura de férias...');
        for(const [idx, dataCobertura] of datas.entries()){
          try{ DB.suplencias.push(await apiCreateSuplencia({...base, dataCobertura})); ok++; }
          catch(e){ fail++; }
          updateProgressModal(idx+1, datas.length);
        }
        closeModal(); renderMain();
        if(fail) alert(`${ok} dia(s) lançado(s), ${fail} falharam.`);
      } else {
        try{
          const novo = await apiCreateSuplencia({...base, dataCobertura:document.getElementById('fData').value});
          DB.suplencias.push(novo);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      }
    };
  }
  const btnNovaSuplencia = document.getElementById('btnNovaSuplencia');
  if(btnNovaSuplencia) btnNovaSuplencia.addEventListener('click', ()=> abrirModalNovaSuplencia('folga'));
  const btnNovaSuplenciaFerias = document.getElementById('btnNovaSuplenciaFerias');
  if(btnNovaSuplenciaFerias) btnNovaSuplenciaFerias.addEventListener('click', ()=> abrirModalNovaSuplencia('ferias'));

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

  // Resultado SPR (supResultadoSPR/coordResultadoSPR). Operação virou um
  // input com <datalist> (pra dar pra pesquisar digitando o nome do hub em
  // vez de rolar um select gigante) — campo vazio volta pra "todas".
  main.querySelectorAll('[data-sprfiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.sprfiltro;
      uiState.sprFiltro[key] = (key==='operacao' && inp.value.trim()==='') ? 'all' : inp.value;
      if((key==='inicio'||key==='fim') && uiState.sprFiltro.inicio > uiState.sprFiltro.fim){
        uiState.sprFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
      }
      renderMain();
    });
  });
  main.querySelectorAll('.toggle-group[data-scope="spr-view"] [data-sprview]').forEach(el=>{
    el.addEventListener('click', ()=>{ uiState.sprView = el.dataset.sprview; renderMain(); });
  });

  // Tempo de Execução (supTempoExecucao/coordTempoExecucao/
  // analistaTempoExecucao) — mesmo padrão do filtro de Resultado SPR acima.
  main.querySelectorAll('[data-tempofiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.tempofiltro;
      uiState.tempoFiltro[key] = (key==='operacao' && inp.value.trim()==='') ? 'all' : inp.value;
      if((key==='inicio'||key==='fim') && uiState.tempoFiltro.inicio > uiState.tempoFiltro.fim){
        uiState.tempoFiltro[key==='inicio'?'fim':'inicio'] = inp.value;
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
  // (render-supervisor.js: supOcorrencias).
  const btnExportDomingos = document.getElementById('btnExportDomingos');
  if(btnExportDomingos) btnExportDomingos.addEventListener('click', ()=>{
    exportarRelatorioExcel(`controle-domingos_${uiState.domingosMes.slice(0,7)}.xlsx`, ['Analista','Data','Status','Tipo'], domingosExportRows);
  });
  const btnExportOcorrencias = document.getElementById('btnExportOcorrencias');
  if(btnExportOcorrencias) btnExportOcorrencias.addEventListener('click', exportarOcorrencias);
  const btnExportSPR = document.getElementById('btnExportSPR');
  if(btnExportSPR) btnExportSPR.addEventListener('click', exportarSPR);
  const btnExportTempo = document.getElementById('btnExportTempo');
  if(btnExportTempo) btnExportTempo.addEventListener('click', exportarTempo);

  // Filtro por Supervisor da tela de Métricas do coordenador (ver
  // coordMetricas em render-coordenador.js) e das outras telas executivas.
  bindMultiselect(main, 'btnMetricasSupervisorToggle', 'metricasSupervisorTodos', 'metricasSupervisorChk', uiState.metricasFiltro, 'supervisores', 'metricasSupervisorDropdownOpen');
  bindMultiselect(main, 'btnDashboardSupervisorToggle', 'dashboardSupervisorTodos', 'dashboardSupervisorChk', uiState.dashboardFiltro, 'supervisores', 'dashboardSupervisorDropdownOpen');
  bindMultiselect(main, 'btnPainelSupervisorToggle', 'painelSupervisorTodos', 'painelSupervisorChk', uiState.painelFiltro, 'supervisores', 'painelSupervisorDropdownOpen');
  bindMultiselect(main, 'btnStatusSupervisorToggle', 'statusSupervisorTodos', 'statusSupervisorChk', uiState.statusFiltro, 'supervisores', 'statusSupervisorDropdownOpen');
  bindMultiselect(main, 'btnSprAnalistaToggle', 'sprAnalistaTodos', 'sprAnalistaChk', uiState.sprFiltro, 'analistas', 'sprAnalistaDropdownOpen');
  bindMultiselect(main, 'btnSprSupervisorToggle', 'sprSupervisorTodos', 'sprSupervisorChk', uiState.sprFiltro, 'supervisores', 'sprSupervisorDropdownOpen');
  bindMultiselect(main, 'btnTempoAnalistaToggle', 'tempoAnalistaTodos', 'tempoAnalistaChk', uiState.tempoFiltro, 'analistas', 'tempoAnalistaDropdownOpen');
  bindMultiselect(main, 'btnTempoSupervisorToggle', 'tempoSupervisorTodos', 'tempoSupervisorChk', uiState.tempoFiltro, 'supervisores', 'tempoSupervisorDropdownOpen');

  const metricasPanel = main.querySelector('.multiselect-panel');
  if(metricasPanel) metricasPanel.addEventListener('click', e=>e.stopPropagation());

  const progSel = document.getElementById('progAnalistaSel');
  if(progSel) progSel.addEventListener('change', ()=>{ uiState.progAnalista = progSel.value; renderMain(); });
  const progDate = document.getElementById('progDateSel');
  if(progDate) progDate.addEventListener('change', ()=>{ uiState.progDate = progDate.value; renderMain(); });

  main.querySelectorAll('[data-abrir-escaladom]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const dia = btn.dataset.abrirEscaladom;
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      openModalLarge(escalaDomModalBody(dia));
      wireEscalaDomModal(myAnalistas, dia);
    });
  });

  const escalaDomMesInput = document.getElementById('escalaDomMesInput');
  if(escalaDomMesInput) escalaDomMesInput.addEventListener('change', ()=>{
    uiState.escalaDomMes = escalaDomMesInput.value;
    // A seleção de domingos era do mês anterior — deixa em branco pra
    // render recalcular os primeiros do mês novo (ver supGerarEscalaDomingo),
    // em vez de arrastar datas que nem existem nele.
    uiState.escalaDomDomingosSel = [];
    uiState.escalaDomResultados = {};
    renderMain();
  });

  main.querySelectorAll('.escaladom-domingo-chk').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const marcados = Array.from(main.querySelectorAll('.escaladom-domingo-chk:checked')).map(c=>c.value);
      if(marcados.length>MAX_DOMINGOS_ESCALA){
        chk.checked = false;
        alert(`Máximo de ${MAX_DOMINGOS_ESCALA} domingos.`);
        return;
      }
      uiState.escalaDomDomingosSel = marcados;
      uiState.escalaDomResultados = {};
      const countEl = document.getElementById('escalaDomDomingosCount');
      if(countEl) countEl.textContent = marcados.length;
    });
  });

  // Trocar Grupo A↔B direto poupa reconstruir as duas listas do zero —
  // troca quem cobre o 1º/3º domingo com quem cobre o 2º/4º. Zera os
  // resultados já gerados, senão eles continuariam apontando pro grupo de
  // ANTES da troca.
  const btnInverterEscalaDom = document.getElementById('btnInverterEscalaDom');
  if(btnInverterEscalaDom) btnInverterEscalaDom.addEventListener('click', ()=>{
    [uiState.escalaDomGrupoA, uiState.escalaDomGrupoB] = [uiState.escalaDomGrupoB, uiState.escalaDomGrupoA];
    uiState.escalaDomResultados = {};
    renderMain();
  });

  const btnGerarEscalaDom = document.getElementById('btnGerarEscalaDom');
  if(btnGerarEscalaDom) btnGerarEscalaDom.addEventListener('click', ()=>{
    const domingos = uiState.escalaDomDomingosSel;
    if(domingos.length===0){ alert('Marque ao menos um domingo do mês.'); return; }
    if(uiState.escalaDomGrupoA.length===0 && uiState.escalaDomGrupoB.length===0){ alert('Selecione ao menos um analista no Grupo A ou no Grupo B.'); return; }
    const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
    const idsEquipe = myAnalistas.map(a=>a.id);
    function gerarLinhas(escaladoIds, dataStr){
      const { escalados, naoCobertos } = gerarEscalaFDS(escaladoIds, dataStr, idsEquipe);
      return [
        ...escalados.flatMap(e=>e.assigned.map(h=>({...h, escaladoId:e.id}))),
        ...naoCobertos.map(h=>({...h, escaladoId:''})),
      ].sort((a,b)=>a.startMs-b.startMs);
    }
    // Revezamento A-B-A-B na ordem cronológica dos domingos marcados —
    // domingo sem gente no grupo da vez fica sem proposta (nada pra
    // ajustar/confirmar nele).
    const resultados = {};
    domingos.forEach((data, idx)=>{
      const grupo = idx%2===0 ? 'A' : 'B';
      const sel = grupo==='A' ? uiState.escalaDomGrupoA : uiState.escalaDomGrupoB;
      if(sel.length===0) return;
      resultados[data] = { data, grupo, escalados: sel, linhas: gerarLinhas(sel, data) };
    });
    uiState.escalaDomResultados = resultados;
    renderMain();
  });
  main.querySelectorAll('[data-escaladom-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const data = sel.dataset.escaladomDia; // data ISO do domingo
      const idx = parseInt(sel.dataset.escaladomIdx,10);
      uiState.escalaDomResultados[data].linhas[idx].escaladoId = sel.value;
      renderMain();
    });
  });
  main.querySelectorAll('[data-confirmar-escaladom]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const data = btn.dataset.confirmarEscaladom; // data ISO do domingo
      const res = uiState.escalaDomResultados[data];
      const cobertas = res.linhas.filter(l=>l.escaladoId);
      let ok=0, fail=0;
      openProgressModal(`Lançando escala do domingo ${formatarDataCurta(data)}...`);
      for(const [idx, l] of cobertas.entries()){
        const entrada = {operacao:l.operacao, ciclo:l.ciclo, horaInicio:l.horaInicio, horaFim:l.horaFim,
          suplente:userById(l.escaladoId)?.name||'', dataCobertura:res.data,
          analistaOriginalId: l.analistaId || l.escaladoId, tipo:'folga'};
        try{ DB.suplencias.push(await apiCreateSuplencia(entrada)); ok++; }
        catch(e){ console.error('KronoOP: falha ao lançar cobertura da escala de domingo.', e); fail++; }
        updateProgressModal(idx+1, cobertas.length);
      }
      closeModal();
      delete uiState.escalaDomResultados[data];
      renderMain();
      alert(`${ok} cobertura(s) lançada(s) com sucesso.${fail?` ${fail} falharam.`:''}`);
    });
  });

  const escalaMensalMesInput = document.getElementById('escalaMensalMesInput');
  if(escalaMensalMesInput) escalaMensalMesInput.addEventListener('change', ()=>{
    uiState.escalaMensalMes = escalaMensalMesInput.value;
    // Vigência custom era do mês anterior — volta a acompanhar o mês novo
    // (1º ao último dia) em vez de arrastar uma data que nem existe nele.
    uiState.escalaMensalDataInicio = null;
    uiState.escalaMensalDataFim = null;
    uiState.escalaMensalResultado = null;
    renderMain();
  });
  const escalaMensalInicioInput = document.getElementById('escalaMensalInicioInput');
  if(escalaMensalInicioInput) escalaMensalInicioInput.addEventListener('change', ()=>{
    uiState.escalaMensalDataInicio = escalaMensalInicioInput.value;
  });
  const escalaMensalFimInput = document.getElementById('escalaMensalFimInput');
  if(escalaMensalFimInput) escalaMensalFimInput.addEventListener('change', ()=>{
    uiState.escalaMensalDataFim = escalaMensalFimInput.value;
  });
  main.querySelectorAll('[data-gerar-escala-mensal]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      // idsEquipe fica com o time inteiro (ativos + inativos) — é o que
      // define quais hubs entram na redistribuição (inclusive os que hoje
      // são de alguém desativado, que MAIS precisam de um titular novo) e
      // o histórico de "já teve" consultado. Só quem PODE receber um hub
      // novo (candidatoIds) fica restrito aos cadastros ativos.
      const todosAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      const idsEquipe = todosAnalistas.map(a=>a.id);
      const candidatoIds = todosAnalistas.filter(a=>a.active).map(a=>a.id);
      const { linhas } = gerarEscalaMensal(candidatoIds, idsEquipe);
      uiState.escalaMensalResultado = { mes: uiState.escalaMensalMes, linhas };
      renderMain();
    });
  });
  main.querySelectorAll('[data-escalamensal-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const idx = parseInt(sel.dataset.escalamensalIdx,10);
      uiState.escalaMensalResultado.linhas[idx].analistaId = sel.value;
      renderMain();
    });
  });
  const btnConfirmarEscalaMensal = document.getElementById('btnConfirmarEscalaMensal');
  if(btnConfirmarEscalaMensal) btnConfirmarEscalaMensal.addEventListener('click', async ()=>{
    const res = uiState.escalaMensalResultado;
    // Vigência editável (ver campos Início/Fim, render-supervisor.js) — cai
    // pro mês inteiro se a pessoa não mexeu. Clampa nos limites do mês de
    // novo aqui (segunda camada, além do min/max do input) porque o
    // resultado pode ter sido gerado antes de uma troca de mês que devia ter
    // limpo esses campos.
    const primeiroDiaMes = `${res.mes}-01`;
    const ultimoDiaMes = ultimoDiaDoMesISO(res.mes);
    const dataInicio = uiState.escalaMensalDataInicio && uiState.escalaMensalDataInicio>=primeiroDiaMes && uiState.escalaMensalDataInicio<=ultimoDiaMes
      ? uiState.escalaMensalDataInicio : primeiroDiaMes;
    const dataFim = uiState.escalaMensalDataFim && uiState.escalaMensalDataFim>=primeiroDiaMes && uiState.escalaMensalDataFim<=ultimoDiaMes
      ? uiState.escalaMensalDataFim : ultimoDiaMes;
    if(dataInicio > dataFim){ alert('A data de início da vigência não pode ser depois da data de fim.'); return; }
    const linhas = res.linhas.filter(l=>l.analistaId);
    let ok=0, fail=0;
    openProgressModal('Publicando escala do mês...');
    for(const [idx, l] of linhas.entries()){
      const entrada = {analistaId:l.analistaId, operacao:l.operacao, ciclo:l.ciclo,
        horaInicio:l.horaInicio, horaFim:l.horaFim, titular:userById(l.analistaId)?.name||'',
        // Dias de funcionamento do hub original (ver gerarEscalaMensal,
        // utils.js) — antes vinha sempre [] (= todos os dias), perdendo a
        // restrição de quem só roda em certos dias da semana.
        dias:l.dias||[],
        dataInicio, dataFim};
      try{ DB.baseMestra.push(await apiCreateBaseMestra(entrada)); ok++; }
      catch(e){ console.error('KronoOP: falha ao publicar escala do mês.', e); fail++; }
      updateProgressModal(idx+1, linhas.length);
    }
    closeModal();
    uiState.escalaMensalResultado = null;
    renderMain();
    alert(`${ok} operação(ões) publicada(s) com sucesso.${fail?` ${fail} falharam.`:''}`);
  });

  // Formulários (Convocações) — supervisor: criar/editar/pausar/excluir/ver
  // respostas + aprovar-recusar férias.
  const btnNovoFormulario = document.getElementById('btnNovoFormulario');
  if(btnNovoFormulario) btnNovoFormulario.addEventListener('click', ()=>{
    uiState.formulariosShowNew = !uiState.formulariosShowNew;
    uiState.formulariosEditingId = null;
    renderMain();
  });
  wireFormularioForm('newf', null);
  DB.formularios.forEach(f=>{
    if(uiState.formulariosEditingId===f.id) wireFormularioForm(`editf-${f.id}`, f);
  });
  main.querySelectorAll('.chk-formulario-ativo').forEach(chk=>{
    chk.addEventListener('change', async ()=>{
      try{
        const atualizado = await apiUpdateFormulario(chk.dataset.id, { ativoManual: chk.checked });
        DB.formularios = DB.formularios.map(x=>x.id===chk.dataset.id ? atualizado : x);
      }catch(e){ alert('Não foi possível atualizar: '+e.message); }
      renderMain();
    });
  });
  main.querySelectorAll('.btn-editar-formulario').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      uiState.formulariosEditingId = uiState.formulariosEditingId===btn.dataset.id ? null : btn.dataset.id;
      uiState.formulariosShowNew = false;
      renderMain();
    });
  });
  main.querySelectorAll('.btn-excluir-formulario').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta convocação? As respostas já enviadas também são apagadas.')) return;
      try{
        await apiDeleteFormulario(btn.dataset.id);
        DB.formularios = DB.formularios.filter(x=>x.id!==btn.dataset.id);
        DB.formularioRespostas = DB.formularioRespostas.filter(r=>r.formularioId!==btn.dataset.id);
        renderMain();
      }catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });
  main.querySelectorAll('.btn-resultados-formulario').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      uiState.formulariosExpanded[btn.dataset.id] = !uiState.formulariosExpanded[btn.dataset.id];
      renderMain();
    });
  });
  main.querySelectorAll('.btn-aprovar-ferias').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Aprovar essa solicitação de férias? Isso já lança as ausências na agenda do analista (sem suplente ainda — complete a cobertura depois).')) return;
      try{ await apiAprovarFerias(btn.dataset.id); await loadDB(); renderMain(); }
      catch(e){ alert('Não foi possível aprovar: '+e.message); }
    });
  });
  main.querySelectorAll('.btn-recusar-ferias').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const motivo = prompt('Motivo da recusa (opcional):') || '';
      try{ await apiRecusarFerias(btn.dataset.id, motivo); await loadDB(); renderMain(); }
      catch(e){ alert('Não foi possível recusar: '+e.message); }
    });
  });
  // Confirmação de cobertura (Escolha de folga) — marcar avisa o analista
  // que o suplente já foi organizado; desmarcar (corrigir engano) não
  // avisa de novo.
  main.querySelectorAll('.form-folga-confirmar-chk').forEach(chk=>{
    chk.addEventListener('change', async ()=>{
      const id = chk.dataset.id;
      const confirmado = chk.checked;
      chk.disabled = true;
      try{
        const atualizado = await apiConfirmarCoberturaResposta(id, confirmado);
        DB.formularioRespostas = DB.formularioRespostas.map(r=>r.id===id ? atualizado : r);
        renderMain();
      }catch(e){
        alert('Não foi possível salvar: '+e.message);
        chk.checked = !confirmado;
        chk.disabled = false;
      }
    });
  });

  // Alocação automática de suplentes a partir da Escolha de folga — processa
  // TODAS as respostas pendentes do formulário de uma vez (não uma resposta
  // isolada): candidatosParaSlot já respeita jornada/conflito/prioridade,
  // mas ele só enxerga quem já tem ausência CRIADA como "de folga" — outro
  // analista que também escolheu o mesmo dia nesta mesma leva ainda não tem
  // ausência nenhuma, então precisamos excluir manualmente quem está nesse
  // caso (folgantesNaData) e também reservar cada escolha tentativa
  // (tentativas) pra não sugerir a mesma pessoa duas vezes em horários que
  // batem no mesmo dia. Só cria de verdade e confirma no clique de
  // "Confirmar e organizar todos" — isso aqui só monta a prévia.
  main.querySelectorAll('[data-alocar-auto-todos]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const formularioId = btn.dataset.alocarAutoTodos;
      const respostas = DB.formularioRespostas.filter(r=>r.formularioId===formularioId);
      const pendentes = respostas.filter(r=>(r.payload.datas||[]).length>0 && !r.confirmadoPeloSupervisor)
        .sort((a,b)=>(userById(a.analistaId)?.name||'').localeCompare(userById(b.analistaId)?.name||'','pt-BR'));
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);

      const folgantesNaData = {};
      respostas.forEach(r=>{
        (r.payload.datas||[]).forEach(data=>{
          (folgantesNaData[data] = folgantesNaData[data] || new Set()).add(r.analistaId);
        });
      });

      // Descreve o que a pessoa já tem naquele dia (própria operação,
      // cobertura que já está fazendo, ou escolha desta mesma prévia) — só
      // usado no ajuste manual, pra o supervisor ver de cara que ela não
      // está livre antes de escalar por cima mesmo assim.
      function statusNaData(analistaId, dataStr, tentativasAtual){
        if((folgantesNaData[dataStr]||new Set()).has(analistaId)) return 'de folga nesse dia';
        const proprias = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, dataStr))
          .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===dataStr))
          .map(b=>`${b.operacao} ${b.horaInicio}-${b.horaFim}`);
        const coberturas = DB.ausencias.filter(x=>x.suplenteId===analistaId && x.data===dataStr)
          .map(x=>DB.baseMestra.find(b=>b.id===x.baseMestraId)).filter(Boolean)
          .map(b=>`cobrindo ${b.operacao} ${b.horaInicio}-${b.horaFim}`);
        const tentativasHoje = tentativasAtual.filter(t=>t.suplenteId===analistaId && t.data===dataStr)
          .map(t=>`cobrindo (nesta prévia) ${t.horaInicio}-${t.horaFim}`);
        const todas = [...proprias, ...coberturas, ...tentativasHoje];
        if(todas.length===0) return '';
        if(todas.length===1) return `já escalado: ${todas[0]}`;
        return `já escalado em ${todas.length} operações (${todas[0]}, ...)`;
      }

      const tentativas = [];
      const items = [];
      pendentes.forEach(resp=>{
        [...(resp.payload.datas||[])].sort().forEach(data=>{
          DB.baseMestra.filter(b=>b.analistaId===resp.analistaId && bmRodaNoDia(b, data))
            .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===data))
            .forEach(bm=>{
              const s1 = hourSortValue(bm.horaInicio), e1 = hourSortValue(bm.horaFim);
              let candidatos = candidatosParaSlot(myAnalistas, resp.analistaId, bm, data)
                .filter(c=> !(folgantesNaData[data]||new Set()).has(c.id))
                .filter(c=> !tentativas.some(t=> t.suplenteId===c.id && t.data===data && rangesOverlap(s1,e1, hourSortValue(t.horaInicio), hourSortValue(t.horaFim))));
              // Sem ninguém elegível automaticamente (jornada, conflito, vigência
              // ou folga no mesmo dia derrubaram todo mundo) — em vez de travar
              // sem opção nenhuma, oferece a equipe inteira pro supervisor
              // decidir manualmente, já que ele pode saber de uma exceção que o
              // algoritmo não enxerga. Sem sugestão pré-marcada nesse caso.
              const semSugestaoAutomatica = candidatos.length===0;
              if(semSugestaoAutomatica){
                candidatos = myAnalistas.filter(a=>a.id!==resp.analistaId)
                  .map(a=>({id:a.id, name:a.name, status: statusNaData(a.id, data, tentativas)}))
                  .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
              }
              const chosenId = semSugestaoAutomatica ? '' : (candidatos[0]?.id || '');
              if(chosenId) tentativas.push({ suplenteId: chosenId, data, horaInicio: bm.horaInicio, horaFim: bm.horaFim });
              items.push({ respostaId: resp.id, analistaId: resp.analistaId, data, bmId: bm.id, candidatos, chosenId, semSugestaoAutomatica });
            });
        });
      });
      uiState.alocarAuto = { formularioId, items };
      renderMain();
    });
  });
  main.querySelectorAll('[data-alocarauto-idx]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const idx = parseInt(sel.dataset.alocarautoIdx,10);
      uiState.alocarAuto.items[idx].chosenId = sel.value;
    });
  });
  const btnCancelarAlocacaoAuto = document.getElementById('btnCancelarAlocacaoAuto');
  if(btnCancelarAlocacaoAuto) btnCancelarAlocacaoAuto.addEventListener('click', ()=>{
    uiState.alocarAuto = null;
    renderMain();
  });
  const btnConfirmarAlocacaoAuto = document.getElementById('btnConfirmarAlocacaoAuto');
  if(btnConfirmarAlocacaoAuto) btnConfirmarAlocacaoAuto.addEventListener('click', async ()=>{
    const st = uiState.alocarAuto;
    const acionaveis = st.items.filter(it=>it.chosenId);
    const respostaIds = [...new Set(st.items.map(it=>it.respostaId))];
    const total = acionaveis.length + respostaIds.length;
    let feitos = 0;
    const progressWrap = document.getElementById('alocarAutoProgress');
    const progressFill = document.getElementById('alocarAutoProgressFill');
    const progressLabel = document.getElementById('alocarAutoProgressLabel');
    const avancarProgresso = ()=>{
      feitos++;
      if(progressFill) progressFill.style.width = `${Math.round(feitos/Math.max(1,total)*100)}%`;
      if(progressLabel) progressLabel.textContent = `${feitos}/${total}`;
    };
    if(progressWrap) progressWrap.style.display = '';
    if(progressLabel) progressLabel.textContent = `0/${total}`;
    // Loop sequencial em vez de Promise.all — dá pra ir atualizando a barra
    // item a item, e evita disparar N requisições simultâneas pro backend.
    btnConfirmarAlocacaoAuto.disabled = true;
    const btnCancelarAlocacaoAutoAtivo = document.getElementById('btnCancelarAlocacaoAuto');
    if(btnCancelarAlocacaoAutoAtivo) btnCancelarAlocacaoAutoAtivo.disabled = true;

    let count=0, fail=0;
    for(const it of acionaveis){
      const bm = DB.baseMestra.find(b=>b.id===it.bmId);
      const entrada = {analistaId:it.analistaId, baseMestraId:bm.id, operacao:bm.operacao, ciclo:bm.ciclo,
        horaInicio:bm.horaInicio, horaFim:bm.horaFim, data:it.data, tipo:'folga', suplenteId:it.chosenId};
      try{
        const novo = await apiCreateAusencia(entrada);
        DB.ausencias.push(novo);
        count++;
      }catch(e){ console.error('KronoOP: falha ao cobrir operação.', e); fail++; }
      avancarProgresso();
    }
    for(const respostaId of respostaIds){
      try{
        const atualizado = await apiConfirmarCoberturaResposta(respostaId, true);
        DB.formularioRespostas = DB.formularioRespostas.map(r=>r.id===respostaId ? atualizado : r);
      }catch(e){ console.error('KronoOP: falha ao confirmar cobertura.', e); }
      avancarProgresso();
    }
    uiState.alocarAuto = null;
    renderMain();
    alert(`${count} operação(ões) coberta(s) com sucesso.${fail?` ${fail} falharam.`:''}`);
  });

  // Formulários — analista: domingo_voluntariado/folga_escolha respondem no
  // clique do chip; reconhecimento_mensal/ferias_solicitacao juntam campos
  // antes de enviar.
  const substituirMinhaResposta = (resp) => {
    DB.formularioRespostas = [...DB.formularioRespostas.filter(r=>!(r.formularioId===resp.formularioId && r.analistaId===session.userId)), resp];
  };
  main.querySelectorAll('[data-formvol-fid]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const fid = el.dataset.formvolFid, dia = el.dataset.formvolDia;
      const atuais = minhaRespostaFormulario(fid, session.userId)?.payload?.datas || [];
      const novas = atuais.includes(dia) ? atuais.filter(d=>d!==dia) : [...atuais, dia];
      try{ substituirMinhaResposta(await apiEnviarResposta(fid, {datas: novas})); renderMain(); }
      catch(e){ alert('Não foi possível salvar: '+e.message); }
    });
  });
  // Clique na grade só mexe no rascunho local (uiState.folgaEscolhaDraft) —
  // nada vai pro servidor até o analista clicar em "Enviar". Isso evita uma
  // chamada de API por toque e deixa ele revisar a seleção inteira antes de
  // confirmar (ver botão data-formfolga-enviar logo abaixo).
  main.querySelectorAll('[data-formfolga-fid]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const fid = el.dataset.formfolgaFid, dia = el.dataset.formfolgaDia;
      const f = DB.formularios.find(x=>x.id===fid);
      const limite = f ? domingosTrabalhados(session.userId, f.periodoInicio, f.periodoFim).length : MAX_DIAS_FOLGA_ESCOLHA;
      const salvas = minhaRespostaFormulario(fid, session.userId)?.payload?.datas || [];
      const atuais = uiState.folgaEscolhaDraft[fid] !== undefined ? uiState.folgaEscolhaDraft[fid] : salvas;
      let novas;
      if(atuais.includes(dia)){
        novas = atuais.filter(d=>d!==dia);
      } else {
        if(atuais.length>=limite){ alert(`Você já escolheu o máximo de ${limite} dia(s) de folga a que tem direito nesse período.`); return; }
        novas = [...atuais, dia];
      }
      uiState.folgaEscolhaDraft[fid] = novas;
      renderMain();
    });
  });
  main.querySelectorAll('[data-formfolga-enviar]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const fid = btn.dataset.formfolgaEnviar;
      const draft = uiState.folgaEscolhaDraft[fid];
      if(draft===undefined) return;
      btn.disabled = true;
      try{
        substituirMinhaResposta(await apiEnviarResposta(fid, {datas: draft}));
        delete uiState.folgaEscolhaDraft[fid];
        renderMain();
      }catch(e){
        alert('Não foi possível salvar: '+e.message);
        btn.disabled = false;
      }
    });
  });
  main.querySelectorAll('[data-formrec-enviar]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const fid = btn.dataset.formrecEnviar;
      const indicadoId = document.getElementById(`formRecIndicado-${fid}`).value;
      const motivo = document.getElementById(`formRecMotivo-${fid}`).value.trim();
      if(!indicadoId){ alert('Selecione quem você quer indicar.'); return; }
      try{ substituirMinhaResposta(await apiEnviarResposta(fid, {indicadoId, motivo})); renderMain(); alert('Indicação enviada!'); }
      catch(e){ alert('Não foi possível enviar: '+e.message); }
    });
  });
  main.querySelectorAll('[data-formferias-enviar]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const fid = btn.dataset.formferiasEnviar;
      const inicio = document.getElementById(`formFeriasInicio-${fid}`).value;
      const fim = document.getElementById(`formFeriasFim-${fid}`).value;
      const justificativa = document.getElementById(`formFeriasJust-${fid}`).value.trim();
      if(!inicio || !fim){ alert('Informe início e fim das férias.'); return; }
      if(inicio>fim){ alert('A data final não pode ser antes da inicial.'); return; }
      try{ substituirMinhaResposta(await apiEnviarResposta(fid, {inicio, fim, justificativa})); renderMain(); alert('Solicitação enviada!'); }
      catch(e){ alert('Não foi possível enviar: '+e.message); }
    });
  });

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

        // Reunião recorrente = várias linhas independentes, uma por data
        // (sem serie_id no banco — ver comentário de mesmoConjunto em
        // utils.js). Antes de salvar, procura outras reuniões futuras que
        // batem com ESTA (mesmo tipo/título/horário/participantes/link,
        // antes da edição) pra oferecer aplicar a mudança nelas também.
        const futuras = DB.reunioes.filter(x=>
          x.id!==r.id && x.tipo===r.tipo && x.titulo===r.titulo && x.hora===r.hora &&
          (x.horaFim||'')===(r.horaFim||'') && x.supervisorId===r.supervisorId &&
          (x.link||'')===(r.link||'') && mesmoConjunto(x.analistaIds, r.analistaIds) && x.data > r.data
        ).sort((a,b)=>a.data.localeCompare(b.data));

        const salvarSomenteEsta = async ()=>{
          try{
            const atualizado = await apiUpdateReuniao(r.id, patch);
            DB.reunioes = DB.reunioes.map(x=>x.id===r.id ? atualizado : x);
            closeModal(); renderMain();
          }catch(e){ alert('Não foi possível salvar: '+e.message); }
        };

        if(futuras.length===0){ await salvarSomenteEsta(); return; }

        // patchSerie repete tipo/título/horário/participantes/link em cada
        // ocorrência futura, mas SEM a data — cada uma mantém a sua própria.
        const { data: _data, ...patchSerie } = patch;
        openModal(`<h3>Editar reunião</h3>
          <p style="margin-top:0;">Essa reunião faz parte de uma série — encontrei mais <strong>${futuras.length}</strong> no futuro com o mesmo horário e participantes. Aplicar essa alteração a:</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin:16px 0;">
            <button class="btn" id="btnEditarSomenteEsta">Somente esta reunião</button>
            <button class="btn btn-brand" id="btnEditarEstaEFuturas">Esta e as ${futuras.length} futuras</button>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button class="btn" data-modal-cancel>Cancelar</button>
          </div>`);
        document.querySelector('[data-modal-cancel]').onclick = closeModal;
        document.getElementById('btnEditarSomenteEsta').onclick = salvarSomenteEsta;
        document.getElementById('btnEditarEstaEFuturas').onclick = async ()=>{
          openProgressModal('Atualizando série de reuniões...');
          let done=0, fail=0;
          const total = 1 + futuras.length;
          try{
            const atualizado = await apiUpdateReuniao(r.id, patch);
            DB.reunioes = DB.reunioes.map(x=>x.id===r.id ? atualizado : x);
          }catch(e){ fail++; }
          done++; updateProgressModal(done, total);
          for(const f of futuras){
            try{
              const atualizado = await apiUpdateReuniao(f.id, patchSerie);
              DB.reunioes = DB.reunioes.map(x=>x.id===f.id ? atualizado : x);
            }catch(e){ fail++; }
            done++; updateProgressModal(done, total);
          }
          closeModal(); renderMain();
          if(fail) alert(`${total-fail} reunião(ões) atualizada(s). ${fail} falharam.`);
        };
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
      <div class="field"><label>Regional (opcional)</label><input id="fSprRegional" list="regionalList" placeholder="ex: Sudeste"></div>
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
      const regional = document.getElementById('fSprRegional').value.trim() || null;
      if(!operacao || !ciclo || spr===''){ alert('Preencha operação, ciclo e SPR.'); return; }
      const entrada = {supervisorId:session.userId, operacao, ciclo, spr: Number(spr), regional};
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
        <div class="field"><label>Regional (opcional)</label><input id="fEditSprRegional" list="regionalList" value="${escapeHtml(s.regional||'')}"></div>
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
        const regional = document.getElementById('fEditSprRegional').value.trim() || null;
        if(!operacao || !ciclo || spr===''){ alert('Preencha operação, ciclo e SPR.'); return; }
        const patch = {operacao, ciclo, spr: Number(spr), regional};
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

  // Links SeaTalk (Cadastros > SPR > aba "Links SeaTalk", render-supervisor.js)
  const btnNovoLinkSeatalk = document.getElementById('btnNovoLinkSeatalk');
  if(btnNovoLinkSeatalk) btnNovoLinkSeatalk.addEventListener('click', ()=>{
    openModal(`<h3>Novo link SeaTalk</h3>
      <div class="field"><label>Operação</label><input id="fLinkOp" list="linkSeatalkOpList" placeholder="ex: LM Hub_SP_Atibaia_Ponte_Alta"></div>
      <div class="field"><label>Link do grupo</label><input id="fLinkUrl" placeholder="https://..."></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="confirmNovoLinkSeatalk">Salvar</button>
      </div>`);
    const cancelBtn = document.querySelector('[data-modal-cancel]');
    if(cancelBtn) cancelBtn.onclick = closeModal;
    document.getElementById('confirmNovoLinkSeatalk').onclick = async ()=>{
      const operacao = document.getElementById('fLinkOp').value.trim();
      const link = document.getElementById('fLinkUrl').value.trim();
      if(!operacao || !link){ alert('Preencha operação e link.'); return; }
      try{
        const novo = await apiCreateOperacaoLink({operacao, link});
        DB.operacaoLinks.push(novo);
        closeModal(); renderMain();
      }catch(e){ alert('Não foi possível salvar: '+e.message); }
    };
  });
  main.querySelectorAll('[data-editar-link-seatalk]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const l = DB.operacaoLinks.find(x=>x.id===btn.dataset.editarLinkSeatalk);
      if(!l) return;
      openModal(`<h3>Editar link SeaTalk</h3>
        <div class="field"><label>Operação</label><input id="fEditLinkOp" list="linkSeatalkOpList" value="${escapeHtml(l.operacao)}"></div>
        <div class="field"><label>Link do grupo</label><input id="fEditLinkUrl" value="${escapeHtml(l.link)}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditarLinkSeatalk">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      document.getElementById('confirmEditarLinkSeatalk').onclick = async ()=>{
        const operacao = document.getElementById('fEditLinkOp').value.trim();
        const link = document.getElementById('fEditLinkUrl').value.trim();
        if(!operacao || !link){ alert('Preencha operação e link.'); return; }
        try{
          const atualizado = await apiUpdateOperacaoLink(l.id, {operacao, link});
          DB.operacaoLinks = DB.operacaoLinks.map(x=>x.id===l.id ? atualizado : x);
          closeModal(); renderMain();
        }catch(e){ alert('Não foi possível salvar: '+e.message); }
      };
    });
  });
  main.querySelectorAll('[data-excluir-link-seatalk]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este link do SeaTalk?')) return;
      const id = btn.dataset.excluirLinkSeatalk;
      try{ await apiDeleteOperacaoLink(id); DB.operacaoLinks = DB.operacaoLinks.filter(x=>x.id!==id); renderMain(); }
      catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });

  const btnExportarSpr = document.getElementById('btnExportarSpr');
  if(btnExportarSpr) btnExportarSpr.addEventListener('click', ()=>{
    const linhas = sprCadastroExportRows.map(s=>[s.operacao, s.ciclo, s.spr, s.regional||'']);
    exportarRelatorioExcel(`spr_atual_${todayISO()}.xlsx`, ['operacao','ciclo','spr','regional'], linhas);
  });
  const btnBaixarModeloSpr = document.getElementById('btnBaixarModeloSpr');
  if(btnBaixarModeloSpr) btnBaixarModeloSpr.addEventListener('click', ()=>{
    downloadXLSX('modelo_spr.xlsx', ['operacao','ciclo','spr','regional'], ['LM Hub_SP_Atibaia_Ponte_Alta','T3','92','Sudeste']);
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
      const regional = (r.regional||'').trim() || null;
      if(!operacao || !ciclo || r.spr===''||r.spr===undefined){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      // Reimportar a mesma planilha (SPR/Regional atualizados) atualiza a
      // entrada já existente pra essa Operação+Ciclo, em vez de duplicar
      // linha — mesmo se a coluna "regional" vier vazia nessa linha, o
      // valor manda (null apaga o que já tinha, não ignora silenciosamente).
      const existente = DB.sprs.find(s=>s.supervisorId===session.userId && s.operacao===operacao && s.ciclo===ciclo);
      try{
        if(existente){
          const atualizado = await apiUpdateSpr(existente.id, {spr: Number(r.spr), regional});
          DB.sprs = DB.sprs.map(x=>x.id===existente.id ? atualizado : x);
        } else {
          const novo = await apiCreateSpr({supervisorId:session.userId, operacao, ciclo, spr: Number(r.spr), regional});
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

  // Carga em massa de Links SeaTalk (Cadastros > Links SeaTalk) — mesmo
  // padrão do SPR acima: reimportar operação já cadastrada atualiza o
  // link (não duplica).
  const btnExportarLinkSeatalk = document.getElementById('btnExportarLinkSeatalk');
  if(btnExportarLinkSeatalk) btnExportarLinkSeatalk.addEventListener('click', ()=>{
    const linhas = linksSeatalkExportRows.map(l=>[l.operacao, l.link]);
    exportarRelatorioExcel(`links_seatalk_${todayISO()}.xlsx`, ['operacao','link'], linhas);
  });
  const btnBaixarModeloLinkSeatalk = document.getElementById('btnBaixarModeloLinkSeatalk');
  if(btnBaixarModeloLinkSeatalk) btnBaixarModeloLinkSeatalk.addEventListener('click', ()=>{
    downloadXLSX('modelo_links_seatalk.xlsx', ['operacao','link'], ['LM Hub_SP_Atibaia_Ponte_Alta','https://web.seatalk.io/group/12345']);
  });
  const fileImportLinkSeatalk = document.getElementById('fileImportLinkSeatalk');
  if(fileImportLinkSeatalk) fileImportLinkSeatalk.addEventListener('change', async ()=>{
    const file = fileImportLinkSeatalk.files[0]; if(!file) return;
    let rows;
    try { rows = await parseXLSX(file); }
    catch(e){ fileImportLinkSeatalk.value=''; alert('Não foi possível ler o arquivo Excel: '+e.message); return; }
    let ok=0, fail=0;
    openProgressModal('Importando links...');
    for(const [idx, r] of rows.entries()){
      const operacao = (r.operacao||'').trim();
      const link = (r.link||'').trim();
      if(!operacao || !link){ fail++; updateProgressModal(idx+1, rows.length); continue; }
      const existente = DB.operacaoLinks.find(l=>l.operacao===operacao);
      try{
        if(existente){
          const atualizado = await apiUpdateOperacaoLink(existente.id, {link});
          DB.operacaoLinks = DB.operacaoLinks.map(x=>x.id===existente.id ? atualizado : x);
        } else {
          const novo = await apiCreateOperacaoLink({operacao, link});
          DB.operacaoLinks.push(novo);
        }
        ok++;
      }catch(e){ console.error('Falha ao importar link SeaTalk', r, e); fail++; }
      updateProgressModal(idx+1, rows.length);
    }
    closeModal();
    fileImportLinkSeatalk.value='';
    renderMain();
    alert(`Importação concluída: ${ok} link(s) salvo(s)${fail?`, ${fail} linha(s) ignorada(s) (campos obrigatórios ausentes)`:''}.`);
  });

  const btnExportarMestra = document.getElementById('btnExportarMestra');
  if(btnExportarMestra) btnExportarMestra.addEventListener('click', ()=>{
    const linhas = baseMestraExportRows.map(b=>[b.titular, b.operacao, b.ciclo, b.horaInicio, b.horaFim, (b.dias||[]).join(','), b.dataInicio, b.dataFim]);
    exportarRelatorioExcel(`operacoes_fixas_vigentes_${todayISO()}.xlsx`, ['analista','operacao','ciclo','hora_inicio','hora_fim','dias','data_inicio','data_fim'], linhas);
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
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);
      openModal(`<h3>Editar operação fixa</h3>
        <div class="field"><label>Analista (titular)</label><select id="fEditAnalista">${myAnalistas.map(a=>`<option value="${a.id}" ${a.id===b.analistaId?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></div>
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
      const analistaSelect = document.getElementById('fEditAnalista');
      // Registros órfãos (analistaId nulo, titular só em texto — ver
      // base_mestra.analista_id no schema) não têm uma opção correspondente
      // no <select>, então ele cai no primeiro item por padrão. Só manda
      // analistaId/titular na hora de salvar se a pessoa REALMENTE mexeu no
      // campo — senão um "Salvar" sem tocar nesse dropdown reatribuiria a
      // operação pra quem calhou de ser a primeira da lista.
      const analistaOriginal = analistaSelect.value;
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
        if(analistaSelect.value !== analistaOriginal){
          patch.analistaId = analistaSelect.value;
          patch.titular = userById(analistaSelect.value)?.name || '';
        }
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

  // Cobertura (tela do supervisor) mistura dois tipos de registro na mesma
  // tabela — suplência avulsa (tabela própria) e ausência (folga/férias
  // ligada a uma operação fixa, criada por ex. no "Sugerir Suplente") —
  // por isso os botões carregam data-cobertura-tipo pra saber qual dos dois
  // editar/excluir.
  main.querySelectorAll('[data-excluir-cobertura]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tipo = btn.dataset.coberturaTipo;
      const id = btn.dataset.excluirCobertura;
      if(!confirm(tipo==='ausencia' ? 'Excluir esta folga/férias?' : 'Excluir esta cobertura avulsa?')) return;
      try{
        if(tipo==='ausencia'){ await apiDeleteAusencia(id); }
        else{ await apiDeleteSuplencia(id); }
      }catch(e){
        // 404 = já não existe no banco (outra aba/sessão já excluiu, ou o
        // DB local ficou com uma linha fantasma de antes de um refresh) —
        // trata como sucesso: o resultado que a pessoa queria (a linha
        // sumir) já é verdade, não faz sentido travar nisso com um alerta.
        if(e.status !== 404){ alert('Não foi possível excluir: '+e.message); return; }
      }
      DB.ausencias = DB.ausencias.filter(x=>x.id!==id);
      DB.suplencias = DB.suplencias.filter(x=>x.id!==id);
      renderMain();
    });
  });

  main.querySelectorAll('[data-editar-cobertura]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tipo = btn.dataset.coberturaTipo;
      const id = btn.dataset.editarCobertura;
      const myAnalistas = DB.users.filter(u=>u.role==='analista' && u.supervisorId===session.userId);

      if(tipo==='ausencia'){
        const a = DB.ausencias.find(x=>x.id===id);
        if(!a) return;
        // "Folgando" é o titular fixo (analistaId) — trocar isso é trocar a
        // baseMestra inteira (o titular E a operação fixa dele juntos, não
        // só o nome), então o segundo select sempre lista as operações
        // fixas do analista escolhido que rodam na data escolhida (mesma
        // regra de bmRodaNoDia usada na Programação/Grade).
        const opcoesOperacao = (analistaId, dataStr, selecionadoId)=>{
          const opcoes = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, dataStr));
          if(opcoes.length===0) return '<option value="">Nenhuma operação fixa nesse dia</option>';
          return opcoes.map(b=>`<option value="${b.id}" ${b.id===selecionadoId?'selected':''}>${escapeHtml(b.operacao)} (${escapeHtml(b.ciclo)}) ${b.horaInicio}–${b.horaFim}</option>`).join('');
        };
        openModal(`<h3>Editar folga/férias</h3>
          <div class="grid-2">
            <div class="field"><label>Folgando (titular)</label><select id="fEditAusAnalista">
              ${myAnalistas.map(u=>`<option value="${u.id}" ${u.id===a.analistaId?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}
            </select></div>
            <div class="field"><label>Operação</label><select id="fEditAusOperacao">${opcoesOperacao(a.analistaId, a.data, a.baseMestraId)}</select></div>
          </div>
          <div class="field"><label>Tipo</label><select id="fEditAusTipo">
            <option value="folga" ${a.tipo==='folga'?'selected':''}>Folga</option>
            <option value="ferias" ${a.tipo==='ferias'?'selected':''}>Férias</option>
          </select></div>
          <div class="field"><label>Suplente</label><select id="fEditAusSup">
            <option value="">Ninguém</option>
            ${myAnalistas.map(u=>`<option value="${u.id}" ${a.suplenteId===u.id?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Data</label><input type="date" id="fEditAusData" value="${a.data}"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn" data-modal-cancel>Cancelar</button>
            <button class="btn btn-brand" id="confirmEditarAusencia">Salvar</button>
          </div>`);
        const cancelBtn = document.querySelector('[data-modal-cancel]');
        if(cancelBtn) cancelBtn.onclick = closeModal;
        const analistaEl = document.getElementById('fEditAusAnalista');
        const operacaoEl = document.getElementById('fEditAusOperacao');
        const dataEl = document.getElementById('fEditAusData');
        // Trocar o analista OU a data muda quais operações fixas valem —
        // reconstrói o select de operação nos dois casos.
        const atualizarOperacoes = ()=>{ operacaoEl.innerHTML = opcoesOperacao(analistaEl.value, dataEl.value, null); };
        analistaEl.addEventListener('change', atualizarOperacoes);
        dataEl.addEventListener('change', atualizarOperacoes);
        document.getElementById('confirmEditarAusencia').onclick = async ()=>{
          const bm = DB.baseMestra.find(x=>x.id===operacaoEl.value);
          if(!bm){ alert('Selecione uma operação válida.'); return; }
          const suplenteId = document.getElementById('fEditAusSup').value || null;
          const patch = {
            analistaId: analistaEl.value,
            baseMestraId: bm.id,
            operacao: bm.operacao,
            ciclo: bm.ciclo,
            horaInicio: bm.horaInicio,
            horaFim: bm.horaFim,
            tipo: document.getElementById('fEditAusTipo').value,
            suplenteId,
            suplenteNome: suplenteId ? (userById(suplenteId)?.name || '') : '',
            data: dataEl.value,
          };
          try{
            const atualizado = await apiUpdateAusencia(a.id, patch);
            DB.ausencias = DB.ausencias.map(x=>x.id===a.id ? atualizado : x);
            closeModal(); renderMain();
          }catch(e){ alert('Não foi possível salvar: '+e.message); }
        };
        return;
      }

      const s = DB.suplencias.find(x=>x.id===id);
      if(!s) return;
      openModal(`<h3>Editar cobertura avulsa</h3>
        <div class="help-text">Cobrindo: ${userById(s.analistaOriginalId)?.name||'—'}</div>
        <div class="field"><label>Tipo</label><select id="fEditSupTipo">
          <option value="folga" ${(s.tipo||'folga')==='folga'?'selected':''}>Folga</option>
          <option value="ferias" ${s.tipo==='ferias'?'selected':''}>Férias</option>
        </select></div>
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
          tipo: document.getElementById('fEditSupTipo').value,
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

  main.querySelectorAll('[data-basemestrafiltro]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.basemestrafiltro;
      uiState.baseMestraFiltro[key] = inp.value;
      if((key==='vigenciaInicio'||key==='vigenciaFim') && uiState.baseMestraFiltro.vigenciaInicio && uiState.baseMestraFiltro.vigenciaFim && uiState.baseMestraFiltro.vigenciaInicio > uiState.baseMestraFiltro.vigenciaFim){
        uiState.baseMestraFiltro[key==='vigenciaInicio'?'vigenciaFim':'vigenciaInicio'] = inp.value;
      }
      renderMain();
    });
  });
  const btnExportParticularidades = document.getElementById('btnExportParticularidades');
  if(btnExportParticularidades) btnExportParticularidades.addEventListener('click', ()=>{
    exportarRelatorioExcel('particularidades-auditoria.xlsx', ['Operação','Titular','Conteúdo','Atualizado por','Atualizado em'], particularidadesAuditoriaExportRows);
  });

  const btnExcluirTodasCoberturas = document.getElementById('btnExcluirTodasCoberturas');
  if(btnExcluirTodasCoberturas) btnExcluirTodasCoberturas.addEventListener('click', async ()=>{
    const alvos = Array.from(main.querySelectorAll('[data-excluir-cobertura]')).map(b=>({id:b.dataset.excluirCobertura, tipo:b.dataset.coberturaTipo}));
    if(alvos.length===0) return;
    if(!confirm(`Excluir ${alvos.length} cobertura(s)/folga(s) (conforme o filtro atual)? Essa ação não pode ser desfeita.`)) return;
    let ok=0, fail=0;
    openProgressModal('Excluindo coberturas...');
    for(const [idx, alvo] of alvos.entries()){
      try{
        if(alvo.tipo==='ausencia'){ await apiDeleteAusencia(alvo.id); } else { await apiDeleteSuplencia(alvo.id); }
        ok++;
      }catch(e){
        // 404 = já não existia (mesma lógica do excluir individual, acima)
        // — conta como sucesso, não como falha.
        if(e.status===404) ok++; else fail++;
      }
      DB.ausencias = DB.ausencias.filter(x=>x.id!==alvo.id);
      DB.suplencias = DB.suplencias.filter(x=>x.id!==alvo.id);
      updateProgressModal(idx+1, alvos.length);
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
        <div class="field">
          <label>Mensagem</label>
          <div class="rte-toolbar">
            <button type="button" class="rte-btn" data-rte-cmd="bold" title="Negrito"><b>B</b></button>
            <button type="button" class="rte-btn" data-rte-cmd="italic" title="Itálico"><i>I</i></button>
            <button type="button" class="rte-btn" data-rte-cmd="underline" title="Sublinhado"><u>S</u></button>
            <span class="rte-sep"></span>
            <button type="button" class="rte-btn" data-rte-cmd="justifyLeft" title="Alinhar à esquerda">≡«</button>
            <button type="button" class="rte-btn" data-rte-cmd="justifyCenter" title="Centralizar">≡</button>
            <button type="button" class="rte-btn" data-rte-cmd="justifyRight" title="Alinhar à direita">»≡</button>
          </div>
          <div id="fEditRecado" class="rte-editable" contenteditable="true" style="min-height:110px;">${r.texto}</div>
        </div>
        <div class="field"><label>Observações</label><textarea id="fEditRecadoObs" rows="2" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;">${escapeHtml(r.observacoes||'')}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" data-modal-cancel>Cancelar</button>
          <button class="btn btn-brand" id="confirmEditRecado">Salvar</button>
        </div>`);
      const cancelBtn = document.querySelector('[data-modal-cancel]');
      if(cancelBtn) cancelBtn.onclick = closeModal;
      const editorRecado = document.getElementById('fEditRecado');
      document.querySelectorAll('.rte-btn').forEach(rteBtn=>{
        rteBtn.addEventListener('mousedown', e=>{
          e.preventDefault();
          document.execCommand(rteBtn.dataset.rteCmd, false, null);
          editorRecado.focus();
        });
      });
      editorRecado.addEventListener('paste', e=>{
        e.preventDefault();
        const cd = e.clipboardData || window.clipboardData;
        const html = cd.getData('text/html');
        const limpo = html ? limparHtmlColado(html) : escapeHtml(cd.getData('text/plain')).replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, limpo);
        linkify(editorRecado);
      });
      document.getElementById('confirmEditRecado').onclick = async ()=>{
        if(!editorRecado.textContent.trim()) return;
        linkify(editorRecado);
        const patch = {
          texto: editorRecado.innerHTML,
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

  // "Novo comunicado" (Caixa de Envio) ganhou o mesmo editor rico da
  // Particularidade (negrito/itálico/sublinhado/alinhamento) — mesmo padrão
  // de wiring (mousedown+preventDefault pra não perder a seleção, paste
  // limpando HTML colado de fora). Escopado a `main` (não a `document`)
  // porque, ao contrário da Particularidade, esse editor vive na tela em
  // vez de um modal.
  const transmEditor = document.getElementById('transmMsg');
  if(transmEditor){
    main.querySelectorAll('.rte-toolbar .rte-btn').forEach(rteBtn=>{
      rteBtn.addEventListener('mousedown', e=>{
        e.preventDefault();
        document.execCommand(rteBtn.dataset.rteCmd, false, null);
        transmEditor.focus();
      });
    });
    transmEditor.addEventListener('paste', e=>{
      e.preventDefault();
      const cd = e.clipboardData || window.clipboardData;
      const html = cd.getData('text/html');
      const limpo = html ? limparHtmlColado(html) : escapeHtml(cd.getData('text/plain')).replace(/\n/g, '<br>');
      document.execCommand('insertHTML', false, limpo);
      linkify(transmEditor);
    });
  }

  const btnEnviarRecado = document.getElementById('btnEnviarRecado');
  if(btnEnviarRecado) btnEnviarRecado.addEventListener('click', async ()=>{
    if(!transmEditor.textContent.trim()) return;
    linkify(transmEditor);
    const txt = transmEditor.innerHTML;
    const titulo = document.getElementById('transmTitulo').value.trim();
    const obs = document.getElementById('transmObs').value.trim();
    const entrada = {from:`${session.name} (Supervisor)`, to:'all_ana_'+session.userId, titulo, texto:txt, observacoes: obs};
    btnEnviarRecado.disabled = true;
    try{
      const novo = await apiCreateRecado(entrada);
      DB.recados.push(novo);
      renderMain();
    }catch(e){ alert('Não foi possível enviar: '+e.message); btnEnviarRecado.disabled = false; }
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

  // Excluir só funciona pra cadastro sem histórico nenhum (banco recusa por
  // FK — ver deleteUser, backend). Pra analista com Raio-X/cronômetro/
  // notificações já registrados, o caminho é desativar: some da equipe
  // ativa sem apagar nada do que já aconteceu.
  main.querySelectorAll('[data-toggle-ativo]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const u = userById(btn.dataset.toggleAtivo);
      if(!u) return;
      const novoAtivo = !u.active;
      if(!confirm(`${novoAtivo?'Ativar':'Desativar'} ${u.name}?`)) return;
      try{
        const atualizado = await apiUpdateUser(u.id, { active: novoAtivo });
        DB.users = DB.users.map(x=>x.id===u.id ? atualizado : x);
        renderMain();
      }catch(e){ alert('Não foi possível atualizar: '+e.message); }
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

  // Trava a seleção em MAX_DELEGADOS_PROGRAMACAO (5) direto no clique — mais
  // simples que só validar no Salvar, e o contador "X/5" no label já reflete
  // em tempo real sem precisar re-renderizar a tela toda.
  const delegadosChks = main.querySelectorAll('.cfg-delegado-chk');
  if(delegadosChks.length){
    const countEl = document.getElementById('cfgDelegadosCount');
    delegadosChks.forEach(chk=>{
      chk.addEventListener('change', ()=>{
        const marcados = main.querySelectorAll('.cfg-delegado-chk:checked');
        if(marcados.length>MAX_DELEGADOS_PROGRAMACAO){
          chk.checked = false;
          alert(`Máximo de ${MAX_DELEGADOS_PROGRAMACAO} analistas.`);
          return;
        }
        if(countEl) countEl.textContent = marcados.length;
      });
    });
  }
  const cfgSalvarDelegacao = document.getElementById('cfgSalvarDelegacao');
  if(cfgSalvarDelegacao) cfgSalvarDelegacao.addEventListener('click', async ()=>{
    const ids = Array.from(main.querySelectorAll('.cfg-delegado-chk:checked')).map(c=>c.value);
    cfgSalvarDelegacao.disabled = true;
    try{
      const atualizado = await apiUpdateUser(session.userId, { delegadosProgramacaoIds: ids });
      DB.users = DB.users.map(x=>x.id===session.userId ? atualizado : x);
      renderMain();
    }catch(e){
      alert('Não foi possível atualizar: '+e.message);
      cfgSalvarDelegacao.disabled = false;
    }
  });

  // Quiz ao vivo (render-quiz.js) — mesma tela pros 3 papéis. _quizLista=null
  // força recarregar a lista da próxima vez que uiState.quizView voltar a
  // 'lista' (ver quizListaHtml).
  const btnQuizNovo = document.getElementById('btnQuizNovo');
  if(btnQuizNovo) btnQuizNovo.addEventListener('click', ()=>{
    uiState.quizDraft = null;
    uiState.quizView = 'criar';
    renderMain();
  });
  const btnQuizCancelarNovo = document.getElementById('btnQuizCancelarNovo');
  if(btnQuizCancelarNovo) btnQuizCancelarNovo.addEventListener('click', ()=>{
    uiState.quizDraft = null;
    uiState.quizView = 'lista';
    renderMain();
  });
  const btnQuizAddPergunta = document.getElementById('btnQuizAddPergunta');
  if(btnQuizAddPergunta) btnQuizAddPergunta.addEventListener('click', ()=>{
    quizScrapeDraftFromDom();
    uiState.quizDraft.perguntas.push(quizPerguntaVazia());
    renderMain();
  });
  main.querySelectorAll('.btn-quiz-remove-pergunta').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      quizScrapeDraftFromDom();
      uiState.quizDraft.perguntas.splice(Number(btn.dataset.idx), 1);
      renderMain();
    });
  });
  const btnQuizSalvarNovo = document.getElementById('btnQuizSalvarNovo');
  if(btnQuizSalvarNovo) btnQuizSalvarNovo.addEventListener('click', async ()=>{
    quizScrapeDraftFromDom();
    const erroEl = document.getElementById('quizNovoErro');
    if(erroEl) erroEl.style.display = 'none';
    btnQuizSalvarNovo.disabled = true;
    const editingId = uiState.quizDraft.editingId;
    try{
      if(editingId){
        // Editar (só quiz em 'lobby', ver btn-quiz-editar abaixo) — mesmo
        // id/PIN, volta pra lista em vez de ir pra apresentação: a pessoa
        // pode ter mais de um ajuste pra fazer antes de apresentar de
        // verdade.
        await apiUpdateQuizConteudo(editingId, uiState.quizDraft);
        uiState.quizDraft = null;
        _quizLista = null;
        uiState.quizView = 'lista';
      } else {
        const criado = await apiCreateQuiz(uiState.quizDraft);
        uiState.quizDraft = null;
        _quizLista = null;
        uiState.quizView = 'apresentar';
        uiState.quizApresentandoId = criado.id;
        uiState.quizApresentarDados = null;
      }
      renderMain();
    }catch(e){
      btnQuizSalvarNovo.disabled = false;
      if(erroEl){ erroEl.textContent = e.message; erroEl.style.display = 'block'; }
    }
  });
  main.querySelectorAll('.btn-quiz-apresentar').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      uiState.quizView = 'apresentar';
      uiState.quizApresentandoId = btn.dataset.id;
      uiState.quizApresentarDados = null;
      renderMain();
    });
  });
  main.querySelectorAll('.btn-quiz-editar').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        // Só quiz em 'lobby' (o botão nem aparece pros outros status, ver
        // quizCardHtml) — edita no MESMO id/PIN (editingId), diferente de
        // "Reaproveitar perguntas" (sempre cria um quiz novo).
        const dados = await apiGetQuiz(btn.dataset.id);
        uiState.quizDraft = {
          editingId: dados.id,
          titulo: dados.titulo,
          perguntas: dados.perguntas.map(p=>({ enunciado:p.enunciado, opcoes:[...p.opcoes], corretaIndex:p.corretaIndex, tempoSegundos:p.tempoSegundos })),
        };
        uiState.quizView = 'criar';
        renderMain();
      }catch(e){ alert('Não foi possível carregar as perguntas: '+e.message); }
      finally{ btn.disabled = false; }
    });
  });
  main.querySelectorAll('.btn-quiz-reaproveitar').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        // Reaproveita a tela de Criar já preenchida — salvar daqui gera um
        // quiz NOVO (PIN novo, ranking zerado), o antigo continua intacto
        // e consultável em "Ver ranking". Dá pra editar tudo antes de salvar.
        const dados = await apiGetQuiz(btn.dataset.id);
        uiState.quizDraft = {
          titulo: dados.titulo,
          perguntas: dados.perguntas.map(p=>({ enunciado:p.enunciado, opcoes:[...p.opcoes], corretaIndex:p.corretaIndex, tempoSegundos:p.tempoSegundos })),
        };
        uiState.quizView = 'criar';
        renderMain();
      }catch(e){ alert('Não foi possível carregar as perguntas: '+e.message); }
      finally{ btn.disabled = false; }
    });
  });
  main.querySelectorAll('.btn-quiz-ranking').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        const dados = await apiGetQuiz(btn.dataset.id);
        openModal(quizRankingModalHtml(dados));
        document.querySelector('[data-modal-cancel]').onclick = closeModal;
      }catch(e){ alert('Não foi possível carregar o ranking: '+e.message); }
      finally{ btn.disabled = false; }
    });
  });
  main.querySelectorAll('.btn-quiz-excluir').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('Excluir este quiz? Essa ação não pode ser desfeita.')) return;
      try{
        await apiDeleteQuiz(btn.dataset.id);
        _quizLista = null;
        renderMain();
      }catch(e){ alert('Não foi possível excluir: '+e.message); }
    });
  });
  const btnQuizSairApresentacao = document.getElementById('btnQuizSairApresentacao');
  if(btnQuizSairApresentacao) btnQuizSairApresentacao.addEventListener('click', ()=>{
    uiState.quizView = 'lista';
    uiState.quizApresentandoId = null;
    uiState.quizApresentarDados = null;
    _quizLista = null;
    renderMain();
  });
  const btnQuizAvancar = document.getElementById('btnQuizAvancar');
  if(btnQuizAvancar) btnQuizAvancar.addEventListener('click', async ()=>{
    btnQuizAvancar.disabled = true;
    try{
      uiState.quizApresentarDados = await apiAvancarQuiz(uiState.quizApresentandoId);
      renderMain();
    }catch(e){
      alert('Não foi possível avançar: '+e.message);
      btnQuizAvancar.disabled = false;
    }
  });
}
