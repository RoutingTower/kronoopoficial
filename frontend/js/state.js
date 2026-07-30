/* Estado global da aplicação: sessão, DB em memória e persistência via API. */

// API_BASE e firebaseConfig ficam em js/config.js. Cada recurso (users,
// baseMestra, ausencias, etc.) tem endpoint próprio — ver backend/src/routes/.

const HOURS = ['19:00','20:00','21:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00'];

const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sab'];


let DB = null;

let session = null;

let uiState = {
  analistaView:'diaria', analistaDate: todayISO(),
  gradeFilters:{ data: todayISO(), hora:'all', analista:'all', op:'all', nome:'all', status:'all' },
  metricasFiltro:{ inicio: addDaysISO(todayISO(), -7), fim: todayISO() },
  envioFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO() },
  ocorrenciasFiltro:{ inicio: addDaysISO(todayISO(), -30), fim: todayISO(), analista: 'all' },
  progAnalista:'all', progDate: todayISO(), progView:'diaria',
  sugerir: null, inboxSelected: null, lembretesDate: todayISO(), lembretesView: 'semanal'
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


function seedDB(){
  const today = new Date();
  const iso = d => d.toISOString().slice(0,10);
  const jornadaPadrao = { dias:['seg','ter','qua','qui','sex'], horaInicio:'19:00', horaFim:'01:00' };
  const analistas = [
    {id:'u_ana1', role:'analista', name:'Marina Cordeiro', email:'marina.cordeiro@kronoop.local', pass:'demo123', supervisorId:'u_sup1', active:true, jornada:{...jornadaPadrao}},
    {id:'u_ana2', role:'analista', name:'Felipe Nogueira', email:'felipe.nogueira@kronoop.local', pass:'demo123', supervisorId:'u_sup1', active:true, jornada:{...jornadaPadrao}},
    {id:'u_ana3', role:'analista', name:'Bianca Salgado', email:'bianca.salgado@kronoop.local', pass:'demo123', supervisorId:'u_sup1', active:true, jornada:{dias:['ter','qua','qui','sex','sab'], horaInicio:'20:00', horaFim:'02:00'}},
    {id:'u_ana4', role:'analista', name:'Rodrigo Peixoto', email:'rodrigo.peixoto@kronoop.local', pass:'demo123', supervisorId:'u_sup2', active:true, jornada:{...jornadaPadrao}},
  ];
  const supervisores = [
    {id:'u_sup1', role:'supervisor', name:'Camila Duarte', email:'camila.duarte@kronoop.local', pass:'demo123', coordenadorId:'u_coord1', active:true},
    {id:'u_sup2', role:'supervisor', name:'Thiago Barros', email:'thiago.barros@kronoop.local', pass:'demo123', coordenadorId:'u_coord1', active:true},
  ];
  const coordenadores = [
    {id:'u_coord1', role:'coordenador', name:'Renata Feitosa', email:'renata.feitosa@kronoop.local', pass:'demo123', active:true},
  ];
  const bm1 = {id:uid('bm'), analistaId:'u_ana1', operacao:'COL-A', ciclo:'T3', horaInicio:'19:00', horaFim:'23:00', titular:'Marina Cordeiro', dataInicio:iso(today), dataFim:'2026-12-31'};
  const bm2 = {id:uid('bm'), analistaId:'u_ana1', operacao:'ROT-N1', ciclo:'T3', horaInicio:'23:00', horaFim:'01:00', titular:'Marina Cordeiro', dataInicio:iso(today), dataFim:'2026-12-31'};
  const bm3 = {id:uid('bm'), analistaId:'u_ana2', operacao:'TRI-01', ciclo:'T3', horaInicio:'19:00', horaFim:'22:00', titular:'Felipe Nogueira', dataInicio:iso(today), dataFim:'2026-12-31'};
  const bm4 = {id:uid('bm'), analistaId:'u_ana3', operacao:'SEP-EXP', ciclo:'T3', horaInicio:'20:00', horaFim:'00:00', titular:'Bianca Salgado', dataInicio:iso(today), dataFim:'2026-12-31'};
  const bm5 = {id:uid('bm'), analistaId:'u_ana4', operacao:'ROT-N2', ciclo:'T3', horaInicio:'21:00', horaFim:'01:00', titular:'Rodrigo Peixoto', dataInicio:iso(today), dataFim:'2026-12-31'};
  const baseMestra = [bm1,bm2,bm3,bm4,bm5];
  const ausencias = [
    {id:uid('af'), analistaId:'u_ana1', baseMestraId:bm1.id, operacao:bm1.operacao, ciclo:bm1.ciclo, horaInicio:bm1.horaInicio, horaFim:bm1.horaFim, data:iso(today), tipo:'folga', suplenteId:'u_ana2'},
    {id:uid('af'), analistaId:'u_ana1', baseMestraId:bm2.id, operacao:bm2.operacao, ciclo:bm2.ciclo, horaInicio:bm2.horaInicio, horaFim:bm2.horaFim, data:iso(today), tipo:'folga', suplenteId:'u_ana3'},
  ];
  const suplencias = [
    {id:uid('sp'), operacao:'COL-B', ciclo:'T3', horaInicio:'19:00', horaFim:'23:00', suplente:'Rodrigo Peixoto', dataCobertura:iso(today), analistaOriginalId:'u_ana4'},
  ];
  const raioX = [
    {id:uid('rx'), analistaId:'u_ana2', operacao:'TRI-01', hora:'19:00', data:iso(today), estrelas:3,
      observacao:'Atraso de 12 min na fila de coleta por excesso de volume na doca 2. Roteirizador foi ajustado manualmente para redistribuir os pacotes represados e a operação foi normalizada até o fim do turno.', ts:Date.now()-3600e3},
    {id:uid('rx'), analistaId:'u_ana3', operacao:'SEP-EXP', hora:'20:00', data:iso(today), estrelas:5,
      observacao:'Operação transcorreu dentro do esperado, sem atrasos na separação. Todos os pedidos expedidos dentro do SLA e sem retrabalho na conferência final.', ts:Date.now()-2600e3},
  ];
  const recados = [
    {id:uid('rc'), from:'Camila Duarte (Supervisor)', to:'all_ana_u_sup1', texto:'Atenção: revisão de rota SEP-EXP às 22h hoje, favor confirmar leitura.', ts:Date.now()-5400e3, lidoPor:[]},
  ];
  const reunioes = [
    {id:uid('rn'), tipo:'grupo', titulo:'Alinhamento semanal da operação', data:iso(today), hora:'19:00', analistaIds:[], supervisorId:'u_sup1', criadoPor:'Camila Duarte'},
  ];
  const plantoes = [];
  const lembretes = [];
  return { users:[...analistas,...supervisores,...coordenadores], baseMestra, suplencias, ausencias, raioX, recados, reunioes, plantoes, lembretes };
}


