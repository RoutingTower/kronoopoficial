/* Quiz ao vivo (estilo Kahoot) — tela compartilhada pelos 3 papéis: qualquer
   usuário logado pode criar e apresentar (não é feature de gestão, é uma
   dinâmica pontual de equipe). Quem participa entra sem conta, pelo PIN, a
   partir de quiz.html (fora da SPA) — ver quiz-play.js.

   Não usa DB/loadDB (ver state.js, loadDB): é ao vivo, então tem cache e
   polling PRÓPRIOS, fora do ciclo de 10min do resto do app:
     _quizLista            — cache de GET /api/quiz (tela de lista)
     uiState.quizApresentarDados — último GET /api/quiz/:id (tela de apresentar),
       mantido atualizado por quizGarantirPolling (chamado de ui.js/renderMain
       enquanto uiState.quizView==='apresentar'). */

let _quizLista = null;
let _quizListaCarregando = false;
let _quizPollTimer = null;
let _quizPollId = null;

// 4 cores fixas pras opções, igual Kahoot (vermelho/azul/dourado/verde) —
// reaproveita as variáveis de tema já existentes, então funciona nos dois temas.
const QUIZ_CORES = ['var(--alert)', 'var(--wait)', 'var(--folga)', 'var(--done)'];
const QUIZ_STATUS_LABEL = { lobby: 'Aguardando início', pergunta: 'Em andamento', revelacao: 'Revelando resposta', ranking: 'Ranking', encerrado: 'Encerrado' };

function renderQuiz(){
  if(uiState.quizView==='criar') return quizCriarHtml();
  if(uiState.quizView==='apresentar') return quizApresentarHtml();
  return quizListaHtml();
}

// ---------- Lista ----------

function quizListaHtml(){
  if(_quizLista===null){
    if(!_quizListaCarregando){
      _quizListaCarregando = true;
      apiListQuizzes()
        .then(rows=>{ _quizLista = rows; })
        .catch(()=>{ _quizLista = []; })
        .finally(()=>{ _quizListaCarregando = false; if(activeNavKey==='quiz' && uiState.quizView==='lista') renderMain(); });
    }
    return `<div class="section-title">Quiz</div><div class="empty">Carregando...</div>`;
  }
  const cards = _quizLista.map(quizCardHtml).join('');
  return `
  <div class="section-title">Quiz ao vivo
    <span class="spacer" style="flex:1;"></span>
    <button class="btn btn-brand btn-sm" id="btnQuizNovo">+ Novo quiz</button>
  </div>
  <p class="help-text" style="margin-top:-6px;">Crie um quiz, avise o PIN pros participantes — eles entram em "Entrar em um quiz" na tela de login, sem precisar de conta — e apresente ao vivo daqui.</p>
  ${cards || '<div class="empty">Nenhum quiz criado ainda.</div>'}`;
}

function quizCardHtml(q){
  const podeApresentar = q.status !== 'encerrado';
  return `
  <div class="card" style="margin-bottom:12px;">
    <div class="campaign-top">
      <div>
        <div class="tag-row" style="margin-bottom:6px;"><span class="tag">${QUIZ_STATUS_LABEL[q.status]||q.status}</span></div>
        <div class="campaign-title">${escapeHtml(q.titulo)}</div>
      </div>
    </div>
    <div class="meta-row">
      <span>PIN: <b class="mono">${q.pin}</b></span>
      <span><b>${q.totalParticipantes||0}</b> participante(s)</span>
    </div>
    <div class="card-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
      ${podeApresentar ? `<button class="btn btn-sm btn-brand btn-quiz-apresentar" data-id="${q.id}">▶ Apresentar</button>` : ''}
      ${q.status==='encerrado' ? `<button class="btn btn-sm btn-quiz-reaproveitar" data-id="${q.id}">🔁 Reaproveitar perguntas</button>` : ''}
      ${q.totalParticipantes>0 ? `<button class="btn btn-sm btn-quiz-ranking" data-id="${q.id}">🏆 Ver ranking</button>` : ''}
      <button class="btn btn-sm btn-danger btn-quiz-excluir" data-id="${q.id}">🗑 Excluir</button>
    </div>
  </div>`;
}

