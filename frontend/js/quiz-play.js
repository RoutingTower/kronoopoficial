/* Tela do jogador do Quiz ao vivo — página isolada (quiz.html), fora da SPA
   de propósito: quem entra aqui não tem (nem precisa criar) conta no Kronos,
   só PIN + apelido. Fala direto com as rotas públicas /api/quiz-play/* (ver
   backend/src/controllers/quizPlay.controller.js) via fetch cru — nenhuma
   dependência de supabase-init.js/state.js/ui.js do resto do app.

   API_BASE vem de js/config.js (mesmo arquivo usado pela SPA). */

const QUIZ_PLAY_CORES = ['#D9362E', '#2F80ED', '#B8860B', '#2FAE60'];
const QUIZ_PLAY_STORAGE_KEY = 'kronoop-quiz-participante';

let qpPin = null;
let qpParticipanteId = null;
let qpPerguntaAtualId = null;
let qpJaRespondiLocal = false;
let qpPollTimer = null;
let qpCountdownTimer = null;

function qpEscapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qpRender(html){ document.getElementById('quizPlayRoot').innerHTML = html; }

function qpSalvarIdentidade(){
  try{ localStorage.setItem(QUIZ_PLAY_STORAGE_KEY, JSON.stringify({ pin: qpPin, participanteId: qpParticipanteId })); }catch(e){}
}
function qpCarregarIdentidade(){
  try{ return JSON.parse(localStorage.getItem(QUIZ_PLAY_STORAGE_KEY) || 'null'); }catch(e){ return null; }
}
function qpLimparIdentidade(){
  try{ localStorage.removeItem(QUIZ_PLAY_STORAGE_KEY); }catch(e){}
}

function qpPararPolling(){ if(qpPollTimer){ clearInterval(qpPollTimer); qpPollTimer = null; } }
function qpPararCountdown(){ if(qpCountdownTimer){ clearInterval(qpCountdownTimer); qpCountdownTimer = null; } }
function qpPararTudo(){ qpPararPolling(); qpPararCountdown(); }

// Link direto com PIN embutido (?pin=123456, ver btnQuizCopiarLink em
// events.js/render-quiz.js) — quem abre por esse link não precisa digitar o
// PIN, só o nome. Link sem esse parâmetro (ex.: "Entrar em um quiz" da tela
// de login) continua pedindo os dois campos normalmente.
function qpPinDaUrl(){
  try{
    const pin = new URLSearchParams(window.location.search).get('pin') || '';
    return /^\d{4,8}$/.test(pin) ? pin : null;
  }catch(e){ return null; }
}

// ---------- Tela: entrar ----------

function qpTelaEntrar(erro){
  qpPararTudo();
  const pinFixo = qpPinDaUrl();
  qpRender(`
    <div class="quiz-play-card">
      <h1 class="quiz-play-title">Entrar no quiz</h1>
      <p class="quiz-play-sub">${pinFixo ? 'Só falta seu nome pra entrar.' : 'Peça o PIN pra quem está apresentando.'}</p>
      <div class="quiz-play-field"><label>PIN</label><input id="qpPinInput" inputmode="numeric" maxlength="6" placeholder="123456" ${pinFixo ? `value="${pinFixo}" readonly style="opacity:0.65;"` : ''}></div>
      <div class="quiz-play-field"><label>Seu nome</label><input id="qpNomeInput" maxlength="40" placeholder="Como quer aparecer no ranking"></div>
      <button class="quiz-play-btn" id="qpEntrarBtn">Entrar</button>
      ${erro ? `<div class="quiz-play-erro">${qpEscapeHtml(erro)}</div>` : ''}
    </div>`);
  const btn = document.getElementById('qpEntrarBtn');
  btn.addEventListener('click', qpOnEntrar);
  document.getElementById('qpNomeInput').addEventListener('keydown', e=>{ if(e.key==='Enter') qpOnEntrar(); });
  (pinFixo ? document.getElementById('qpNomeInput') : document.getElementById('qpPinInput')).focus();
}

