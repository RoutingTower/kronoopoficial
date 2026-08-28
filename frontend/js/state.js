/* Estado global da aplicação: sessão, DB em memória e persistência via API. */

// API_BASE e firebaseConfig ficam em js/config.js. Cada recurso (users,
// baseMestra, ausencias, etc.) tem endpoint próprio — ver backend/src/routes/.

const HOURS = ['19:00','20:00','21:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00'];

// Mesmo intervalo do turno (19h–06h) que HOURS, só que de 20 em 20 minutos
// — usado no horário de início da reunião (mais granular que a operação,
// que roda hora a hora). Mantido dentro do range de HOURS de propósito:
// renderFlashcardRow (render-analista.js) encaixa a reunião na coluna do
// kanban por prefixo de hora (ex.: "19:20" cai na coluna "19:00"); um
// horário fora desse intervalo simplesmente não apareceria lá.
const REUNIAO_HORAS = (()=>{
  const out = [];
  let h = 19, m = 0;
  while(true){
    const s = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    out.push(s);
    if(s==='06:00') break;
    m += 20;
    if(m>=60){ m = 0; h = (h+1)%24; }
  }
  return out;
})();

const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sab'];


let DB = null;

let session = null;

let uiState = {
  analistaView:'diaria', analistaDate: hojeAgendaISO(), analistaOpFiltro: 'all',
  // Kanban (colunas por horário, rolagem horizontal) ou lista (linhas
  // verticais) na visão Diária da Programação — ver renderFlashcardRow.
  analistaDiariaLayout: 'kanban',
  gradeFilters:{ data: hojeAgendaISO(), hora:'all', analista:'all', op:'all', nome:'all', status:'all' },
  // analistas:[] = "Todos" (supervisor filtra por analista da própria
  // equipe, ver supMetricas). supervisores:[] = "Todos" (coordenador filtra
  // por supervisor — expande pra equipe de cada um, ver coordMetricas em
  // render-coordenador.js). Preenchido = só os ids selecionados no
  // dropdown de multi-seleção correspondente.
  metricasFiltro:{ inicio: addDaysISO(todayISO(), -7), fim: todayISO(), analistas: [], supervisores: [] },
  metricasAnalistaDropdownOpen: false,
  metricasSupervisorDropdownOpen: false,
  // Telas do Coordenador (render-coordenador.js): supervisores:[] = "Todos"
  // em cada filtro abaixo, mesmo padrão de metricasFiltro.supervisores.
  dashboardFiltro:{ supervisores: [] },
  dashboardSupervisorDropdownOpen: false,
  painelFiltro:{ data: hojeAgendaISO(), supervisores: [] },
  painelSupervisorDropdownOpen: false,
  anomaliasFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), supervisor: 'all', operacao: 'all' },
  statusFiltro:{ supervisores: [] },
  statusSupervisorDropdownOpen: false,
  // Resultado SPR (supResultadoSPR/coordResultadoSPR) — analistas:[] usado
  // pelo supervisor, supervisores:[] pelo coordenador (mesmo padrão de
  // metricasFiltro acima).
  sprFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), operacao: 'all', regional: 'all', semana: '', analistas: [], supervisores: [], sprMin: '', sprMax: '' },
  sprAnalistaDropdownOpen: false,
  sprSupervisorDropdownOpen: false,
  // 'painel' = dashboard de sempre (KPIs/gráficos/tabelas agregadas);
  // 'ranking' = lista de cada operação finalizada, ordenada por SPR
  // Lançado — pensado pro relatório de fim de turno (quem ficou muito
  // abaixo/acima da meta), ver sprResultadoBody em render-supervisor.js.
  sprView: 'painel',
  tempoFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), operacao: 'all', semana: '', analistas: [], supervisores: [] },
  tempoAnalistaDropdownOpen: false,
  tempoSupervisorDropdownOpen: false,
  envioFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO() },
  ocorrenciasFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), analista: 'all', operacao: 'all', avaliacaoMax: '' },
  suplenciasFiltro:{ operacao:'', horario:'', suplente:'all', cobrindo:'all', inicio:'', fim:'' },
  baseMestraFiltro:{ operacao:'', horario:'', titular:'all', vigenciaInicio:'', vigenciaFim:'' },
  progAnalista:'all', progDate: hojeAgendaISO(), progView:'diaria', progStatusFiltro: null,
  reunioesDate: hojeAgendaISO(), reunioesView:'mensal',
  domingosMes: todayISO(),
  particularidadesFiltro: { operacao: '', analista: 'all' },
  sugerir: null, alocarAuto: null, folgaEscolhaDraft: {}, progMoves: [], progMovesExpandido: false, inboxSelected: null,
  // Gerar Escala de Fim de Semana (ver gerarEscalaFDS em utils.js): sábado
  // âncora (domingo = sábado+1, sempre tratados como par) + quem foi
  // escalado pra trabalhar em CADA dia (listas separadas — quem trabalha
  // um dia não pode aparecer na do outro, é a regra de folga cruzada) e o
  // resultado (proposta editável) de cada dia depois de clicar em "Gerar
  // escala". Um dia sem ninguém selecionado fica com resultado null (não
  // gera proposta pra ele).
  // Gerar Escala de Domingo (ver supGerarEscalaDomingo, render-supervisor.js):
  // até 4 domingos de um mês, revezando dois grupos fixos (A no 1º/3º
  // domingo marcado, B no 2º/4º) — um analista pode estar nos dois grupos
  // de propósito (cobre toda vez, sem folga cruzada entre eles).
  escalaDomMes: null,
  escalaDomDomingosSel: [],
  escalaDomGrupoA: [],
  escalaDomGrupoB: [],
  escalaDomResultados: {}, // data (ISO) -> {data, grupo, escalados, linhas}
  // Gerar Escala do Mês (ver gerarEscalaMensal em utils.js): mês-alvo
  // ("YYYY-MM", padrão o próximo) + o resultado (proposta editável) depois
  // de clicar em "Gerar escala" — null até o primeiro clique.
  escalaMensalMes: null,
  escalaMensalResultado: null,
  // Formulários (Convocações) — supervisor: form de nova/editar aberto +
  // quais respostas estão expandidas na lista. Ver render-supervisor.js/
  // render-analista.js (formulariosScreen) e events.js.
  formulariosEditingId: null,
  formulariosShowNew: false,
  formulariosExpanded: {},
  // Linhas de importação em massa (Excel) cujo nome de analista não bateu
  // com ninguém da equipe — { tipo:'basemestra'|'suplencias', items:[...] }.
  // Mostrado como banner no topo da tela até o supervisor resolver ou
  // descartar (ver renderImportPendentesBanner em render-supervisor.js).
  importPendentes: null,
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


