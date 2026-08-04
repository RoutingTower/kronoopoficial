/* Estado global da aplicação: sessão, DB em memória e persistência via API. */

// API_BASE e firebaseConfig ficam em js/config.js. Cada recurso (users,
// baseMestra, ausencias, etc.) tem endpoint próprio — ver backend/src/routes/.

const HOURS = ['19:00','20:00','21:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00'];

const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sab'];


let DB = null;

let session = null;

let uiState = {
  analistaView:'diaria', analistaDate: hojeAgendaISO(), analistaOpFiltro: 'all',
  gradeFilters:{ data: hojeAgendaISO(), hora:'all', analista:'all', op:'all', nome:'all', status:'all' },
  // analistas:[] = "Todos". Preenchido = só os ids selecionados no
  // dropdown de multi-seleção (ver supMetricas em render-supervisor.js).
  metricasFiltro:{ inicio: addDaysISO(todayISO(), -7), fim: todayISO(), analistas: [] },
  metricasAnalistaDropdownOpen: false,
  envioFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO() },
  ocorrenciasFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), analista: 'all', operacao: 'all', avaliacaoMax: '' },
  suplenciasFiltro:{ operacao:'', horario:'', suplente:'all', cobrindo:'all', inicio:'', fim:'' },
  progAnalista:'all', progDate: hojeAgendaISO(), progView:'diaria',
  sugerir: null, inboxSelected: null, lembretesDate: todayISO(), lembretesView: 'semanal',
  // Linhas de importação em massa (Excel) cujo nome de analista não bateu
  // com ninguém da equipe — { tipo:'basemestra'|'suplencias', items:[...] }.
  // Mostrado como banner no topo da tela até o supervisor resolver ou
  // descartar (ver renderImportPendentesBanner em render-supervisor.js).
  importPendentes: null,
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