async function qpOnEntrar(){
  const pinInput = document.getElementById('qpPinInput').value.trim();
  const nome = document.getElementById('qpNomeInput').value.trim();
  if(!/^\d{4,8}$/.test(pinInput) || !nome){ qpTelaEntrar('Preencha o PIN e seu nome.'); return; }
  const btn = document.getElementById('qpEntrarBtn');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try{
    const res = await fetch(`${API_BASE}/quiz-play/${pinInput}/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    const dados = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(dados.message || 'Não foi possível entrar.');
    qpPin = pinInput;
    qpParticipanteId = dados.participanteId;
    qpSalvarIdentidade();
    qpIniciarPolling();
  }catch(e){
    qpTelaEntrar(e.message);
  }
}

// ---------- Polling do estado ----------

// 2s (era 1,2s) — cada participante bate nessa rota de forma independente,
// então o intervalo entra direto na conta de quanto o servidor trabalha por
// segundo com o quiz cheio de gente. Some com o cache de ~1s do backend
// (ver bundleDaSessao, quizPlay.controller.js) — juntos, aguentam bem mais
// gente ao mesmo tempo (incidente com 20+ participantes travando, 01/09/2026).
const QP_POLL_MS = 2000;
// Só avisa "conexão instável" depois de falhas SEGUIDAS — uma falha isolada
// de rede é normal e não deveria assustar ninguém no meio do jogo.
const QP_FALHAS_PARA_AVISAR = 3;
let qpFalhasConsecutivas = 0;

function qpMostrarStatusConexao(instavel){
  let el = document.getElementById('qpStatusConexao');
  if(!el){
    el = document.createElement('div');
    el.id = 'qpStatusConexao';
    el.className = 'quiz-play-status-instavel';
    el.textContent = '⚠ Conexão instável — tentando reconectar...';
    document.body.appendChild(el);
  }
  el.style.display = instavel ? 'block' : 'none';
}

function qpIniciarPolling(){
  qpPararPolling();
  qpFalhasConsecutivas = 0;
  qpPollEstado();
  qpPollTimer = setInterval(qpPollEstado, QP_POLL_MS);
}

async function qpPollEstado(){
  try{
    const res = await fetch(`${API_BASE}/quiz-play/${qpPin}/estado?participanteId=${encodeURIComponent(qpParticipanteId)}`);
    if(res.status === 404){
      qpLimparIdentidade();
      qpTelaEntrar('Esse quiz não existe mais — peça um PIN novo ao apresentador.');
      return;
    }
    if(!res.ok) throw new Error('status '+res.status);
    const dados = await res.json();
    qpFalhasConsecutivas = 0;
    qpMostrarStatusConexao(false);
    qpRenderEstado(dados);
  }catch(e){
    // Falha de rede/servidor — tenta de novo no próximo tick, sem trocar de
    // tela. Só acende o aviso depois de algumas seguidas (ver constante
    // acima), pra não piscar à toa numa oscilação isolada de rede.
    qpFalhasConsecutivas++;
    if(qpFalhasConsecutivas >= QP_FALHAS_PARA_AVISAR) qpMostrarStatusConexao(true);
  }
}

function qpRenderEstado(dados){
  if(dados.status === 'lobby') qpTelaAguardando();
  else if(dados.status === 'pergunta'){
    const jaRespondeu = dados.jaRespondi || (qpJaRespondiLocal && qpPerguntaAtualId === dados.pergunta.id);
    if(jaRespondeu) qpTelaAguardandoResposta();
    else qpTelaPergunta(dados);
  }
  else if(dados.status === 'revelacao') qpTelaRevelacao(dados);
  else if(dados.status === 'ranking') qpTelaRanking(dados);
  else if(dados.status === 'encerrado') qpTelaEncerrado();
}

// ---------- Telas do jogo ----------

function qpTelaAguardando(){
  qpPararCountdown();
  qpRender(`
    <div class="quiz-play-card">
      <h1 class="quiz-play-title">Você entrou!</h1>
      <p class="quiz-play-waiting">Aguardando o apresentador iniciar o quiz...</p>
    </div>`);
}

function qpTelaPergunta(dados){
  qpPararCountdown();
  if(qpPerguntaAtualId !== dados.pergunta.id){ qpPerguntaAtualId = dados.pergunta.id; qpJaRespondiLocal = false; }
  qpRender(`
    <div class="quiz-play-card" style="max-width:520px;">
      <div class="quiz-play-pergunta">${qpEscapeHtml(dados.pergunta.enunciado)}</div>
      <div style="margin-bottom:14px;color:var(--text-muted);">⏱ <span class="mono" id="qpCountdown">--</span>s</div>
      <div class="quiz-play-opcoes">
        ${dados.pergunta.opcoes.map((o,i)=>`<button class="quiz-play-opcao" style="background:${QUIZ_PLAY_CORES[i]};" data-idx="${i}">${qpEscapeHtml(o)}</button>`).join('')}
      </div>
    </div>`);
  const fimMs = dados.perguntaIniciadaEm + dados.pergunta.tempoSegundos*1000;
  const tick = ()=>{
    const el = document.getElementById('qpCountdown');
    if(!el){ qpPararCountdown(); return; }
    el.textContent = Math.max(0, Math.ceil((fimMs-Date.now())/1000));
  };
  tick();
  qpCountdownTimer = setInterval(tick, 500);
  document.querySelectorAll('.quiz-play-opcao').forEach(btn=>{
    btn.addEventListener('click', ()=> qpOnResponder(dados.pergunta.id, Number(btn.dataset.idx)));
  });
}

function qpTelaAguardandoResposta(){
  qpPararCountdown();
  qpRender(`
    <div class="quiz-play-card">
      <div class="quiz-play-resultado">✅ Resposta enviada!</div>
      <p class="quiz-play-waiting">Aguardando os outros participantes...</p>
    </div>`);
}

async function qpOnResponder(perguntaId, opcaoIndex){
  qpJaRespondiLocal = true;
  qpTelaAguardandoResposta();
  try{
    await fetch(`${API_BASE}/quiz-play/${qpPin}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participanteId: qpParticipanteId, perguntaId, opcaoIndex }),
    });
  }catch(e){ /* o /estado na revelação mostra o resultado real de qualquer forma */ }
}

