/* Bootstrap da aplicação: listeners fixos + carga inicial dos dados. */

document.getElementById('logoutBtn').addEventListener('click', exitApp);
document.getElementById('modalBg').addEventListener('click', e=>{ if(e.target.id==='modalBg') closeModal(); });
document.getElementById('btnPersonalizarMenu').addEventListener('click', openMenuConfigModal);

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
// Firebase já persistida — os dois casos convergem aqui.
//
// authRequestSeq evita corrida: se dois eventos disparam em sequência rápida
// (ex.: sessão persistida resolvendo bem na hora em que um novo login manual
// é enviado), a resposta mais lenta de um evento MAIS ANTIGO não pode
// sobrescrever a sessão já atualizada por um evento mais novo.
let authRequestSeq = 0;
firebase.auth().onAuthStateChanged(async (user)=>{
  const myReq = ++authRequestSeq;
  if(!user){ return; } // tela de login (real) já é a exibida por padrão
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
    enterApp();
  }catch(e){
    if(myReq !== authRequestSeq) return;
    console.error('KronoOP: falha ao carregar perfil autenticado.', e);
    showLoginErrorReal('Não foi possível carregar seu perfil. Tente novamente.');
    await KronoAuth.signOutUser();
  }finally{
    clearTimeout(slowHintTimer);
    btn.disabled = false;
    btn.textContent = btnLabel;
  }
});