// Todo endpoint /api/* exige um Supabase ID token (ver backend/src/middleware/auth.js).
//
// _tokenInFlight faz chamadas concorrentes reaproveitarem a MESMA busca de
// token em vez de cada uma pedir a sua (mesmo padrão de _loadDBInFlight,
// acima) — loadDB() sozinho dispara 17 chamadas em paralelo, e cada uma
// batia em getIdToken() por conta própria. Se o access_token estivesse
// vencido bem nessa hora, as 17 podiam tentar renovar a sessão ao mesmo
// tempo — o Supabase invalida o refresh_token depois do primeiro uso, então
// só a primeira tentativa vingava e as outras 16 liam a sessão como
// expirada de verdade, mesmo ela tendo acabado de ser renovada por uma
// irmã sua. Como todas as 17 chamam authHeaders() de forma síncrona (antes
// de qualquer uma ceder o controle num await), a segunda em diante já
// encontra _tokenInFlight preenchido e espera a mesma promise em vez de
// disparar a sua.
let _tokenInFlight = null;
let _refreshSessionInFlight = null; // usado pelo retry de 401 em apiRequest, mais abaixo
async function authHeaders(){
  if(!_tokenInFlight){
    _tokenInFlight = KronoAuth.getIdToken().finally(()=>{ _tokenInFlight = null; });
  }
  const token = await _tokenInFlight;
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Só é chamada depois de um login real (Supabase Auth) bem-sucedido, via
// loadDB() abaixo. Busca as 11 coleções direto do backend a cada chamada —
// sem cache local: o Postgres do Supabase não tem cota diária de leitura
// (motivo pelo qual um cache de 24h existiu aqui antes, enquanto o banco
// era o Firestore — ver docs/MIGRACAO-SUPABASE.md). Cachear causava dado
// desatualizado/cruzado entre abas (achado real: incidente do Areli em
// 04/08/2026, Raio-X finalizado que a tela de outra pessoa ainda mostrava
// como pendente).
//
// Todo recurso já foi migrado do blob genérico para o endpoint próprio (ver
// docs/ROADMAP.md, item 4) — mantém a MESMA forma de DB.* que o resto do
// frontend sempre leu, só troca de onde o dado vem. Se o backend não
// responder, propaga o erro — quem chama (main.js) mostra isso na tela de
// login, sem fallback silencioso.
//
// _loadDBInFlight faz chamadas concorrentes reaproveitarem a MESMA busca em
// vez de disparar uma pra cada — o onAuthStateChanged (main.js) pode
// disparar duas vezes em sequência rápida no mesmo login.
let _loadDBInFlight = null;
async function loadDB(){
  if(_loadDBInFlight) return _loadDBInFlight;
  _loadDBInFlight = (async ()=>{
    const [users, baseMestra, suplencias, sprs, raioX, roteirizacaoStatus, ausencias, recados, reunioes, plantoes, lembretes, feedbacks, particularidades, particularidadeCiente, reuniaoPresenca, formularios, formularioRespostas] = await Promise.all([
      apiRequest('GET', '/users'),
      apiRequest('GET', '/base-mestra'),
      apiRequest('GET', '/suplencias'),
      apiRequest('GET', '/sprs'),
      apiRequest('GET', '/raio-x'),
      apiRequest('GET', '/roteirizacao-status'),
      apiRequest('GET', '/ausencias'),
      apiRequest('GET', '/recados'),
      apiRequest('GET', '/reunioes'),
      apiRequest('GET', '/plantoes'),
      apiRequest('GET', '/lembretes'),
      apiRequest('GET', '/feedbacks'),
      apiRequest('GET', '/particularidades'),
      apiRequest('GET', '/particularidade-ciente'),
      apiRequest('GET', '/reuniao-presenca'),
      apiRequest('GET', '/formularios'),
      apiRequest('GET', '/formulario-respostas'),
    ]);
    DB = { users, baseMestra, suplencias, sprs, raioX, roteirizacaoStatus, ausencias, recados, reunioes, plantoes, lembretes, feedbacks, particularidades, particularidadeCiente, reuniaoPresenca, formularios, formularioRespostas };
  })();
  try{ await _loadDBInFlight; }
  finally{ _loadDBInFlight = null; }
}

// Chamada genérica a um endpoint por recurso (ex.: /users, /raio-x) — usada
// pelos recursos já migrados do blob genérico (ver docs/ROADMAP.md, item 4).
// Lança com a mensagem amigável que o backend manda em {message}.
//
// Reexperimenta em caso de falha de rede (fetch rejeita, sem nem chegar a
// resposta HTTP) — o backend no Render (plano free) "dorme" após ~15min
// parado, e o primeiro acesso do dia recusa conexão por alguns segundos
// enquanto o container sobe (ver docs/COMO-PUBLICAR.md → "Nota sobre o
// plano gratuito"). Sem isso, esse primeiro acesso falhava direto.
async function apiRequest(method, path, body, _attempt, _refreshed){
  const attempt = _attempt || 0;
  let res;
  try{
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers:{ 'Content-Type':'application/json', ...(await authHeaders()) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }catch(networkErr){
    if(attempt >= 6) throw networkErr; // ~30s tentando — cobre o cold-start documentado (30-50s)
    await new Promise(r=>setTimeout(r, 5000));
    return apiRequest(method, path, body, attempt+1, _refreshed);
  }
  // 401 pode ser só o access_token vencido numa aba aberta há muito tempo
  // (ex.: virada da madrugada) — tenta renovar a sessão UMA vez e refaz a
  // chamada antes de desistir, pra não perder o que a pessoa preencheu num
  // modal (ex.: Raio-X) por causa de um token vencido evitável. Mesmo
  // reaproveitamento de promise em voo do authHeaders() acima: um burst de
  // chamadas (ex.: loadDB) pode voltar 401 quase junto, e cada uma tentando
  // renovar por conta própria esbarra no refresh_token de uso único do
  // Supabase (só a primeira vinga).
  if(res.status === 401 && !_refreshed){
    if(!_refreshSessionInFlight) _refreshSessionInFlight = KronoAuth.refreshSession().finally(()=>{ _refreshSessionInFlight = null; });
    const renovou = await _refreshSessionInFlight;
    if(renovou) return apiRequest(method, path, body, attempt, true);
  }
  if(!res.ok){
    if(res.status === 401){
      throw new Error('Sua sessão expirou. Atualize a página (F5) e faça login de novo antes de tentar de novo.');
    }
    const parsed = await res.json().catch(()=>({}));
    const err = new Error(parsed.message || `${method} ${path} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// users — criação/edição/exclusão têm que passar por aqui porque só o
// backend sabe criar/atualizar/apagar a conta correspondente no Supabase
// Auth — ver backend/src/controllers/users.controller.js.
const apiCreateUser = (data) => apiRequest('POST', '/users', data);
const apiUpdateUser = (id, patch) => apiRequest('PATCH', `/users/${id}`, patch);
const apiDeleteUser = (id) => apiRequest('DELETE', `/users/${id}`);

// raioX — finalização de operação é imutável (sem PATCH); o backend valida
// estrelas (1–5) e observação (≥150 caracteres) de novo, mesmo já validados
// no frontend — ver backend/src/controllers/raioX.controller.js.
const apiCreateRaioX = (data) => apiRequest('POST', '/raio-x', data);
// Edição/exclusão de uma finalização já fechada — hoje só o supervisor da
// equipe (ou admin) edita; excluir também vale pro próprio analista dono
// (ver raioX.controller.js).
const apiUpdateRaioX = (id, patch) => apiRequest('PATCH', `/raio-x/${id}`, patch);
const apiDeleteRaioX = (id) => apiRequest('DELETE', `/raio-x/${id}`);

// baseMestra
const apiCreateBaseMestra = (data) => apiRequest('POST', '/base-mestra', data);
const apiUpdateBaseMestra = (id, patch) => apiRequest('PATCH', `/base-mestra/${id}`, patch);
const apiDeleteBaseMestra = (id) => apiRequest('DELETE', `/base-mestra/${id}`);

// ausencias
const apiCreateAusencia = (data) => apiRequest('POST', '/ausencias', data);
const apiUpdateAusencia = (id, patch) => apiRequest('PATCH', `/ausencias/${id}`, patch);
const apiDeleteAusencia = (id) => apiRequest('DELETE', `/ausencias/${id}`);

// suplencias
const apiCreateSuplencia = (data) => apiRequest('POST', '/suplencias', data);
const apiUpdateSuplencia = (id, patch) => apiRequest('PATCH', `/suplencias/${id}`, patch);
const apiDeleteSuplencia = (id) => apiRequest('DELETE', `/suplencias/${id}`);

// recados
const apiCreateRecado = (data) => apiRequest('POST', '/recados', data);
const apiUpdateRecado = (id, patch) => apiRequest('PATCH', `/recados/${id}`, patch);
const apiDeleteRecado = (id) => apiRequest('DELETE', `/recados/${id}`);

// formularios (Convocações)
const apiCreateFormulario = (data) => apiRequest('POST', '/formularios', data);
const apiUpdateFormulario = (id, patch) => apiRequest('PATCH', `/formularios/${id}`, patch);
const apiDeleteFormulario = (id) => apiRequest('DELETE', `/formularios/${id}`);
const apiEnviarResposta = (formularioId, payload) => apiRequest('POST', '/formulario-respostas', { formularioId, payload });
const apiAprovarFerias = (respostaId) => apiRequest('POST', `/formulario-respostas/${respostaId}/aprovar`, {});
const apiRecusarFerias = (respostaId, motivo) => apiRequest('POST', `/formulario-respostas/${respostaId}/recusar`, { motivo });
const apiConfirmarCoberturaResposta = (respostaId, confirmado) => apiRequest('PATCH', `/formulario-respostas/${respostaId}/confirmar-cobertura`, { confirmado });

// reunioes
const apiCreateReuniao = (data) => apiRequest('POST', '/reunioes', data);
const apiUpdateReuniao = (id, patch) => apiRequest('PATCH', `/reunioes/${id}`, patch);
const apiDeleteReuniao = (id) => apiRequest('DELETE', `/reunioes/${id}`);

// particularidades — uma nota por Operação+Supervisor (ver "Ver
// Particularidade" no card, render-analista.js). Upsert: o backend acha o
// registro existente por (supervisorId, operacao) e atualiza, ou cria se
// for a primeira vez — por isso não tem apiUpdate/apiDelete, só esse POST.
const apiSalvarParticularidade = (data) => apiRequest('POST', '/particularidades', data);

// Confirmação pessoal de "li a particularidade" numa cobertura específica —
// ver botão "Ciente" no modal (events.js) e o selo no card (render-analista.js).
const apiMarcarCiente = (data) => apiRequest('POST', '/particularidade-ciente', data);

// Confirmação de presença numa reunião — sempre em nome de quem chama (ver
// botão "Confirmar presença" no card de reunião, render-analista.js).
const apiMarcarPresenca = (reuniaoId) => apiRequest('POST', '/reuniao-presenca', { reuniaoId });

// plantoes
const apiCreatePlantao = (data) => apiRequest('POST', '/plantoes', data);
const apiUpdatePlantao = (id, patch) => apiRequest('PATCH', `/plantoes/${id}`, patch);
const apiDeletePlantao = (id) => apiRequest('DELETE', `/plantoes/${id}`);

// sprs
const apiCreateSpr = (data) => apiRequest('POST', '/sprs', data);
const apiUpdateSpr = (id, patch) => apiRequest('PATCH', `/sprs/${id}`, patch);
const apiDeleteSpr = (id) => apiRequest('DELETE', `/sprs/${id}`);

// lembretes
const apiCreateLembrete = (data) => apiRequest('POST', '/lembretes', data);
const apiUpdateLembrete = (id, patch) => apiRequest('PATCH', `/lembretes/${id}`, patch);
const apiDeleteLembrete = (id) => apiRequest('DELETE', `/lembretes/${id}`);

// feedbacks — analista cria, só o supervisor da equipe lista/exclui na UI.
const apiCreateFeedback = (data) => apiRequest('POST', '/feedbacks', data);
const apiDeleteFeedback = (id) => apiRequest('DELETE', `/feedbacks/${id}`);

// notificacoes — sino no sidebar (ver ui.js, refreshNotificacoes). Não
// existe apiCreate aqui de propósito: quem cria é sempre o backend (ver
// esqueciSenha em notificacoes.controller.js), nunca o próprio frontend.
const apiListNotificacoes = () => apiRequest('GET', '/notificacoes');
const apiMarcarNotificacaoLida = (id) => apiRequest('PATCH', `/notificacoes/${id}`, { lida: true });
// Único endpoint que funciona sem sessão — chamado da tela de login, antes
// de existir qualquer token (ver botão "Esqueci minha senha").
const apiEsqueciSenha = (email) => apiRequest('POST', '/esqueci-senha', { email });

