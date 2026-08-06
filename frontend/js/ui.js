/* Login, navegação, modal e o roteador principal de telas (renderMain). */

// --- Login real (Firebase Auth) ---------------------------------------

function showLoginErrorReal(msg){
  const el = document.getElementById('loginErrorReal');
  el.textContent = msg;
  el.style.display = 'block';
}

// Bloqueio por tentativas erradas — guardado no localStorage (por e-mail
// digitado, não por conta real) pra sobreviver a um F5. É uma trava de UX,
// não a defesa de verdade contra força bruta: quem já protege isso é o
// próprio Firebase Auth (auth/too-many-requests, aplicado no servidor,
// imune a limpar o localStorage). Reseta sozinho depois do cooldown, ou na
// hora que o login der certo.
const LOGIN_LOCK_THRESHOLD = 3;
const LOGIN_LOCK_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos
const LOGIN_MSG_BLOQUEADO = 'Muitas tentativas com senha incorreta. Por segurança, o acesso foi bloqueado temporariamente. Analistas: entre em contato com seu Supervisor. Supervisores: entre em contato com seu Coordenador. Coordenadores: entre em contato com o administrador do sistema.';
// Só conta como "tentativa errada" erro de credencial de verdade — não
// conta erro de rede, e-mail mal formatado ou conta desativada.
const LOGIN_CODIGOS_CREDENCIAL_INVALIDA = new Set(['auth/wrong-password','auth/user-not-found','auth/invalid-credential']);

function getLoginFails(){
  try{ return JSON.parse(localStorage.getItem('kronoop-login-fails') || '{}'); }catch(e){ return {}; }
}
function setLoginFails(fails){
  try{ localStorage.setItem('kronoop-login-fails', JSON.stringify(fails)); }catch(e){}
}
function limparFalhaLogin(email){
  const fails = getLoginFails();
  delete fails[email.trim().toLowerCase()];
  setLoginFails(fails);
}
function registrarFalhaLogin(email){
  const fails = getLoginFails();
  const key = email.trim().toLowerCase();
  const atual = fails[key];
  const now = Date.now();
  fails[key] = (atual && (now - atual.lastFail) < LOGIN_LOCK_COOLDOWN_MS)
    ? { count: atual.count + 1, lastFail: now }
    : { count: 1, lastFail: now };
  setLoginFails(fails);
  return fails[key];
}
// true se esse e-mail já bateu o limite e o cooldown ainda não passou —
// já aproveita pra limpar o registro sozinho quando o cooldown expirou.
function loginBloqueado(email){
  const fails = getLoginFails();
  const key = email.trim().toLowerCase();
  const atual = fails[key];
  if(!atual || atual.count < LOGIN_LOCK_THRESHOLD) return false;
  if(Date.now() - atual.lastFail >= LOGIN_LOCK_COOLDOWN_MS){ limparFalhaLogin(email); return false; }
  return true;
}

// Chamada uma única vez no bootstrap (main.js). O listener do Supabase Auth
// dispara tanto no login manual quanto na retomada de uma sessão já
// persistida (F5) — os dois casos convergem aqui.
const REMEMBER_EMAIL_KEY = 'kronoop-remember-email';
function initLogin(){
  document.getElementById('loginBtnReal').addEventListener('click', doRealLogin);
  document.getElementById('loginPassReal').addEventListener('keydown', e=>{ if(e.key==='Enter') doRealLogin(); });

  // "Lembrar meu e-mail" — só o e-mail (nunca a senha: guardar senha em
  // texto puro no navegador é risco de segurança real, ao contrário do
  // gerenciador de senha nativo do navegador, que já funciona sozinho
  // graças ao autocomplete="current-password" no campo de senha).
  const emailEl = document.getElementById('loginEmail');
  const rememberEl = document.getElementById('loginRemember');
  try{
    const lembrado = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if(lembrado){ emailEl.value = lembrado; rememberEl.checked = true; }
  }catch(e){}
  rememberEl.addEventListener('change', ()=>{
    if(!rememberEl.checked){ try{ localStorage.removeItem(REMEMBER_EMAIL_KEY); }catch(e){} }
  });

  document.getElementById('loginForgotLink').addEventListener('click', openForgotPasswordModal);
}

