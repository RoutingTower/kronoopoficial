/* Funções utilitárias puras: datas, formatação, CSV/Excel, escala do dia. */

function todayISO(){ return new Date().toISOString().slice(0,10); }

function addDaysISO(dateStr, n){ const d = new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

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

function computeStatus(hora, dataStr, analistaId, operacao, isOff){
  const atrasada = () => (analistaId && operacao && !isOff && !isOperacaoFinalizada(analistaId, operacao, hora, dataStr)) ? 'atraso' : 'done';
  const isToday = dataStr === todayISO();
  if(!isToday) return dataStr < todayISO() ? atrasada() : 'wait';
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes()/60;
  const effSlot = hourSortValue(hora);
  const effNow = nowH < 19 ? nowH + 24 : nowH;
  if(effNow < effSlot) return 'wait';
  if(effNow >= effSlot && effNow < effSlot+1) return 'live';
  return atrasada();
}

function statusPill(status){
  const map = { wait:['pill-wait','⏳ A Iniciar'], live:['pill-live','🏃 Em Andamento'], done:['pill-done','✅ Finalizada'], off:['pill-off','🌙 Ausente'], atraso:['pill-atraso','🚨 Atraso de Roteirização'] };
  const [cls,label] = map[status] || map.wait;
  return `<span class="pill ${cls}">${label}</span>`;
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


function findAnalistaByName(myAnalistas, name){
  const n = (name||'').trim().toLowerCase();
  return myAnalistas.find(a=>a.name.trim().toLowerCase()===n);
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

