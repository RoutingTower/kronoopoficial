/* Bootstrap da aplicação: listeners fixos + carga inicial dos dados. */

document.getElementById('logoutBtn').addEventListener('click', exitApp);
document.getElementById('modalBg').addEventListener('click', e=>{ if(e.target.id==='modalBg' && !modalLocked) closeModal(); });
document.getElementById('btnPersonalizarMenu').addEventListener('click', openMenuConfigModal);
document.getElementById('btnNotificacoes').addEventListener('click', abrirNotificacoes);

// Fecha o dropdown de multi-seleção (Métricas, Dashboard Global, Painel
// Hora a Hora, Status Operacional) ao clicar fora dele — o botão e os
// itens de dentro do painel já dão stopPropagation (events.js), então só
// chega aqui clique de fato fora.
document.addEventListener('click', ()=>{
  const algumAberto = session && (uiState.metricasAnalistaDropdownOpen || uiState.metricasSupervisorDropdownOpen
    || uiState.dashboardSupervisorDropdownOpen || uiState.painelSupervisorDropdownOpen || uiState.statusSupervisorDropdownOpen
    || uiState.sprAnalistaDropdownOpen || uiState.sprSupervisorDropdownOpen);
  if(algumAberto){
    uiState.metricasAnalistaDropdownOpen = false;
    uiState.metricasSupervisorDropdownOpen = false;
    uiState.dashboardSupervisorDropdownOpen = false;
    uiState.painelSupervisorDropdownOpen = false;
    uiState.statusSupervisorDropdownOpen = false;
    uiState.sprAnalistaDropdownOpen = false;
    uiState.sprSupervisorDropdownOpen = false;
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

// No celular o mesmo botão (☰) tem outro papel: a barra lateral já é só
// uma linha horizontal (não faz sentido "recolher" ela), então aqui ele
// abre/fecha o menu de navegação como um painel solto (#navItems vira
// dropdown, ver @media max-width:880px no style.css) — 14 abas não cabiam
// numa faixa de rolagem horizontal apertada, ficava difícil até notar que
// dava pra arrastar pro lado pra achar as outras.
const navMobileBackdrop = document.getElementById('navMobileBackdrop');
function closeMobileNav(){ shellEl.classList.remove('nav-mobile-open'); }
sidebarToggleBtn.addEventListener('click', ()=>{
  if(window.matchMedia('(max-width:880px)').matches){
    shellEl.classList.toggle('nav-mobile-open');
    return;
  }
  sidebarCollapsed = !sidebarCollapsed;
  applySidebarCollapsed(sidebarCollapsed);
  try{ localStorage.setItem('kronoop-sidebar-collapsed', sidebarCollapsed?'1':'0'); }catch(e){}
});
navMobileBackdrop.addEventListener('click', closeMobileNav);

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
  // O SDK do Supabase dispara este evento de novo (mesmo usuário) em vários
  // momentos que não são login — refresh automático de token, troca de
  // aba/foco da janela etc. Sem essa guarda, cada disparo recarregava TODO
  // o DB e re-renderizava a tela inteira (nav + tela atual), perdendo
  // filtro/scroll/dropdown aberto — sentia como "a tela atualiza sozinha",
  // principalmente ao navegar (foco muda de elemento). Só a checagem
  // inicial (isBoot) e um login manual de verdade (session ainda null, ver
  // exitApp em ui.js) devem passar daqui pra baixo.
  if(session && !isBoot) return;
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

// Atualização automática do DB em memória a cada 10min — sem isso, uma aba
// que fica aberta o turno inteiro só vê o que existia no momento do login
// (loadDB só roda ali, ver onAuthStateChanged acima), ficando cega a
// mudanças feitas por outra pessoa. Mesmo efeito do botão "Atualizar dados
// agora" (Configurações), só que sozinho. Silenciosa em caso de falha —
// só loga e tenta de novo no próximo ciclo, sem interromper quem tiver
// usando a tela. Com modal aberto (alguém preenchendo Raio-X, compondo um
// comunicado etc.), só atualiza os dados em memória e pula o renderMain —
// um redesenho da tela nessa hora perderia o que a pessoa tava digitando.
setInterval(async ()=>{
  if(!session) return;
  try{
    await loadDB();
    const modalAberto = document.getElementById('modalBg')?.style.display === 'flex';
    if(!modalAberto) renderMain();
  }catch(e){
    console.error('KronoOP: falha na atualização automática periódica.', e);
  }
}, 10*60*1000);

// Cronômetro ao vivo do card de operação (Tempo de Execução, ver
// render-analista.js) — só atualiza o texto do timer a cada segundo, sem
// re-renderizar a tela inteira (o que fecharia modais/menus abertos à toa).
// Agora com base no horário real que a planilha de roteirização já
// registrou (roteirizacao_status), não num clique dentro do Kronos.
setInterval(()=>{
  document.querySelectorAll('[data-timer-desde]').forEach(el=>{
    const desde = Number(el.dataset.timerDesde);
    if(!desde) return;
    const totalSeg = Math.max(0, Math.floor((Date.now()-desde)/1000));
    const h = Math.floor(totalSeg/3600), m = Math.floor((totalSeg%3600)/60), s = totalSeg%60;
    const numEl = el.querySelector('.timer-num');
    if(numEl) numEl.textContent = h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  });
}, 1000);

// Linha "agora" da Programação Diária (ver renderFlashcardRow, render-
// analista.js) — mesmo problema do cronômetro acima: sem isso, a bolinha
// fica parada na posição de quando a tela renderizou pela última vez,
// ficando cada vez mais atrasada em relação ao horário real enquanto quem
// está com a tela aberta não navega pra lugar nenhum. Só recalcula a
// posição (sem re-renderizar nada); se a hora já virou (ou o turno já
// acabou), aí sim precisa de um renderMain() de verdade pra trocar de
// coluna "agora"/mostrar a próxima hora.
setInterval(()=>{
  if(!session) return;
  document.querySelectorAll('.timeline-overlay-wrap[data-timeline-hora-inicio]').forEach(wrap=>{
    const horaInicioTs = Number(wrap.dataset.timelineHoraInicio);
    if(!horaInicioTs) return;
    const now = Date.now();
    if(now < horaInicioTs || now >= horaInicioTs + 60*60*1000){
      // Mesma cautela do refresh periódico de dados (acima): não derruba
      // um modal aberto (ex.: preenchendo Raio-X) só porque a hora virou.
      if(document.getElementById('modalBg')?.style.display !== 'flex') renderMain();
      return;
    }
    const basePx = Number(wrap.dataset.timelineBasePx);
    const colW = Number(wrap.dataset.timelineColW);
    const frac = Math.min(1, Math.max(0, (now-horaInicioTs)/(60*60*1000)));
    const px = basePx + frac*colW;
    const fill = wrap.querySelector('.timeline-fill');
    const dot = wrap.querySelector('.timeline-now');
    if(fill) fill.style.width = px+'px';
    if(dot){
      dot.style.left = px+'px';
      dot.title = `Agora: ${new Date(now).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
    }
  });
}, 30000);
