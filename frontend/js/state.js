/* Estado global da aplicação: sessão, DB em memória e persistência via API. */

// API_BASE e firebaseConfig ficam em js/config.js. Cada recurso (users,
// baseMestra, ausencias, etc.) tem endpoint próprio — ver backend/src/routes/.

const HOURS = ['19:00','20:00','21:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00'];

const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sab'];


let DB = null;

let session = null;

let uiState = {
  analistaView:'diaria', analistaDate: todayISO(), analistaOpFiltro: 'all',
  gradeFilters:{ data: todayISO(), hora:'all', analista:'all', op:'all', nome:'all', status:'all' },
  metricasFiltro:{ inicio: addDaysISO(todayISO(), -7), fim: todayISO() },
  envioFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO() },
  ocorrenciasFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), analista: 'all', operacao: 'all', avaliacaoMax: '' },
  suplenciasFiltro:{ operacao:'', horario:'', suplente:'all', cobrindo:'all', inicio:'', fim:'' },
  progAnalista:'all', progDate: todayISO(), progView:'diaria',
  sugerir: null, inboxSelected: null, lembretesDate: todayISO(), lembretesView: 'semanal'
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


// Todo endpoint /api/* exige um Firebase ID token (ver backend/src/middleware/auth.js).
async function authHeaders(){
  const token = await KronoAuth.getIdToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Só é chamada depois de um login real (Firebase Auth) bem-sucedido.
//
// Todo recurso já foi migrado do blob genérico para o endpoint próprio (ver
// docs/ROADMAP.md, item 4) — /api/state hoje não é mais consultado. Isso
// mantém a MESMA forma de DB.* que o resto do frontend sempre leu, só troca
// de onde o dado vem. Se o backend não responder, propaga o erro — quem
// chama (main.js) mostra isso na tela de login, sem fallback silencioso.
async function loadDB(){
  const [users, raioX, baseMestra, ausencias, suplencias, recados, reunioes, plantoes, lembretes, feedbacks] = await Promise.all([
    apiRequest('GET', '/users'),
    apiRequest('GET', '/raio-x'),
    apiRequest('GET', '/base-mestra'),
    apiRequest('GET', '/ausencias'),
    apiRequest('GET', '/suplencias'),
    apiRequest('GET', '/recados'),
    apiRequest('GET', '/reunioes'),
    apiRequest('GET', '/plantoes'),
    apiRequest('GET', '/lembretes'),
    apiRequest('GET', '/feedbacks'),
  ]);
  DB = { users, raioX, baseMestra, ausencias, suplencias, recados, reunioes, plantoes, lembretes, feedbacks };
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

// reunioes — só criação, não há edição/exclusão na UI.
const apiCreateReuniao = (data) => apiRequest('POST', '/reunioes', data);

// plantoes — só criação, não há edição/exclusão na UI.
const apiCreatePlantao = (data) => apiRequest('POST', '/plantoes', data);

// lembretes
const apiCreateLembrete = (data) => apiRequest('POST', '/lembretes', data);
const apiUpdateLembrete = (id, patch) => apiRequest('PATCH', `/lembretes/${id}`, patch);
const apiDeleteLembrete = (id) => apiRequest('DELETE', `/lembretes/${id}`);

// feedbacks — analista cria, só coordenador lista/exclui na UI.
const apiCreateFeedback = (data) => apiRequest('POST', '/feedbacks', data);
const apiDeleteFeedback = (id) => apiRequest('DELETE', `/feedbacks/${id}`);