function openForgotPasswordModal(){
  const emailAtual = document.getElementById('loginEmail').value.trim();
  openModal(`<h3>Esqueci minha senha</h3>
    <div class="help-text">Digite seu e-mail — a pessoa responsável por resetar sua senha (seu supervisor, coordenador ou o administrador) vai ser avisada.</div>
    <div class="field"><label>E-mail</label><input type="email" id="forgotEmail" value="${escapeHtml(emailAtual)}" placeholder="Digite seu e-mail"></div>
    <div id="forgotMsg" class="login-error"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn" data-modal-cancel>Cancelar</button>
      <button class="btn btn-brand" id="confirmForgot">Avisar responsável</button>
    </div>`);
  const cancelBtn = document.querySelector('[data-modal-cancel]');
  if(cancelBtn) cancelBtn.onclick = closeModal;
  document.getElementById('confirmForgot').onclick = async ()=>{
    const email = document.getElementById('forgotEmail').value.trim();
    const msgEl = document.getElementById('forgotMsg');
    if(!email){ setFormMsg(msgEl, 'Digite um e-mail.', true); return; }
    const btn = document.getElementById('confirmForgot');
    btn.disabled = true;
    try{
      const r = await apiEsqueciSenha(email);
      setFormMsg(msgEl, r.message || 'Se esse e-mail estiver cadastrado, a pessoa responsável foi avisada.', false);
    }catch(e){
      setFormMsg(msgEl, 'Não foi possível enviar o aviso agora. Tente de novo em instantes.', true);
    }
    btn.disabled = false;
  };
}

async function doRealLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassReal').value;
  const errEl = document.getElementById('loginErrorReal');
  errEl.style.display='none';
  if(!email || !pass){ showLoginErrorReal('Preencha e-mail e senha.'); return; }
  if(loginBloqueado(email)){ showLoginErrorReal(LOGIN_MSG_BLOQUEADO); return; }
  try{
    if(document.getElementById('loginRemember').checked) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }catch(e){}
  const btn = document.getElementById('loginBtnReal');
  btn.disabled = true;
  try{
    await KronoAuth.signIn(email, pass);
    limparFalhaLogin(email);
    // onAuthStateChanged (main.js) assume a partir daqui: carrega DB, perfil e entra no app.
  }catch(e){
    if(LOGIN_CODIGOS_CREDENCIAL_INVALIDA.has(e?.code)){
      const info = registrarFalhaLogin(email);
      showLoginErrorReal(info.count >= LOGIN_LOCK_THRESHOLD ? LOGIN_MSG_BLOQUEADO : KronoAuth.friendlyError(e));
    } else {
      showLoginErrorReal(KronoAuth.friendlyError(e));
    }
  }finally{
    btn.disabled = false;
  }
}

function hideBootScreen(){
  const boot = document.getElementById('view-boot');
  if(boot) boot.style.display='none';
}

// instant=true pula a animação de "saída" da tela de login (420ms) — usado
// quando o Supabase já resolveu uma sessão salva antes de mostrar qualquer
// coisa (view-boot cobrindo a tela, ver main.js), então não faz sentido
// animar a saída de um login que o usuário nunca chegou a ver.
function enterApp(instant){
  const loginEl = document.getElementById('view-login');
  const appEl = document.getElementById('view-app');
  hideBootScreen();
  function finish(){
    loginEl.style.display='none';
    appEl.style.display='block';
    document.getElementById('chipName').textContent = session.name;
    document.getElementById('chipRole').textContent = session.role;
    const chipSup = document.getElementById('chipSup');
    if(session.role==='analista'){
      const me = userById(session.userId);
      const sup = userById(me?.supervisorId);
      chipSup.textContent = sup ? `Supervisor: ${sup.name}` : '';
    } else { chipSup.textContent=''; }
    buildNav();
    renderMain();
    refreshNotificacoes();
    requestAnimationFrame(()=> appEl.classList.add('entered'));
  }
  if(instant){ finish(); }
  else { loginEl.classList.add('leaving'); setTimeout(finish, 420); }
}

