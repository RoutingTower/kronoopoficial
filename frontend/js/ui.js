/* Login, navegação, modal e o roteador principal de telas (renderMain). */

// --- Login real (Firebase Auth) ---------------------------------------

function showLoginErrorReal(msg){
  const el = document.getElementById('loginErrorReal');
  el.textContent = msg;
  el.style.display = 'block';
}

// Chamada uma única vez no bootstrap (main.js). O listener do Firebase Auth
// dispara tanto no login manual quanto na retomada de uma sessão já
// persistida (F5) — os dois casos convergem aqui.
function initLogin(){
  document.getElementById('loginBtnReal').addEventListener('click', doRealLogin);
  document.getElementById('loginPassReal').addEventListener('keydown', e=>{ if(e.key==='Enter') doRealLogin(); });
}

async function doRealLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassReal').value;
  const errEl = document.getElementById('loginErrorReal');
  errEl.style.display='none';
  if(!email || !pass){ showLoginErrorReal('Preencha e-mail e senha.'); return; }
  const btn = document.getElementById('loginBtnReal');
  btn.disabled = true;
  try{
    await KronoAuth.signIn(email, pass);
    // onAuthStateChanged (main.js) assume a partir daqui: carrega DB, perfil e entra no app.
  }catch(e){
    showLoginErrorReal(KronoAuth.friendlyError(e));
  }finally{
    btn.disabled = false;
  }
}

function enterApp(){
  const loginEl = document.getElementById('view-login');
  const appEl = document.getElementById('view-app');
  loginEl.classList.add('leaving');
  setTimeout(()=>{
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
    requestAnimationFrame(()=> appEl.classList.add('entered'));
  }, 420);
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
  analista:[ {k:'flashcards', label:'Programação'}, {k:'recados', label:'Caixa de Entrada'}, {k:'lembretes', label:'Lembretes'}, {k:'configuracoes', label:'Configurações'} ],
  supervisor:[ {k:'cadastros', label:'Cadastros'}, {k:'basemestra', label:'Operações Fixas'}, {k:'suplencias', label:'Cobertura'}, {k:'programacao', label:'Programação Analista'}, {k:'grade', label:'Grade do Dia'}, {k:'reunioes', label:'Eventos'}, {k:'metricas', label:'Métricas'}, {k:'transmissao', label:'Caixa de Envio'}, {k:'ocorrencias', label:'Ocorrências'}, {k:'configuracoes', label:'Configurações'} ],
  coordenador:[ {k:'acessos', label:'Gestão de Acessos'}, {k:'dashboard', label:'Dashboard Global'}, {k:'comunicados', label:'Comunicados'}, {k:'painel', label:'Painel Hora a Hora'}, {k:'status', label:'Status Operacional'}, {k:'anomalias', label:'Ocorrências'}, {k:'configuracoes', label:'Configurações'} ],
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
  el.innerHTML = items.map(it=>`<div class="nav-item ${it.k===activeNavKey?'active':''}" data-k="${it.k}">${it.label}</div>`).join('');
  el.onclick = e=>{
    const item = e.target.closest('.nav-item'); if(!item) return;
    activeNavKey = item.dataset.k;
    el.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.k===activeNavKey));
    renderMain();
  };
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


function renderMain(){
  const main = document.getElementById('mainArea');
  if(activeNavKey==='configuracoes') main.innerHTML = renderConfiguracoes();
  else if(session.role==='analista') main.innerHTML = activeNavKey==='recados' ? renderRecadosAnalista() : activeNavKey==='lembretes' ? renderLembretes() : renderAnalista();
  else if(session.role==='supervisor') main.innerHTML = renderSupervisor();
  else if(session.role==='coordenador') main.innerHTML = renderCoordenador();
  bindMainEvents();
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

function closeModal(){ document.getElementById('modalBg').style.display='none'; }