// ---------- Criar ----------

function quizPerguntaVazia(){
  return { enunciado:'', opcoes:['','','',''], corretaIndex:0, tempoSegundos:20 };
}

function quizGarantirDraft(){
  if(!uiState.quizDraft) uiState.quizDraft = { titulo:'', perguntas:[ quizPerguntaVazia() ] };
}

// Lê os campos atuais do DOM de volta pro uiState.quizDraft — chamado antes
// de QUALQUER ação que force um re-render estrutural (adicionar/remover
// pergunta, salvar), pra não perder o que já foi digitado nas outras
// perguntas quando o formulário inteiro é remontado.
function quizScrapeDraftFromDom(){
  const d = uiState.quizDraft;
  if(!d) return;
  const tituloEl = document.getElementById('quiz-novo-titulo');
  if(tituloEl) d.titulo = tituloEl.value;
  d.perguntas.forEach((p,idx)=>{
    const enEl = document.getElementById(`quiz-novo-enunciado-${idx}`);
    if(enEl) p.enunciado = enEl.value;
    p.opcoes = p.opcoes.map((atual,oi)=>{
      const el = document.getElementById(`quiz-novo-opcao-${idx}-${oi}`);
      return el ? el.value : atual;
    });
    const tempoEl = document.getElementById(`quiz-novo-tempo-${idx}`);
    if(tempoEl) p.tempoSegundos = Number(tempoEl.value)||20;
    const corretaEl = document.querySelector(`input[name="quiz-novo-correta-${idx}"]:checked`);
    if(corretaEl) p.corretaIndex = Number(corretaEl.value);
  });
}

function quizCriarHtml(){
  quizGarantirDraft();
  const d = uiState.quizDraft;
  const perguntasHtml = d.perguntas.map((p,idx)=>quizPerguntaFormHtml(p,idx,d.perguntas.length>1)).join('');
  return `
  <div class="section-title">Novo quiz
    <span class="spacer" style="flex:1;"></span>
    <button class="btn btn-sm" id="btnQuizCancelarNovo">✕ Cancelar</button>
  </div>
  <div class="card" style="margin-bottom:14px;">
    <div class="field"><label>Título do quiz</label><input type="text" id="quiz-novo-titulo" value="${escapeHtml(d.titulo)}" placeholder="ex: Quiz de segurança — Agosto"></div>
  </div>
  ${perguntasHtml}
  <div style="display:flex;gap:8px;margin:14px 0;">
    <button class="btn btn-sm" id="btnQuizAddPergunta">+ Adicionar pergunta</button>
  </div>
  <button class="btn btn-brand" id="btnQuizSalvarNovo">Criar quiz</button>
  <div id="quizNovoErro" class="login-error" style="display:none;margin-top:10px;"></div>`;
}

function quizPerguntaFormHtml(p, idx, podeRemover){
  const opcoesHtml = p.opcoes.map((o,oi)=>`
    <div class="field" style="flex:1;min-width:200px;">
      <label style="display:flex;align-items:center;gap:6px;font-weight:${p.corretaIndex===oi?'700':'400'};">
        <input type="radio" name="quiz-novo-correta-${idx}" value="${oi}" ${p.corretaIndex===oi?'checked':''}>
        Opção ${oi+1}${p.corretaIndex===oi?' — correta':''}
      </label>
      <input type="text" id="quiz-novo-opcao-${idx}-${oi}" value="${escapeHtml(o)}" placeholder="Texto da opção ${oi+1}" style="border-left:3px solid ${QUIZ_CORES[oi]};">
    </div>`).join('');
  return `
  <div class="card" style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <b>Pergunta ${idx+1}</b>
      ${podeRemover ? `<button class="btn btn-sm btn-danger btn-quiz-remove-pergunta" data-idx="${idx}">🗑 Remover</button>` : ''}
    </div>
    <div class="field" style="margin-top:8px;"><label>Enunciado</label><textarea id="quiz-novo-enunciado-${idx}" rows="2" style="width:100%;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:10px;" placeholder="Digite a pergunta...">${escapeHtml(p.enunciado)}</textarea></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">${opcoesHtml}</div>
    <div class="field" style="margin-top:8px;max-width:170px;"><label>Tempo (segundos)</label><input type="number" id="quiz-novo-tempo-${idx}" min="5" max="120" value="${p.tempoSegundos}"></div>
  </div>`;
}

