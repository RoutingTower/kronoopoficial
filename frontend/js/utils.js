/* Funções utilitárias puras: datas, formatação, CSV/Excel, escala do dia. */

// Serializa um Date pra 'YYYY-MM-DD' usando os componentes LOCAIS — nunca
// .toISOString() aqui, porque ele converte pra UTC: num fuso atrás de UTC
// (Brasil, UTC-3), isso adianta a data em 1 dia bem nas últimas horas da
// noite (ex.: 22h em diante), fazendo tudo que compara com "hoje" (status
// de atraso na Grade do Dia, filtros de agenda, Folga DSR etc.) pular pro
// dia seguinte antes da hora. Usar sempre esta função pra Date->string.
function dateToISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayISO(){ return dateToISO(new Date()); }

// "Hoje" pra fins de agenda/status do turno da madrugada (19h–06h): a
// virada de dia acontece às 06:00, não à meia-noite. Enquanto o turno que
// começou ontem às 19h ainda está rolando (madrugada, 00h–05h59), a
// agenda/status ainda deve considerar "hoje" = o dia em que esse turno
// começou — senão a Grade do Dia/status vira pra um dia cujas operações
// nem começaram ainda, enquanto o turno de verdade em andamento (com
// Raio-X pendente de finalizar) some de vista. Usada em todo lugar que
// decide o dia "atual" pra escala/status (defaults da agenda, "hoje" nos
// calendários, painéis hora a hora) — mesmo raciocínio de slotTimestamp()
// abaixo, aplicado aqui ao dia corrente em vez de um slot específico.
function hojeAgendaISO(){
  const d = new Date();
  if(d.getHours() < 6) d.setDate(d.getDate()-1);
  return dateToISO(d);
}

function addDaysISO(dateStr, n){ const d = new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return dateToISO(d); }

// Usado pra limitar a recorrência de reuniões a no máximo 2 meses (ver
// events.js, btnNovaReuniao) — sem isso um "repetir toda terça" sem fim
// geraria reuniões indefinidamente.
function addMonthsISO(dateStr, n){ const d = new Date(dateStr+'T00:00:00'); d.setMonth(d.getMonth()+n); return dateToISO(d); }