// Todo endpoint /api/* exige um Firebase ID token (ver backend/src/middleware/auth.js).
// Sem sessão real (modo demonstração), retorna {} e as chamadas de rede nem
// são tentadas (ver checagens de session.demoMode abaixo).
async function authHeaders(){
  const token = await KronoAuth.getIdToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Só é chamada depois de um login real (Firebase Auth) bem-sucedido — o
// modo demonstração nunca fala com o backend, usa seedDB() localmente.
//
// Todo recurso já foi migrado do blob genérico para o endpoint próprio (ver
// docs/ROADMAP.md, item 4) — /api/state hoje não é mais consultado. Isso
// mantém a MESMA forma de DB.* que o resto do frontend sempre leu, só troca
// de onde o dado vem.
async function loadDB(){
  try{
    const [users, raioX, baseMestra, ausencias, suplencias, recados, reunioes, plantoes, lembretes] = await Promise.all([
      apiRequest('GET', '/users'),
      apiRequest('GET', '/raio-x'),
      apiRequest('GET', '/base-mestra'),
      apiRequest('GET', '/ausencias'),
      apiRequest('GET', '/suplencias'),
      apiRequest('GET', '/recados'),
      apiRequest('GET', '/reunioes'),
      apiRequest('GET', '/plantoes'),
      apiRequest('GET', '/lembretes'),
    ]);
    DB = { users, raioX, baseMestra, ausencias, suplencias, recados, reunioes, plantoes, lembretes };
  }catch(e){
    console.warn('KronoOP: backend indisponível, usando dados locais de demonstração.', e);
    DB = seedDB();
  }
}

// Chamada genérica a um endpoint por recurso (ex.: /users, /raio-x) — usada
// pelos recursos já migrados do blob genérico (ver docs/ROADMAP.md, item 4).
// Lança com a mensagem amigável que o backend manda em {message}.
//
// Reexperimenta em caso de falha de rede (fetch rejeita, sem nem chegar a
// resposta HTTP) — o backend no Render (plano free) "dorme" após ~15min
// parado, e o primeiro acesso do dia recusa conexão por alguns segundos
// enquanto o container sobe (ver docs/COMO-PUBLICAR.md → "Nota sobre o
// plano gratuito"). Sem isso, esse primeiro acesso caía direto no catch de
// loadDB() e trocava silenciosamente pros dados de demonstração.
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
const apiDeleteBaseMestra = (id) => apiRequest('DELETE', `/base-mestra/${id}`);

// ausencias
const apiCreateAusencia = (data) => apiRequest('POST', '/ausencias', data);
const apiUpdateAusencia = (id, patch) => apiRequest('PATCH', `/ausencias/${id}`, patch);
const apiDeleteAusencia = (id) => apiRequest('DELETE', `/ausencias/${id}`);

// suplencias
const apiCreateSuplencia = (data) => apiRequest('POST', '/suplencias', data);
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