// Sino de notificações (sidebar) — supervisor/coordenador recebem "esqueci
// minha senha" (notificacoes.controller.js) e analista recebe qualquer
// alteração na própria agenda (base mestra, ausência/cobertura, reunião —
// ver notificar() em backend/src/services/notificar.js). Chamado de novo a
// cada login/boot (enterApp acima); a lista em si só atualiza ao abrir o
// sino ou marcar como lida, não fica dando poll sozinho.
let minhasNotificacoes = [];
async function refreshNotificacoes(){
  const bell = document.getElementById('btnNotificacoes');
  if(!bell) return;
  bell.style.display='flex';
  try{ minhasNotificacoes = await apiListNotificacoes(); }
  catch(e){ minhasNotificacoes = []; }
  const naoLidas = minhasNotificacoes.filter(n=>!n.lida).length;
  const badge = document.getElementById('notifBadgeCount');
  badge.textContent = naoLidas>9 ? '9+' : String(naoLidas);
  badge.classList.toggle('show', naoLidas>0);
}

function abrirNotificacoes(){
  openModal(`<h3>Notificações</h3>
    <div style="max-height:60vh;overflow-y:auto;margin-top:10px;display:flex;flex-direction:column;gap:8px;">
    ${minhasNotificacoes.length===0 ? '<div class="empty">Nenhuma notificação.</div>' : minhasNotificacoes.map(n=>`
      <div class="msg-item" style="${n.lida?'opacity:0.55;':''}">
        <div class="msg-meta">${timeAgo(n.ts)}</div>
        <div style="margin-top:2px;">${escapeHtml(n.mensagem)}</div>
        ${!n.lida ? `<div style="margin-top:8px;"><button class="btn" data-marcar-notif-lida="${n.id}">Marcar como lida</button></div>` : ''}
      </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" data-modal-cancel>Fechar</button></div>`);
  const cancelBtn = document.querySelector('[data-modal-cancel]');
  if(cancelBtn) cancelBtn.onclick = closeModal;
  document.querySelectorAll('#modalBody [data-marcar-notif-lida]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.marcarNotifLida;
      try{
        await apiMarcarNotificacaoLida(id);
        const n = minhasNotificacoes.find(x=>x.id===id);
        if(n) n.lida = true;
        await refreshNotificacoes();
        abrirNotificacoes();
      }catch(e){ alert('Não foi possível marcar como lida: '+e.message); }
    });
  });
}

async function exitApp(){
  session = null;
  const loginEl = document.getElementById('view-login');
  const appEl = document.getElementById('view-app');
  appEl.classList.remove('entered');
  appEl.style.display='none';
  loginEl.style.display='flex';
  loginEl.classList.remove('leaving');
  document.getElementById('loginPassReal').value='';
  await KronoAuth.signOutUser(); // dispara onAuthStateChanged(null) -> volta pro login
}


const NAV = {
  analista:[ {k:'flashcards', label:'Programação', icon:'🗓️'}, {k:'recados', label:'Caixa de Entrada', icon:'📥'}, {k:'resultadospr', label:'Resultado SPR', icon:'🎯'}, {k:'feedback', label:'Feedback', icon:'⭐'}, {k:'configuracoes', label:'Configurações', icon:'⚙️'} ],
  supervisor:[ {k:'cadastros', label:'Cadastros', icon:'👥'}, {k:'basemestra', label:'Operações Fixas', icon:'📌'}, {k:'spr', label:'SPR', icon:'🔢'}, {k:'resultadospr', label:'Resultado SPR', icon:'🎯'}, {k:'suplencias', label:'Cobertura', icon:'🔁'}, {k:'programacao', label:'Programação Analista', icon:'🗓️'}, {k:'grade', label:'Grade do Dia', icon:'📋'}, {k:'domingos', label:'Controle de Domingos', icon:'📆'}, {k:'reunioes', label:'Eventos', icon:'📅'}, {k:'metricas', label:'Métricas', icon:'📊'}, {k:'transmissao', label:'Caixa de Envio', icon:'📣'}, {k:'ocorrencias', label:'Ocorrências', icon:'🚩'}, {k:'feedbacks', label:'Feedbacks', icon:'⭐'}, {k:'configuracoes', label:'Configurações', icon:'⚙️'} ],
  coordenador:[ {k:'acessos', label:'Gestão de Acessos', icon:'🔑'}, {k:'dashboard', label:'Dashboard Global', icon:'🌐'}, {k:'comunicados', label:'Comunicados', icon:'📣'}, {k:'painel', label:'Painel Hora a Hora', icon:'⏱️'}, {k:'status', label:'Status Operacional', icon:'📶'}, {k:'anomalias', label:'Ocorrências', icon:'🚩'}, {k:'metricas', label:'Métricas', icon:'📊'}, {k:'resultadospr', label:'Resultado SPR', icon:'🎯'}, {k:'configuracoes', label:'Configurações', icon:'⚙️'} ],
};