// ---------- Apresentar (host) ----------

function quizGarantirPolling(id){
  if(_quizPollTimer && _quizPollId===id) return;
  quizPararPolling();
  _quizPollId = id;
  const tick = async ()=>{
    try{ uiState.quizApresentarDados = await apiGetQuiz(id); }
    catch(e){ /* falha de rede pontual — mantém o último estado bom até o próximo tick */ }
    if(activeNavKey==='quiz' && uiState.quizView==='apresentar' && uiState.quizApresentandoId===id) renderMain();
    else quizPararPolling();
  };
  tick();
  _quizPollTimer = setInterval(tick, 1500);
}

function quizPararPolling(){
  if(_quizPollTimer){ clearInterval(_quizPollTimer); _quizPollTimer = null; _quizPollId = null; }
}

function quizRespostasAtuais(dados){ return dados.respostasAtuais || []; }

function quizDistribuicaoHost(dados){
  const d = [0,0,0,0];
  quizRespostasAtuais(dados).forEach(r=>{ if(d[r.opcaoIndex]!==undefined) d[r.opcaoIndex]++; });
  return d;
}

function quizApresentarHtml(){
  const dados = uiState.quizApresentarDados;
  if(!dados) return `<div class="section-title">Apresentando quiz</div><div class="empty">Carregando...</div>`;
  const totalPerguntas = dados.perguntas.length;
  const perguntaAtual = dados.perguntas[dados.perguntaAtualIndex] || null;
  let corpo = '';

  if(dados.status==='lobby'){
    corpo = `
    <div class="quiz-pin-display">
      <div class="quiz-pin-label">PIN do quiz</div>
      <div class="quiz-pin-numero mono">${dados.pin}</div>
      <div class="help-text">Participantes entram em "Entrar em um quiz", na tela de login.</div>
    </div>
    <div class="section-title" style="margin-top:22px;">${dados.participantes.length} participante(s) já entraram</div>
    <div class="quiz-lobby-participantes">${dados.participantes.map(p=>`<span class="tag">${escapeHtml(p.nome)}</span>`).join('') || '<span class="help-text">Aguardando...</span>'}</div>`;
  } else if(dados.status==='pergunta' && perguntaAtual){
    const fim = dados.perguntaIniciadaEm + perguntaAtual.tempoSegundos*1000;
    const respondidos = quizRespostasAtuais(dados).length;
    corpo = `
    <div class="quiz-host-pergunta">
      <div class="quiz-timer-bar">⏱ <span class="mono" data-quiz-countdown-fim="${fim}">--</span>s</div>
      <div class="quiz-host-enunciado">${escapeHtml(perguntaAtual.enunciado)}</div>
      <div class="quiz-option-grid">
        ${perguntaAtual.opcoes.map((o,oi)=>`<div class="quiz-option-btn" style="background:${QUIZ_CORES[oi]};">${escapeHtml(o)}</div>`).join('')}
      </div>
      <div class="quiz-host-status">${respondidos}/${dados.participantes.length} responderam</div>
    </div>`;
  } else if(dados.status==='revelacao' && perguntaAtual){
    const distrib = quizDistribuicaoHost(dados);
    const totalResp = distrib.reduce((a,b)=>a+b,0) || 1;
    corpo = `
    <div class="quiz-host-pergunta">
      <div class="quiz-host-enunciado">${escapeHtml(perguntaAtual.enunciado)}</div>
      <div class="quiz-option-grid">
        ${perguntaAtual.opcoes.map((o,oi)=>`
          <div class="quiz-option-btn ${oi===perguntaAtual.corretaIndex?'quiz-option-correta':'quiz-option-errada'}" style="background:${QUIZ_CORES[oi]};">
            <span>${escapeHtml(o)} ${oi===perguntaAtual.corretaIndex?'✓':''}</span>
            <span class="quiz-option-count">${distrib[oi]} · ${Math.round(100*distrib[oi]/totalResp)}%</span>
          </div>`).join('')}
      </div>
    </div>`;
  } else if(dados.status==='ranking'){
    const ranking = dados.participantes.slice().sort((a,b)=>b.pontuacao-a.pontuacao).slice(0,10);
    corpo = `
    <div class="section-title">${dados.perguntaAtualIndex>=totalPerguntas-1 ? 'Ranking final' : 'Ranking'}</div>
    <div class="quiz-ranking-list">
      ${ranking.map((p,i)=>`<div class="quiz-ranking-item">${quizPodioMedalha(i)}<span class="quiz-ranking-nome">${escapeHtml(p.nome)}</span><span class="mono">${p.pontuacao} pts</span></div>`).join('') || '<div class="empty">Ninguém pontuou ainda.</div>'}
    </div>`;
  } else {
    corpo = `<div class="empty">Quiz encerrado. Obrigado por jogar!</div>`;
  }

  const labelAvancar = dados.status==='lobby' ? 'Iniciar quiz'
    : dados.status==='pergunta' ? 'Revelar resposta'
    : dados.status==='revelacao' ? 'Ver ranking'
    : dados.status==='ranking' ? (dados.perguntaAtualIndex>=totalPerguntas-1 ? 'Encerrar quiz' : 'Próxima pergunta')
    : null;

  return `
  <div class="section-title">${escapeHtml(dados.titulo)}
    <span class="spacer" style="flex:1;"></span>
    <button class="btn btn-sm" id="btnQuizSairApresentacao">✕ Sair da apresentação</button>
  </div>
  ${corpo}
  ${labelAvancar ? `<button class="btn btn-brand" id="btnQuizAvancar" style="margin-top:18px;">${labelAvancar} →</button>` : ''}`;
}