// "HH:MM" + minutos -> "HH:MM", com wraparound de 24h. Usado pelos botões
// de duração rápida (15/20/40/60min) do horário de fim da reunião.
function addMinutesToTime(hhmm, minutes){
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h*60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

// Segunda-feira da semana de dateStr — Resultado SPR é uma média semanal
// (segunda a domingo, ver render-supervisor.js, sprResultadoBody), então a
// linha do tempo agrupa por essa semana "cheia", não por 7 dias corridos
// a partir de qualquer dia da semana.
function weekStartISO(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const dow = d.getDay(); // 0=domingo...6=sábado
  const diff = dow===0 ? -6 : 1-dow;
  return addDaysISO(dateStr, diff);
}

function uid(prefix){ return prefix+'_'+Math.random().toString(36).slice(2,9); }

function hourSortValue(hora){ const h = parseInt(hora.split(':')[0],10); return h < 7 ? h + 24 : h; }

function rangesOverlap(s1,e1,s2,e2){ return s1 < e2 && s2 < e1; }


function usersByRole(role){ return DB.users.filter(u=>u.role===role); }

function userById(id){ return DB.users.find(u=>u.id===id); }

function jornadaLabel(u){
  if(!u.jornada) return '—';
  const dias = (u.jornada.dias||[]).map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join('/');
  return `${dias||'—'} · ${u.jornada.horaInicio}–${u.jornada.horaFim}`;
}

function diasBaseMestraLabel(bm){
  if(!bm.dias || bm.dias.length===0) return 'Todos os dias';
  return bm.dias.map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join('/');
}

// Uma entrada de base mestra "roda" num dia se a data está dentro da
// vigência E (não tem restrição de dia da semana OU o dia da semana da
// data está entre os selecionados). dias vazio/ausente = todo dia —
// mantém compatível com registros criados antes desse campo existir.
function bmRodaNoDia(bm, dateStr){
  if(dateStr < bm.dataInicio || dateStr > bm.dataFim) return false;
  if(!bm.dias || bm.dias.length===0) return true;
  const weekday = WEEKDAYS[new Date(dateStr+'T00:00:00').getDay()];
  return bm.dias.includes(weekday);
}


const RAIOX_MIN_OBS_LEN = 150;

// Raio-X = o registro obrigatório de finalização de uma operação (estrelas +
// observação). Enquanto ele não existe, a operação não está "finalizada" de
// verdade — só o horário passou.
function isOperacaoFinalizada(analistaId, operacao, hora, dataStr){
  return DB.raioX.some(r=>r.analistaId===analistaId && r.operacao===operacao && r.hora===hora && r.data===dataStr);
}

// Timestamp real de um slot (dataStr+hora): turnos rodam ~19h–07h, então
// horas de madrugada (00h–06h, ver hourSortValue) marcadas num dataStr na
// verdade acontecem no dia SEGUINTE em relógio de verdade (dataStr é o dia
// em que o turno COMEÇA, às 19h — a madrugada é a continuação dele já no
// dia seguinte). Comparar timestamps absolutos (em vez de só a fração de
// hora do dia) evita confundir "início de madrugada de hoje" com "fim de
// turno" — que era o que marcava operações de hoje que ainda nem
// começaram (ex.: 19h de hoje, visto às 01h da madrugada do mesmo dia)
// como já atrasadas.
function slotTimestamp(dataStr, hora){
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(dataStr+'T00:00:00');
  if(hourSortValue(hora) >= 24) d.setDate(d.getDate()+1);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function computeStatus(hora, dataStr, analistaId, operacao, isOff){
  const atrasada = () => (analistaId && operacao && !isOff && !isOperacaoFinalizada(analistaId, operacao, hora, dataStr)) ? 'atraso' : 'done';
  const slotStart = slotTimestamp(dataStr, hora);
  const now = Date.now();
  if(now < slotStart) return 'wait';
  if(now < slotStart + 60*60*1000) return 'live';
  return atrasada();
}

// emojiOnly: usado na escala em cards (flashcards) do analista pra deixar o
// visual mais limpo — o emoji já carrega o significado, e o texto completo
// ainda fica disponível no title (tooltip). Tabelas administrativas (Grade
// do Dia, dashboards) continuam chamando sem esse parâmetro, com o texto.
// SPR cadastrado (tela SPR do supervisor) pra uma Operação+Ciclo — usado
// em Operações Fixas, Cobertura e nos flashcards da Programação (própria
// ou vista pelo supervisor). Escopado por supervisorId (mesma convenção de
// baseMestra/suplencias/plantoes) pra não misturar SPR de times diferentes
// que por acaso usem o mesmo nome de operação.
function getSPR(supervisorId, operacao, ciclo){
  const rec = DB.sprs.find(s=>s.supervisorId===supervisorId && s.operacao===operacao && s.ciclo===ciclo);
  return rec ? rec.spr : null;
}

function statusPill(status, emojiOnly){
  const map = { wait:['pill-wait','⏳','A Iniciar'], live:['pill-live','🏃','Em Andamento'], done:['pill-done','✅','Finalizada'], off:['pill-off','🌙','Ausente'], atraso:['pill-atraso','🚨','Pendente Raio-X'] };
  const [cls,emoji,text] = map[status] || map.wait;
  if(emojiOnly) return `<span class="pill pill-emoji ${cls}" title="${text}">${emoji}</span>`;
  return `<span class="pill ${cls}">${emoji} ${text}</span>`;
}

// Categoria visual de um slot de getDaySlots(): fixa (operação normal do
// analista), folga (ele está ausente, outra pessoa cobre) ou cobertura
// (ele está cobrindo a operação de outra pessoa) — usado tanto pra colorir
// os flashcards quanto pro filtro da Programação (ver render-analista.js).
function categoriaOperacao(s){
  if(s.isOff) return 'folga';
  if(s.isCobertura) return 'cobertura';
  return 'fixa';
}

function isDomingo(dateStr){
  return WEEKDAYS[new Date(dateStr+'T00:00:00').getDay()]==='dom';
}

// Analista escalado em plantão numa data — reaproveita o cadastro de
// Plantão da aba Eventos (DB.plantoes: data + cargo + nome do plantonista,
// ver supPlantao()/events.js). Esse cadastro nasceu pra cobrir a AUSÊNCIA
// DO SUPERVISOR, mas quando o cargo marcado é "Analista", ele também serve
// como a escala de plantão do analista — então casamos pelo nome
// (normalizado, mesmo critério do import de planilha em findAnalistaByName)
// dentro do time do supervisor dele, já que coberturaNome é texto livre,
// sem vínculo direto de analistaId. Usado tanto na exceção de Folga DSR
// (isFolgaDSR abaixo, específico de domingo) quanto no aviso visual na
// agenda mensal do analista (renderAnalistaMensal, qualquer dia).
function analistaEmPlantao(analistaId, dateStr){
  const me = userById(analistaId);
  if(!me) return false;
  return DB.plantoes.some(p=>
    p.data===dateStr &&
    p.coberturaRole==='Analista' &&
    p.supervisorAusenteId===me.supervisorId &&
    normalizarNome(p.coberturaNome)===normalizarNome(me.name)
  );
}

// Domingo não segue o filtro de folga comum (que olha cada slot isolado) —
// segue a regra do DSR (Descanso Semanal Remunerado): só é Folga DSR se
// TODAS as operações de origem do analista nesse domingo estiverem
// cobertas por terceiros, ele não estiver cobrindo ninguém (nem outra
// operação própria sem cobertura), e não estiver escalado em plantão.
function isFolgaDSR(analistaId, dateStr){
  const slots = getDaySlots(analistaId, dateStr);
  const temFolgaPropria = slots.some(s=>categoriaOperacao(s)==='folga');
  const temFixaPropria = slots.some(s=>categoriaOperacao(s)==='fixa');
  const temCobertura = slots.some(s=>categoriaOperacao(s)==='cobertura');
  if(!temFolgaPropria || temFixaPropria || temCobertura) return false;
  if(analistaEmPlantao(analistaId, dateStr)) return false;
  return true;
}

// Filtro por categoria de operação usado pelas 3 visões da Programação do
// analista (diária/semanal/mensal — ver render-analista.js). Domingo tem
// regra própria pro filtro de folga (ver isFolgaDSR); os outros dias e os
// outros filtros (fixa/cobertura) seguem exatamente como antes.
function filtrarSlotsAgenda(analistaId, dateStr, opFiltro){
  const slots = getDaySlots(analistaId, dateStr);
  if(!opFiltro || opFiltro==='all') return slots;
  if(opFiltro==='folga' && isDomingo(dateStr)){
    return isFolgaDSR(analistaId, dateStr) ? slots.filter(s=>categoriaOperacao(s)==='folga') : [];
  }
  return slots.filter(s=>categoriaOperacao(s)===opFiltro);
}

// Classifica um analista no período (Métricas do supervisor): 'folga' só
// se TODOS os dias com operação no período forem folga (nenhuma operação
// fixa própria nem cobertura de outra pessoa) — 'ativo' se teve pelo menos
// um dia de operação fixa ou cobertura, mesmo com folgas misturadas no
// meio — 'sem-dados' se não teve nenhum registro no período.
function classificarAnalistaNoPeriodo(analistaId, inicio, fim){
  let temFixaOuCobertura = false, temFolga = false;
  for(let d=inicio; d<=fim; d=addDaysISO(d,1)){
    getDaySlots(analistaId, d).forEach(s=>{
      const cat = categoriaOperacao(s);
      if(cat==='fixa' || cat==='cobertura') temFixaOuCobertura = true;
      else if(cat==='folga') temFolga = true;
    });
  }
  if(!temFixaOuCobertura && !temFolga) return 'sem-dados';
  return temFolga && !temFixaOuCobertura ? 'folga' : 'ativo';
}

function starDisplay(n){
  const v = Math.max(0, Math.min(5, n||0));
  return `<span style="color:var(--brand);letter-spacing:1px;">${'★'.repeat(v)}${'☆'.repeat(5-v)}</span>`;
}


function getDaySlots(analistaId, dateStr){
  const bmEntries = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, dateStr));
  const slots = bmEntries.map(bm=>{
    const aus = DB.ausencias.find(a=>a.baseMestraId===bm.id && a.data===dateStr);
    if(aus){
      const sup = userById(aus.suplenteId);
      return {...bm, isOff:true, tipo:aus.tipo, responsavelNome: sup?.name || aus.suplenteNome || '—', responsavelId: aus.suplenteId||null, isSuplente:true};
    }
    return {...bm, isOff:false, responsavelNome: bm.titular, responsavelId: bm.analistaId, isSuplente:false};
  });
  const adhoc = DB.suplencias.filter(s=>s.analistaOriginalId===analistaId && s.dataCobertura===dateStr)
    .map(s=>({id:s.id, operacao:s.operacao, ciclo:s.ciclo, horaInicio:s.horaInicio, horaFim:s.horaFim, isOff:true, tipo:'cobertura', responsavelNome:s.suplente, responsavelId:null, isSuplente:true}));

  // As duas listas acima só aparecem na agenda do TITULAR (a operação some
  // do dia dele, com "quem cobre"). Sem isso abaixo, quem cobre nunca vê a
  // operação na própria agenda nem consegue fazer o Raio-X dela — daí vem
  // aqui como uma operação normal (isOff:false, então o botão "Finalizar
  // operação" aparece do mesmo jeito), só com um aviso de que é cobertura.
  const coberturaAusencias = DB.ausencias.filter(a=>a.suplenteId===analistaId && a.data===dateStr).map(a=>{
    const bm = DB.baseMestra.find(b=>b.id===a.baseMestraId);
    if(!bm) return null;
    const titular = userById(bm.analistaId);
    return {...bm, isOff:false, isCobertura:true, tipo:a.tipo, responsavelNome: titular?.name || bm.titular, responsavelId: bm.analistaId, isSuplente:false};
  }).filter(Boolean);

  const me = userById(analistaId);
  const coberturaAdhoc = me ? DB.suplencias.filter(s=>s.suplente===me.name && s.dataCobertura===dateStr).map(s=>{
    const titular = userById(s.analistaOriginalId);
    return {id:s.id, operacao:s.operacao, ciclo:s.ciclo, horaInicio:s.horaInicio, horaFim:s.horaFim, isOff:false, isCobertura:true, tipo:'cobertura', responsavelNome: titular?.name || '—', responsavelId: s.analistaOriginalId||null, isSuplente:false};
  }) : [];

  const all = [...slots, ...adhoc, ...coberturaAusencias, ...coberturaAdhoc];

  // Base mestra às vezes tem entrada duplicada pra mesma operação/horário
  // (sobra de importação em massa repetida) — quando isso acontece, só UMA
  // das cópias tem a ausência/cobertura vinculada (ela vira "com tag":
  // Folga do titular ou Cobrindo X); a(s) outra(s) cópia(s) aparecem como
  // operação normal, duplicando o card à toa. Já que a versão com tag é a
  // que reflete o que realmente está acontecendo, descarta a(s) sem tag
  // quando há uma com tag pro mesmo par operação+horário.
  const comTag = new Set(all.filter(s=>s.isOff||s.isCobertura).map(s=>s.operacao+'|'+s.horaInicio));
  const deduped = all.filter(s=> s.isOff || s.isCobertura || !comTag.has(s.operacao+'|'+s.horaInicio));

  return deduped.sort((a,b)=> hourSortValue(a.horaInicio)-hourSortValue(b.horaInicio));
}