function qpTelaRevelacao(dados){
  qpPararCountdown();
  const minha = dados.minhaResposta;
  qpRender(`
    <div class="quiz-play-card">
      ${minha ? `
        <div class="quiz-play-resultado" style="color:${minha.correta ? 'var(--done)' : 'var(--alert)'};">${minha.correta ? '✅ Acertou!' : '❌ Errou'}</div>
        <div class="quiz-play-pontos">${minha.correta ? `+${minha.pontosGanhos} pontos` : '0 pontos'}</div>
      ` : `
        <div class="quiz-play-resultado">⏱ Tempo esgotado</div>
        <div class="quiz-play-pontos">Você não respondeu a tempo.</div>
      `}
    </div>`);
}

// Confete no ranking final do PRÓPRIO jogador — reaproveita as classes
// .dia-completo-toast/.dia-completo-confete/.confete-piece já definidas em
// css/style.css (mesmo arquivo que esta página carrega) pra comemoração de
// "dia fechado"/ranking final do host (ui.js) — aqui só o confete, sem o
// card de texto por cima. Dispara uma vez só por jogo (qpConfetiFinalMostrado).
let qpConfetiFinalMostrado = false;
function qpDispararConfetiFinal(){
  const confete = Array.from({length:36}).map((_,i)=>{
    const x = (Math.random()*100).toFixed(1);
    const delay = (Math.random()*0.5).toFixed(2);
    const dur = (2.2+Math.random()*1.2).toFixed(2);
    return `<span class="confete-piece" style="left:${x}%;background:${QUIZ_PLAY_CORES[i%QUIZ_PLAY_CORES.length]};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'dia-completo-toast';
  el.innerHTML = `<div class="dia-completo-confete">${confete}</div>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3800);
}

function qpTelaRanking(dados){
  if(dados.final && !qpConfetiFinalMostrado){ qpConfetiFinalMostrado = true; qpDispararConfetiFinal(); }
  const pos = dados.minhaPosicao;
  qpRender(`
    <div class="quiz-play-card">
      <h1 class="quiz-play-title">${dados.final ? 'Ranking final' : 'Ranking'}</h1>
      ${pos ? `<div class="quiz-play-resultado">${pos.posicao}º lugar</div><div class="quiz-play-pontos">${pos.pontuacao} pontos</div>` : '<p class="quiz-play-waiting">Aguardando pontuação...</p>'}
      <p class="quiz-play-waiting" style="margin-top:16px;">${dados.final ? 'Obrigado por jogar! 🎉' : 'Aguardando a próxima pergunta...'}</p>
    </div>`);
}

function qpTelaEncerrado(){
  qpPararTudo();
  qpLimparIdentidade();
  qpRender(`
    <div class="quiz-play-card">
      <h1 class="quiz-play-title">Quiz encerrado</h1>
      <p class="quiz-play-sub">Obrigado por jogar! 🎉</p>
    </div>`);
}

// ---------- Boot ----------

(function iniciar(){
  const salvo = qpCarregarIdentidade();
  if(salvo && salvo.pin && salvo.participanteId){
    qpPin = salvo.pin;
    qpParticipanteId = salvo.participanteId;
    qpIniciarPolling();
  } else {
    qpTelaEntrar();
  }
})();
