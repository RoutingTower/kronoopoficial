/* Bootstrap da aplicação: listeners fixos + carga inicial dos dados. */

document.getElementById('logoutBtn').addEventListener('click', exitApp);
document.getElementById('modalBg').addEventListener('click', e=>{ if(e.target.id==='modalBg') closeModal(); });
document.getElementById('btnPersonalizarMenu').addEventListener('click', openMenuConfigModal);

// Fecha o dropdown de multi-seleção (Métricas) ao clicar fora dele — o
// botão e os itens de dentro do painel já dão stopPropagation (events.js),
// então só chega aqui clique de fato fora.
document.addEventListener('click', ()=>{
  if(session && uiState.metricasAnalistaDropdownOpen){
    uiState.metricasAnalistaDropdownOpen = false;
    renderMain();
  }
});

// Menu lateral recolhível: guarda só os ícones e devolve espaço pra área
// principal. Fica no .shell (não no .sidebar) porque quem define a largura
// da coluna é o grid do .shell — ver .shell.nav-collapsed no style.css.
// Estado persiste em localStorage pra sobreviver a reload/novo login.
const shellEl = document.querySelector('.shell');
const sidebarToggleBtn = document.getElementById('btnSidebarToggle');
function applySidebarCollapsed(collapsed){
  shellEl.classList.toggle('nav-collapsed', collapsed);
  sidebarToggleBtn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
}
let sidebarCollapsed = false;
try{ sidebarCollapsed = localStorage.getItem('kronoop-sidebar-collapsed')==='1'; }catch(e){}
applySidebarCollapsed(sidebarCollapsed);
sidebarToggleBtn.addEventListener('click', ()=>{
  sidebarCollapsed = !sidebarCollapsed;
  applySidebarCollapsed(sidebarCollapsed);
  try{ localStorage.setItem('kronoop-sidebar-collapsed', sidebarCollapsed?'1':'0'); }catch(e){}
});

const themeSwitches = document.querySelectorAll('.theme-switch-input');
function syncThemeSwitches(){
  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  themeSwitches.forEach(inp=>{
    inp.checked = isDark;
    inp.nextElementSibling.querySelector('.theme-switch-thumb').textContent = isDark ? '☀️' : '🌙';
  });
}
themeSwitches.forEach(inp=>{
  inp.addEventListener('change', ()=>{
    const next = inp.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try{ localStorage.setItem('kronoop-theme', next); }catch(e){}
    syncThemeSwitches();
  });
});
syncThemeSwitches();

initLogin();

// Fonte da verdade da sessão: dispara tanto após um login manual
// (KronoAuth.signIn em ui.js) quanto ao recarregar a página com uma sessão
// já persistida — os dois casos convergem aqui.
//
// authRequestSeq evita corrida: se dois eventos disparam em sequência rápida
// (ex.: sessão persistida resolvendo bem na hora em que um novo login manual
// é enviado), a resposta mais lenta de um evento MAIS ANTIGO não pode
// sobrescrever a sessão já atualizada por um evento mais novo.
//
// isFirstAuthCheck marca a PRIMEIRA chamada (o boot da página, coberto por
// #view-boot — ver index.html/style.css) — só nesse caso pulamos a animação
// de saída do login (entra direto, sem o usuário nunca ter visto o
// formulário) e escondemos o boot. Em qualquer outra chamada (login manual,
// logout) o boot já foi escondido há muito tempo.
let authRequestSeq = 0;
let isFirstAuthCheck = true;
KronoAuth.onAuthStateChanged(async (user)=>{
  const myReq = ++authRequestSeq;
  const isBoot = isFirstAuthCheck;
  isFirstAuthCheck = false;
  if(!user){ if(isBoot) hideBootScreen(); return; } // tela de login (real) já é a exibida por padrão
  const btn = document.getElementById('loginBtnReal');
  const btnLabel = btn.textContent;
  btn.disabled = true;
  // Avisa só se passar de 4s — a maioria dos acessos carrega bem mais
  // rápido que isso, não vale mostrar o aviso de "conectando" toda vez.
  const slowHintTimer = setTimeout(()=>{ btn.textContent = 'Conectando ao servidor...'; }, 4000);
  try{
    await loadDB();
    const me = await apiRequest('GET', '/users/me');
    if(myReq !== authRequestSeq) return; // ficou obsoleto enquanto isso — um evento mais novo já assumiu
    session = { role: me.role, userId: me.id, name: me.name };
    enterApp(isBoot);
  }catch(e){
    if(myReq !== authRequestSeq) return;
    console.error('KronoOP: falha ao carregar perfil autenticado.', e);
    if(isBoot) hideBootScreen();
    showLoginErrorReal('Não foi possível carregar seu perfil. Tente novamente.');
    await KronoAuth.signOutUser();
  }finally{
    clearTimeout(slowHintTimer);
    btn.disabled = false;
    btn.textContent = btnLabel;
  }
});