function getReunioesForDate(analistaId, dateStr){
  const me = userById(analistaId);
  return DB.reunioes.filter(r=> r.data===dateStr && r.supervisorId===me.supervisorId &&
    (r.tipo==='grupo' ? (r.analistaIds.length===0 || r.analistaIds.includes(analistaId)) : r.analistaIds.includes(analistaId)));
}

function plantaoBannerFor(analistaId, dateStr){
  const me = userById(analistaId);
  const pl = DB.plantoes.find(p=>p.supervisorAusenteId===me.supervisorId && p.data===dateStr);
  if(!pl) return '';
  const sup = userById(me.supervisorId);
  return `<div class="banner">🔔 Seu supervisor <b>${sup?.name||''}</b> está ausente nesta data. Plantão: <b>${pl.coberturaNome}</b> (${pl.coberturaRole}).</div>`;
}


function userSupKey(userId){ const u=userById(userId); return u.supervisorId; }

function recadosParaAnalista(analistaId){
  return DB.recados.filter(r=> r.to==='all' || r.to==='all_ana_'+userSupKey(analistaId) || r.to===analistaId);
}


function getLembretesForAnalista(analistaId){
  const me = userById(analistaId);
  return DB.lembretes.filter(l=> (l.origem==='self' && l.analistaId===analistaId) || (l.origem==='supervisor' && (l.target===analistaId || l.target==='all_ana_'+me.supervisorId)));
}