function quizPodioMedalha(i){
  if(i===0) return '<span class="quiz-ranking-pos">🥇</span>';
  if(i===1) return '<span class="quiz-ranking-pos">🥈</span>';
  if(i===2) return '<span class="quiz-ranking-pos">🥉</span>';
  return `<span class="quiz-ranking-pos">${i+1}º</span>`;
}

// Modal de ranking a partir da LISTA (botão "Ver ranking" no card, ver
// btnQuizNovo etc. em events.js) — útil sobretudo pra quiz já encerrado,
// que não tem mais botão "Apresentar" pra reabrir o ranking ao vivo.
// `dados` vem de apiGetQuiz (já traz participantes ordenados por pontuação).
function quizRankingModalHtml(dados){
  const ranking = (dados.participantes||[]).slice(0,10);
  return `
  <h3>${escapeHtml(dados.titulo)} — Ranking</h3>
  <div class="quiz-ranking-list" style="margin-top:12px;">
    ${ranking.map((p,i)=>`<div class="quiz-ranking-item">${quizPodioMedalha(i)}<span class="quiz-ranking-nome">${escapeHtml(p.nome)}</span><span class="mono">${p.pontuacao} pts</span></div>`).join('') || '<div class="empty">Ninguém pontuou.</div>'}
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" data-modal-cancel>Fechar</button></div>`;
}