let activeNavKey = null;


// Ordena/filtra os itens de NAV[role] conforme a personalização salva em
// user.navConfig = { order:[chave,...], hidden:[chave,...] }. Chaves novas
// (adicionadas ao produto depois da personalização) entram no fim, visíveis.
function visibleNavItems(){
  const defaultItems = NAV[session.role];
  const cfg = userById(session.userId)?.navConfig;
  if(!cfg) return defaultItems;
  const byKey = k => defaultItems.find(i=>i.k===k);
  const ordered = cfg.order.map(byKey).filter(Boolean).filter(i=>!cfg.hidden.includes(i.k));
  const missing = defaultItems.filter(i=> !cfg.order.includes(i.k));
  const items = [...ordered, ...missing];
  return items.length ? items : defaultItems;
}

function buildNav(){
  const items = visibleNavItems();
  activeNavKey = items[0].k;
  document.getElementById('navEyebrow').textContent = session.role==='analista'?'Analista':session.role==='supervisor'?'Supervisor':'Coordenador';
  const el = document.getElementById('navItems');
  el.innerHTML = items.map(it=>`<div class="nav-item ${it.k===activeNavKey?'active':''}" data-k="${it.k}" title="${it.label}"><span class="nav-icon">${it.icon||'•'}</span><span class="nav-label">${it.label}</span><span class="nav-badge" data-badge="${it.k}"></span></div>`).join('');
  el.onclick = e=>{
    const item = e.target.closest('.nav-item'); if(!item) return;
    activeNavKey = item.dataset.k;
    el.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.k===activeNavKey));
    renderMain();
  };
  updateNavBadges();
}

// Bolinha piscando ao lado de itens do menu com pendência — hoje só a Caixa
// de Entrada do analista, até ele confirmar a leitura de todos os recados.
// Chamado de novo a cada renderMain() pra ficar em sincronia sem precisar
// reconstruir o menu inteiro (buildNav) a cada mutação.
function updateNavBadges(){
  if(session.role==='analista'){
    const badge = document.querySelector('[data-badge="recados"]');
    if(badge){
      const naoLidas = recadosParaAnalista(session.userId).filter(r=>!(r.lidoPor||[]).includes(session.userId)).length;
      badge.classList.toggle('show', naoLidas>0);
    }
  }
}

