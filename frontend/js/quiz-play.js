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

// ---------- Tela: entrar ----------

function qpTelaEntrar(erro){
  qpPararTudo();
  qpRender(`
    <div class="quiz-play-card">
      <h1 class="quiz-play-title">Entrar no quiz</h1>
      <p class="quiz-play-sub">Peça o PIN pra quem está apresentando.</p>
      <div class="quiz-play-field"><label>PIN</label><input id="qpPinInput" inputmode="numeric" maxlength="6" placeholder="123456"></div>
      <div class="quiz-play-field"><label>Seu nome</label><input id="qpNomeInput" maxlength="40" placeholder="Como quer aparecer no ranking"></div>
      <button class="quiz-play-btn" id="qpEntrarBtn">Entrar</button>
      ${erro ? `<div class="quiz-play-erro">${qpEscapeHtml(erro)}</div>` : ''}
    </div>`);
  const btn = document.getElementById('qpEntrarBtn');
  btn.addEventListener('click', qpOnEntrar);
  document.getElementById('qpNomeInput').addEventListener('keydown', e=>{ if(e.key==='Enter') qpOnEntrar(); });
  document.getElementById('qpPinInput').focus();
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

function qpIniciarPolling(){
  qpPararPolling();
  qpPollEstado();
  qpPollTimer = setInterval(qpPollEstado, 1200);
}

async function qpPollEstado(){
  try{
    const res = await fetch(`${API_BASE}/quiz-play/${qpPin}/estado?participanteId=${encodeURIComponent(qpParticipanteId)}`);
    if(res.status === 404){
      qpLimparIdentidade();
      qpTelaEntrar('Esse quiz não existe mais — peça um PIN novo ao apresentador.');
      return;
    }
    const dados = await res.json();
    qpRenderEstado(dados);
  }catch(e){ /* falha de rede pontual — tenta de novo no próximo tick, sem trocar de tela */ }
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

function qpTelaRanking(dados){
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