// Todo endpoint /api/* exige um Firebase ID token (ver backend/src/middleware/auth.js).
async function authHeaders(){
  const token = await KronoAuth.getIdToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Só são chamadas depois de um login real (Firebase Auth) bem-sucedido, via
// loadDBCached() abaixo.
//
// Todo recurso já foi migrado do blob genérico para o endpoint próprio (ver
// docs/ROADMAP.md, item 4) — /api/state hoje não é mais consultado. Isso
// mantém a MESMA forma de DB.* que o resto do frontend sempre leu, só troca
// de onde o dado vem. Se o backend não responder, propaga o erro — quem
// chama (main.js) mostra isso na tela de login, sem fallback silencioso.
//
// Split em duas partes com comportamento de leitura BEM diferente — ver
// DB_CACHE_TTL_MS logo abaixo pro motivo de existir cache:
//
// - "Cacheável" (users, baseMestra, suplencias, sprs): ~814 dos ~893
//   documentos hoje (91%). Dado de escala/cadastro, muda pouco minuto a
//   minuto — cachear por 24h é seguro.
// - "Sempre fresco" (raioX, ausencias, recados, reunioes, plantoes,
//   lembretes, feedbacks): só ~79 documentos (9%), mas alimenta painéis de
//   status/compliance (ex.: "Pendente Raio-X" na Grade do Dia) — CACHEAR
//   ISSO CAUSA FALSO-PENDENTE: um analista finaliza a operação, mas quem tá
//   vendo o painel com DB cacheado de horas atrás não vê a finalização até
//   o cache expirar ou alguém clicar "Atualizar dados" (achado real, ver
//   incidente do Areli em 04/08/2026 — Raio-X dele já existia no banco e a
//   tela ainda mostrava pendente). Como é barato (9% do total), busca de
//   novo em toda chamada de loadDBCached(), cache ou não.
async function loadDBFresh(){
  const [raioX, ausencias, recados, reunioes, plantoes, lembretes, feedbacks] = await Promise.all([
    apiRequest('GET', '/raio-x'),
    apiRequest('GET', '/ausencias'),
    apiRequest('GET', '/recados'),
    apiRequest('GET', '/reunioes'),
    apiRequest('GET', '/plantoes'),
    apiRequest('GET', '/lembretes'),
    apiRequest('GET', '/feedbacks'),
  ]);
  return { raioX, ausencias, recados, reunioes, plantoes, lembretes, feedbacks };
}

async function loadDBCacheable(){
  const [users, baseMestra, suplencias, sprs] = await Promise.all([
    apiRequest('GET', '/users'),
    apiRequest('GET', '/base-mestra'),
    apiRequest('GET', '/suplencias'),
    apiRequest('GET', '/sprs'),
  ]);
  return { users, baseMestra, suplencias, sprs };
}

// Cache local só da parte "cacheável" acima — motivo: o Firestore (plano
// gratuito) tem uma cota DIÁRIA de leituras, e cada login/F5 buscava as 11
// coleções inteiras do zero, contando 1 leitura por documento. Com o time
// inteiro recarregando várias vezes ao dia, isso estourou a cota e travou
// o acesso de todo mundo (incidente de 04/08/2026). TTL de 24h — alinhado
// com o reset diário da cota, escolhido deliberadamente pra cortar
// leituras repetidas enquanto o projeto não migra pro Supabase (ver
// docs/MIGRACAO-SUPABASE.md). Mudanças feitas na PRÓPRIA aba continuam
// instantâneas (todo create/update/delete já atualiza o DB em memória
// direto, sem precisar buscar de novo) — a janela de até 24h só afeta ver
// mudanças feitas por OUTRA pessoa/aba nesse meio tempo, e só na parte
// cacheável (a parte "sempre fresco" já cobre painéis de status). Ver
// botão "Atualizar dados" em Configurações pra forçar uma busca nova
// quando precisar de dado fresco mesmo assim.
const DB_CACHE_KEY = 'kronoop-db-cache';
const DB_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function readDBCache(){
  try{
    const raw = localStorage.getItem(DB_CACHE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.savedAt || !parsed.data) return null;
    if(Date.now() - parsed.savedAt > DB_CACHE_TTL_MS) return null;
    return parsed.data;
  }catch(e){ return null; }
}

function writeDBCache(data){
  try{ localStorage.setItem(DB_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); }
  catch(e){ /* localStorage cheio/indisponível — segue sem cache, não quebra o app */ }
}

function clearDBCache(){
  try{ localStorage.removeItem(DB_CACHE_KEY); }catch(e){}
}

// Usa o cache local pra parte cacheável se existir e ainda for válido;
// senão busca ela do zero e atualiza o cache. A parte "sempre fresco" é
// buscada em toda chamada, cache ou não (ver loadDBFresh() acima).
// forceRefresh=true ignora o cache da parte cacheável — usado pelo botão
// "Atualizar dados".
//
// _loadDBInFlight faz as chamadas concorrentes reaproveitarem a MESMA
// busca em vez de disparar uma pra cada — o onAuthStateChanged do
// Firebase (main.js) pode disparar duas vezes em sequência rápida no
// mesmo login, e sem isso cada uma iniciava sua própria busca, dobrando à
// toa as leituras cobradas nesse login (achado ao investigar o incidente
// de cota de 04/08/2026).
let _loadDBInFlight = null;
async function loadDBCached(forceRefresh){
  if(_loadDBInFlight) return _loadDBInFlight;
  _loadDBInFlight = (async ()=>{
    const freshPromise = loadDBFresh();
    let cacheable = !forceRefresh ? readDBCache() : null;
    if(!cacheable){
      cacheable = await loadDBCacheable();
      writeDBCache(cacheable);
    }
    const fresh = await freshPromise;
    DB = { ...cacheable, ...fresh };
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
async function apiRequest(method, path, body, _attempt){
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
    return apiRequest(method, path, body, attempt+1);
  }
  if(!res.ok){
    const parsed = await res.json().catch(()=>({}));
    throw new Error(parsed.message || `${method} ${path} -> ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// users — criação/edição/exclusão têm que passar por aqui porque só o
// backend sabe criar/atualizar/apagar a conta correspondente no Firebase
// Auth — ver backend/src/controllers/users.controller.js.
const apiCreateUser = (data) => apiRequest('POST', '/users', data);
const apiUpdateUser = (id, patch) => apiRequest('PATCH', `/users/${id}`, patch);
const apiDeleteUser = (id) => apiRequest('DELETE', `/users/${id}`);

// raioX — finalização de operação é imutável (sem PATCH); o backend valida
// estrelas (1–5) e observação (≥150 caracteres) de novo, mesmo já validados
// no frontend — ver backend/src/controllers/raioX.controller.js.
const apiCreateRaioX = (data) => apiRequest('POST', '/raio-x', data);

// baseMestra
const apiCreateBaseMestra = (data) => apiRequest('POST', '/base-mestra', data);
const apiUpdateBaseMestra = (id, patch) => apiRequest('PATCH', `/base-mestra/${id}`, patch);
const apiDeleteBaseMestra = (id) => apiRequest('DELETE', `/base-mestra/${id}`);

// ausencias
const apiCreateAusencia = (data) => apiRequest('POST', '/ausencias', data);

// suplencias
const apiCreateSuplencia = (data) => apiRequest('POST', '/suplencias', data);
const apiUpdateSuplencia = (id, patch) => apiRequest('PATCH', `/suplencias/${id}`, patch);
const apiDeleteSuplencia = (id) => apiRequest('DELETE', `/suplencias/${id}`);

// recados
const apiCreateRecado = (data) => apiRequest('POST', '/recados', data);
const apiUpdateRecado = (id, patch) => apiRequest('PATCH', `/recados/${id}`, patch);
const apiDeleteRecado = (id) => apiRequest('DELETE', `/recados/${id}`);

// reunioes
const apiCreateReuniao = (data) => apiRequest('POST', '/reunioes', data);
const apiUpdateReuniao = (id, patch) => apiRequest('PATCH', `/reunioes/${id}`, patch);
const apiDeleteReuniao = (id) => apiRequest('DELETE', `/reunioes/${id}`);

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

// feedbacks — analista cria, só coordenador lista/exclui na UI.
const apiCreateFeedback = (data) => apiRequest('POST', '/feedbacks', data);
const apiDeleteFeedback = (id) => apiRequest('DELETE', `/feedbacks/${id}`);