function timeAgo(ts){
  const min = Math.round((Date.now()-ts)/60000);
  if(min<60) return `há ${min} min`;
  const h = Math.round(min/60); if(h<24) return `há ${h}h`;
  return `há ${Math.round(h/24)}d`;
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Link de reunião sem "http(s)://" (ex: "meet.google.com/xxx") vira um
// caminho relativo da própria página em vez de um link externo — o
// navegador monta a URL como "kronoopoficial/meet.google.com/xxx". Aplicado
// tanto ao salvar (events.js) quanto ao exibir (render-*.js), pra também
// corrigir links já salvos sem o prefixo.
function normalizeUrl(url){
  if(!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}


function candidatosParaSlot(myAnalistas, titularId, bm, dataStr){
  const s1 = hourSortValue(bm.horaInicio), e1 = hourSortValue(bm.horaFim);
  const mesRef = dataStr.slice(0,7);
  const candidatos = myAnalistas.filter(a=>a.id!==titularId).map(a=>{
    const estaDeFolga = DB.ausencias.some(x=>x.analistaId===a.id && x.data===dataStr);
    if(estaDeFolga) return null;
    const opsProprias = DB.baseMestra.filter(b=>b.analistaId===a.id && bmRodaNoDia(b, dataStr))
      .filter(b=>!DB.ausencias.some(x=>x.baseMestraId===b.id && x.data===dataStr));
    const conflitaComProprias = opsProprias.some(b=> rangesOverlap(s1,e1, hourSortValue(b.horaInicio), hourSortValue(b.horaFim)));
    if(conflitaComProprias) return null;
    const jaSuplente = DB.ausencias.filter(x=>x.suplenteId===a.id && x.data===dataStr);
    const conflitaComCoberturas = jaSuplente.some(x=> rangesOverlap(s1,e1, hourSortValue(x.horaInicio), hourSortValue(x.horaFim)));
    if(conflitaComCoberturas) return null;
    const coberturasNoMes = DB.ausencias.filter(x=>x.suplenteId===a.id && x.data.slice(0,7)===mesRef).length;
    return { id:a.id, name:a.name, opsHoje:opsProprias.length, coberturasNoMes };
  }).filter(Boolean);
  candidatos.sort((x,y)=> x.opsHoje-y.opsHoje || x.coberturasNoMes-y.coberturasNoMes || x.name.localeCompare(y.name));
  return candidatos;
}


// Ignora acento, maiúscula/minúscula, pontuação e espaço duplicado — pra
// "José da Silva", "jose  da-silva." e "JOSÉ DA SILVA" baterem com o mesmo
// cadastro na hora de importar planilha (ver findAnalistaByName abaixo).
function normalizarNome(s){
  return (s||'')
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[.,;:!?'"´`_-]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function findAnalistaByName(myAnalistas, name){
  const n = normalizarNome(name);
  if(!n) return null;
  return myAnalistas.find(a=>normalizarNome(a.name)===n);
}

function readFileAsArrayBuffer(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

function downloadXLSX(filename, headers, exampleRow){
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  XLSX.writeFile(wb, filename);
}

// Export genérico de relatório (telas do Coordenador com filtro) — mesma
// lib (SheetJS) já usada pra template/import acima, só que com N linhas em
// vez de uma linha de exemplo. `rows` é array de arrays, já na ordem de
// `headers`.
function exportarRelatorioExcel(filename, headers, rows){
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, filename);
}

const XLSX_TIME_KEYS = new Set(['hora_inicio','hora_fim']);

// Células de hora no Excel chegam de formas diferentes dependendo de como a
// célula foi formatada na planilha original: string "19:00", Date (com data
// fixa 1899-12-30 + a hora) ou número serial fracionário (ex.: 0.791666... =
// 19:00, pois o Excel guarda hora como fração de um dia de 24h). Sem esse
// tratamento os dois últimos casos vazam como "1899-12-30" ou "0.79166..." nos
// horários de analistas (Cadastros), Operações Fixas e Coberturas avulsas.
function excelCellToHHMM(v){
  if(v instanceof Date){
    return String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');
  }
  if(typeof v === 'number' && isFinite(v)){
    const totalMin = Math.round((v % 1) * 24 * 60);
    const h = Math.floor(totalMin/60) % 24, m = totalMin % 60;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
  return String(v).trim();
}

async function parseXLSX(file){
  const buf = await readFileAsArrayBuffer(file);
  // cellDates:true — sem isso, uma célula formatada como data no Excel vira
  // número serial (ex.: 46600) em vez de um valor utilizável.
  const wb = XLSX.read(buf, {type:'array', cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
  return rows.map(row=>{
    const obj = {};
    Object.keys(row).forEach(k=>{
      const v = row[k];
      const key = k.trim().toLowerCase();
      if(XLSX_TIME_KEYS.has(key)){
        obj[key] = excelCellToHHMM(v);
      }else{
        // Mesma convenção de data usada no resto do app (todayISO() etc.).
        obj[key] = v instanceof Date ? v.toISOString().slice(0,10) : String(v).trim();
      }
    });
    return obj;
  });
}