function openMenuConfigModal(){
  const me = userById(session.userId);
  const defaultItems = NAV[session.role];
  const defaultKeys = defaultItems.map(i=>i.k);
  const cfg = me.navConfig || { order: defaultKeys, hidden: [] };
  let order = [...cfg.order.filter(k=>defaultKeys.includes(k)), ...defaultKeys.filter(k=>!cfg.order.includes(k))];
  let hidden = [...(cfg.hidden||[])];

  function renderRows(){
    return order.map((k,idx)=>{
      const item = defaultItems.find(i=>i.k===k);
      const isHidden = hidden.includes(k);
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="flex:1;font-size:13.5px;${isHidden?'color:var(--text-faint);text-decoration:line-through;':''}">${item.label}</span>
        <button class="btn" data-mv-up="${k}" ${idx===0?'disabled':''} style="padding:4px 10px;">↑</button>
        <button class="btn" data-mv-down="${k}" ${idx===order.length-1?'disabled':''} style="padding:4px 10px;">↓</button>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted);"><input type="checkbox" data-mv-hide="${k}" ${isHidden?'checked':''}> Ocultar</label>
      </div>`;
    }).join('');
  }

  function bindRows(){
    const list = document.getElementById('menucfgList');
    list.querySelectorAll('[data-mv-up]').forEach(btn=>{ btn.onclick = ()=>{
      const k = btn.dataset.mvUp; const i = order.indexOf(k);
      if(i>0){ [order[i-1],order[i]]=[order[i],order[i-1]]; refresh(); }
    };});
    list.querySelectorAll('[data-mv-down]').forEach(btn=>{ btn.onclick = ()=>{
      const k = btn.dataset.mvDown; const i = order.indexOf(k);
      if(i<order.length-1){ [order[i+1],order[i]]=[order[i],order[i+1]]; refresh(); }
    };});
    list.querySelectorAll('[data-mv-hide]').forEach(chk=>{ chk.onchange = ()=>{
      const k = chk.dataset.mvHide;
      if(chk.checked){ if(!hidden.includes(k)) hidden.push(k); } else { hidden = hidden.filter(x=>x!==k); }
    };});
  }

  function refresh(){
    document.getElementById('menucfgList').innerHTML = renderRows();
    bindRows();
  }

  openModal(`<h3>Personalizar menu</h3>
    <div class="help-text">Use as setas para reordenar e a caixa para ocultar itens do seu menu lateral.</div>
    <div id="menucfgList">${renderRows()}</div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
      <button class="btn" id="menucfgReset">Restaurar padrão</button>
      <div style="display:flex;gap:8px;">
        <button class="btn" data-modal-cancel>Cancelar</button>
        <button class="btn btn-brand" id="menucfgSave">Salvar</button>
      </div>
    </div>`);
  bindRows();
  document.querySelector('[data-modal-cancel]').onclick = closeModal;
  document.getElementById('menucfgReset').onclick = ()=>{
    order = [...defaultKeys]; hidden = []; refresh();
  };
  document.getElementById('menucfgSave').onclick = async ()=>{
    if(order.length - hidden.length === 0){ alert('Deixe ao menos um item visível.'); return; }
    const navConfig = { order, hidden };
    me.navConfig = navConfig; // atualiza local pra UI refletir na hora, antes da resposta do backend
    try{
      await apiUpdateUser(session.userId, { navConfig });
      closeModal(); buildNav(); renderMain();
    }catch(e){ alert('Não foi possível salvar a personalização: '+e.message); }
  };
}


// Cobertura "ao vivo" sem confirmação de ciência já auto-aberta nesta
// sessão (chave "operação|data") — ver fim de renderMain(), evita reabrir
// a Particularidade sozinha a cada render depois da primeira vez.
let _particularidadeAutoAbertas = new Set();

function renderMain(){
  const main = document.getElementById('mainArea');
  if(activeNavKey==='configuracoes') main.innerHTML = renderConfiguracoes();
  else if(session.role==='analista') main.innerHTML = activeNavKey==='recados' ? renderRecadosAnalista() : activeNavKey==='feedback' ? renderFeedbackAnalista() : activeNavKey==='resultadospr' ? analistaResultadoSPR() : renderAnalista();
  else if(session.role==='supervisor') main.innerHTML = renderSupervisor();
  else if(session.role==='coordenador') main.innerHTML = renderCoordenador();
  bindMainEvents();
  updateNavBadges();
  if(activeNavKey==='metricas') renderMetricasCharts();
  if(activeNavKey==='ocorrencias' || activeNavKey==='anomalias') renderOcorrenciasCharts();
  if(activeNavKey==='dashboard') renderDashboardCharts();
  if(activeNavKey==='status') renderStatusCharts();
  if(activeNavKey==='resultadospr') renderSPRCharts();
  // Enquadra a coluna do horário atual na visão diária (Programação do
  // analista/supervisor) sem precisar rolar manualmente — só existe essa
  // classe quando o turno do dia exibido está rolando agora (ver
  // renderFlashcardRow, render-analista.js). "Todos os analistas" pode
  // renderizar mais de uma linha na mesma página, então rola cada uma —
  // scrollIntoView afeta só o .flash-outer (ancestral scrollável mais
  // próximo) de cada uma, não a página inteira.
  document.querySelectorAll('.flash-col-agora').forEach(col=>{
    col.scrollIntoView({inline:'center', block:'nearest'});
  });
  // Cobertura "ao vivo" (coluna da hora atual) que o próprio analista ainda
  // não confirmou ciência: abre a Particularidade sozinha, uma vez só por
  // instância (operação+data) por sessão — pra não ficar reabrindo a cada
  // render depois que a pessoa já fechou ou já confirmou.
  const btnCoberturaAgora = document.querySelector('.flash-col-agora [data-particularidade-cobertura="1"][data-ciente="0"]');
  if(btnCoberturaAgora && btnCoberturaAgora.dataset.particularidadeAnalista===session?.userId){
    const chave = btnCoberturaAgora.dataset.particularidadeOp+'|'+btnCoberturaAgora.dataset.particularidadeData;
    if(!_particularidadeAutoAbertas.has(chave)){
      _particularidadeAutoAbertas.add(chave);
      btnCoberturaAgora.click();
    }
  }
}


// Tela de "Configurações" — mesma para os três papéis (analista, supervisor,
// coordenador): cada usuário troca o próprio e-mail de login e senha aqui,
// sem depender de outra pessoa (ver backend/README.md → "Autenticação").
function renderConfiguracoes(){
  const me = userById(session.userId);
  return `<div class="page-head"><div><h1 class="page-title">Configurações</h1><div class="page-desc">Seu e-mail e senha de login</div></div></div>
  <div class="card" style="max-width:420px;">
    <div class="section-title">Alterar e-mail de login</div>
    <div class="help-text">E-mail atual: ${me.email}</div>
    <div id="cfgEmailMsg" class="login-error"></div>
    <div class="field"><label>Novo e-mail</label><input type="email" id="cfgNewEmail" autocomplete="off"></div>
    <div class="field"><label>Senha atual</label><input type="password" id="cfgEmailCurPass" autocomplete="current-password"></div>
    <button class="btn btn-brand" id="cfgSaveEmail">Salvar novo e-mail</button>
  </div>
  <div class="card" style="max-width:420px;margin-top:16px;">
    <div class="section-title">Alterar senha</div>
    <div id="cfgPassMsg" class="login-error"></div>
    <div class="field"><label>Senha atual</label><input type="password" id="cfgCurPass" autocomplete="current-password"></div>
    <div class="field"><label>Nova senha</label><input type="password" id="cfgNewPass" autocomplete="new-password"></div>
    <div class="field"><label>Confirmar nova senha</label><input type="password" id="cfgNewPass2" autocomplete="new-password"></div>
    <button class="btn btn-brand" id="cfgSavePass">Salvar nova senha</button>
  </div>
  <div class="card" style="max-width:420px;margin-top:16px;">
    <div class="section-title">Atualizar dados</div>
    <button class="btn" id="cfgRefreshData">🔄 Atualizar dados agora</button>
  </div>`;
}

function setFormMsg(el, msg, isError){
  el.textContent = msg;
  el.className = isError ? 'login-error' : 'form-success';
  el.style.display = msg ? 'block' : 'none';
}


function openModal(html){
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBg').style.display='flex';
}

// Variante encostada na lateral esquerda, com o fundo quase transparente
// (ver .modal-bg-left, style.css) — usada pelo modal de Particularidade
// (events.js) pra não tampar a Programação atrás enquanto o analista
// confere o card ao mesmo tempo.
function openModalSide(html){
  document.getElementById('modalBg').classList.add('modal-bg-left');
  openModal(html);
}

// Trava o fechamento por clique fora (ver main.js) — usado pelo modal de
// Particularidade da operação (events.js), que só pode fechar pelo "X"
// explícito, pra não perder texto digitado por engano.
let modalLocked = false;

function closeModal(){
  modalLocked = false;
  document.getElementById('modalBg').classList.remove('modal-bg-left');
  document.getElementById('modalBg').style.display='none';
}

// Barra de progresso pros imports em massa (Excel) — cada linha vira uma
// chamada de API sequencial (events.js), então dá pra medir e mostrar
// progresso real, não só um spinner indeterminado.
function openProgressModal(titulo){
  openModal(`<h3>${titulo}</h3>
    <div class="progress-track"><div class="progress-fill" id="importProgressFill" style="width:0%;"></div></div>
    <div class="help-text" id="importProgressLabel" style="margin-top:10px;margin-bottom:0;text-align:center;">Preparando...</div>`);
}
function updateProgressModal(done, total){
  const pct = total>0 ? Math.round((done/total)*100) : 100;
  const fill = document.getElementById('importProgressFill');
  const label = document.getElementById('importProgressLabel');
  if(fill) fill.style.width = pct+'%';
  if(label) label.textContent = `${done} / ${total} (${pct}%)`;
}

