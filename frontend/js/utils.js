/* Funções utilitárias puras: datas, formatação, CSV/Excel, escala do dia. */

// Ícone (Lucide, via CDN — ver index.html) no lugar de emoji solto pelo
// site, pra um visual mais consistente/profissional. Só vira SVG de
// verdade depois de lucide.createIcons() rodar — ver renderMain()/
// buildNav() em ui.js, chamado a cada render — até lá é um <i> vazio.
function icon(name, size){
  return `<i data-lucide="${name}" class="ico" style="width:${size||14}px;height:${size||14}px;"></i>`;
}

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

// Texto pra tooltip (title=) com as operações fixas do analista, horário +
// nome, uma por linha — usado nos chips "Em folga/ausentes" (Métricas) pra
// dar contexto de quem é a pessoa sem precisar abrir o histórico completo.
function operacoesFixasTooltip(analistaId){
  const ops = DB.baseMestra.filter(b=>b.analistaId===analistaId).sort((a,b)=>hourSortValue(a.horaInicio)-hourSortValue(b.horaInicio));
  if(ops.length===0) return 'Sem operação fixa cadastrada';
  return ops.map(b=>`${b.horaInicio} - ${b.operacao}`).join('\n');
}

function rangesOverlap(s1,e1,s2,e2){ return s1 < e2 && s2 < e1; }

// Mesmos elementos, independente de ordem — usado pra achar reuniões da
// mesma série (analistaIds) na edição em massa "esta e as futuras"
// (events.js, data-editar-reuniao). Reuniões recorrentes não têm um
// serie_id no banco (cada data vira uma linha independente, ver
// btnNovaReuniao); a série é reconhecida por combinação de campos.
function mesmoConjunto(a, b){
  if(a.length!==b.length) return false;
  const sa=[...a].sort(), sb=[...b].sort();
  return sa.every((v,i)=>v===sb[i]);
}


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

// Acha o Raio-X de um analista+operação+hora+data — igual um .find(), mas
// blindado contra duplicata (o mesmo analista reenviando o mesmo Raio-X cria
// mais de um registro pro mesmo slot; visto em produção, ex.:
// Hub_SP_Piracicaba chegou a ter 7 linhas pro mesmo horário, a maioria sem a
// duração da planilha). Entre vários, prefere o que já tem
// duracaoSegundos preenchido — sem isso, um .find() comum podia pegar
// qualquer um dos vazios e a tela ficava muda mesmo com o dado existindo.
function encontrarRaioX(analistaId, operacao, hora, dataStr){
  const candidatos = DB.raioX.filter(r=>r.analistaId===analistaId && r.operacao===operacao && r.hora===hora && r.data===dataStr);
  if(candidatos.length<=1) return candidatos[0];
  return candidatos.find(r=>r.duracaoSegundos!=null) || candidatos[0];
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

// Duração entre dois horários "HH:MM" — se "fim" for menor ou igual a
// "início", assume que virou a madrugada (mesma lógica de slotTimestamp).
// Usado por hubsParaData (Gerar Escala de Fim de Semana) pra saber o
// tamanho da janela de cada hub.
function calcularDuracaoManual(horaInicioStr, horaFimStr){
  const [hi,mi] = horaInicioStr.split(':').map(Number);
  const [hf,mf] = horaFimStr.split(':').map(Number);
  let iniMin = hi*60+mi, fimMin = hf*60+mf;
  if(fimMin <= iniMin) fimMin += 24*60;
  return (fimMin-iniMin)*60;
}

// Tempo de Execução: SLA fixo de 1h de relógio pra toda operação. A duração
// real vem da planilha de roteirização importada pelo backend (ver
// planilhaImport.controller.js) — não é mais medida por um cronômetro
// Iniciar/Finalizar dentro do Kronos.
const SLA_TEMPO_EXECUCAO_SEGUNDOS = 3600;

function formatarDuracao(totalSegundos){
  const h = Math.floor(totalSegundos/3600), m = Math.floor((totalSegundos%3600)/60), s = totalSegundos%60;
  if(h>0) return `${h}h ${m}min`;
  if(m>0) return `${m}min ${s}s`;
  return `${s}s`;
}

// Versão enxuta de formatarDuracao (sem espaço, sem segundos) — pra caber
// num card pequeno da Grade Integrada sem quebrar linha à toa.
function formatarDuracaoCompacta(totalSegundos){
  const h = Math.floor(totalSegundos/3600), m = Math.round((totalSegundos%3600)/60);
  if(h>0 && m>0) return `${h}h${m}min`;
  if(h>0) return `${h}h`;
  return `${m}min`;
}

// Status é sobre o envio do Raio-X, não sobre o relógio em si: assim que
// existe um Raio-X pra esse slot, o status já vira "Finalizada" — mesmo
// que ainda esteja dentro da janela normal ("A Iniciar"/"Em Andamento"),
// alguém que manda cedo não deveria continuar aparecendo como pendente. Só
// quando NINGUÉM enviou ainda é que o relógio decide entre A Iniciar/Em
// Andamento/Não Finalizado.
function computeStatus(hora, dataStr, analistaId, operacao, isOff){
  if(analistaId && operacao && !isOff && isOperacaoFinalizada(analistaId, operacao, hora, dataStr)) return 'done';
  const slotStart = slotTimestamp(dataStr, hora);
  const now = Date.now();
  if(now < slotStart) return 'wait';
  if(now < slotStart + 60*60*1000) return 'live';
  return (analistaId && operacao && !isOff) ? 'atraso' : 'done';
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
  const map = { wait:['pill-wait','clock','A Iniciar'], live:['pill-live','circle-play','Em Andamento'], done:['pill-done','circle-check-big','Finalizada'], off:['pill-off','moon','Ausente'], atraso:['pill-atraso','octagon-alert','Não Finalizado'] };
  const [cls,ic,text] = map[status] || map.wait;
  if(emojiOnly) return `<span class="pill pill-emoji ${cls}" title="${text}">${icon(ic,12)}</span>`;
  return `<span class="pill ${cls}">${icon(ic,12)} ${text}</span>`;
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

// Todos os domingos de um mês "YYYY-MM", em ISO — usado pelo Gerar Escala
// de Domingo (render-supervisor.js) pra listar as opções de até 4 domingos
// pra marcar.
function domingosDoMes(mesStr){
  const [y, m] = mesStr.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const out = [];
  for(let dia=1; dia<=ultimo; dia++){
    const d = new Date(y, m-1, dia);
    if(d.getDay()===0) out.push(dateToISO(d));
  }
  return out;
}

// Formulários (Convocações): status calculado, nunca guardado — mesma
// lógica do backend (statusFormulario, formularios.controller.js).
// Pausado manualmente vence a janela programada; fora isso é só relógio.
function formularioStatus(f){
  if(!f.ativoManual) return 'pausado';
  const agora = Date.now();
  if(agora < f.abertura) return 'agendado';
  if(agora > f.fechamento) return 'encerrado';
  return 'aberto';
}
const FORMULARIO_STATUS_LABEL = {aberto:'Aberto agora', agendado:'Agendado', pausado:'Pausado', encerrado:'Encerrado'};
const FORMULARIO_TIPO_LABEL = {
  domingo_voluntariado: '📅 Voluntariado de domingo',
  folga_escolha: '🏖️ Escolha de folga',
  reconhecimento_mensal: '🌟 Reconhecimento mensal',
  ferias_solicitacao: '🧳 Solicitação de férias',
};

const WEEKDAY_ABBR = {dom:'dom',seg:'seg',ter:'ter',qua:'qua',qui:'qui',sex:'sex',sab:'sáb'};
function fmtDataCurta(iso){
  const d = new Date(iso+'T00:00:00');
  const dd = String(d.getDate()).padStart(2,'0'), mm = String(d.getMonth()+1).padStart(2,'0');
  return `${WEEKDAY_ABBR[WEEKDAYS[d.getDay()]]} ${dd}/${mm}`;
}

function sundaysInRange(inicio, fim){
  const out=[]; let d=inicio;
  while(d<=fim){ if(isDomingo(d)) out.push(d); d=addDaysISO(d,1); }
  return out;
}
function daysInRange(inicio, fim){
  const out=[]; let d=inicio;
  while(d<=fim){ out.push(d); d=addDaysISO(d,1); }
  return out;
}

// Formulário "Escolha de folga" (folga_escolha): domingo já tem seu próprio
// fluxo (domingo_voluntariado/Controle de Domingos), então nunca aparece
// aqui como opção — ver uso de diasFolgaEscolha em render-analista.js/
// render-supervisor.js. Limite de dias escolhidos por analista (não é o
// mesmo que limitePorDia, que é o de VAGAS em cada dia) espelha o backend
// (formularioRespostas.controller.js).
const MAX_DIAS_FOLGA_ESCOLHA = 3;
function diasFolgaEscolha(inicio, fim){
  return daysInRange(inicio, fim).filter(d=>!isDomingo(d));
}

// Grade em blocos de semana (calendário de verdade, Dom–Sáb) pro card do
// analista — domingo ENTRA na grade aqui (diferente de diasFolgaEscolha
// acima), só pra alinhar as colunas direito; a célula fica travada (não é
// uma escolha válida, mesma regra de sempre). null = fora do período, só
// preenche o começo/fim da primeira/última semana. Tamanho sempre múltiplo
// de 7.
function gradeSemanalFolgaEscolha(inicio, fim){
  const ini = new Date(inicio+'T00:00:00');
  const fimD = new Date(fim+'T00:00:00');
  const inicioSemana = new Date(ini); inicioSemana.setDate(inicioSemana.getDate()-ini.getDay());
  const fimSemana = new Date(fimD); fimSemana.setDate(fimSemana.getDate()+(6-fimD.getDay()));
  const celulas = [];
  for(let d=new Date(inicioSemana); d<=fimSemana; d.setDate(d.getDate()+1)){
    const iso = dateToISO(d);
    celulas.push(iso>=inicio && iso<=fim ? iso : null);
  }
  return celulas;
}

function minhaRespostaFormulario(formularioId, analistaId){
  return DB.formularioRespostas.find(r=>r.formularioId===formularioId && r.analistaId===analistaId);
}

// bigint (epoch ms, formato salvo no banco) <-> valor de <input
// type="datetime-local"> (sempre em horário local, sem timezone no texto —
// por isso `new Date(valorDoInput).getTime()` já basta pro sentido inverso).
function msParaDatetimeLocal(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const me = userById(analistaId);
  const bmEntries = DB.baseMestra.filter(b=>b.analistaId===analistaId && bmRodaNoDia(b, dateStr));
  const slots = bmEntries.map(bm=>{
    const aus = DB.ausencias.find(a=>a.baseMestraId===bm.id && a.data===dateStr);
    if(aus){
      const sup = userById(aus.suplenteId);
      return {...bm, isOff:true, tipo:aus.tipo, responsavelNome: sup?.name || aus.suplenteNome || '—', responsavelId: aus.suplenteId||null, isSuplente:true};
    }
    return {...bm, isOff:false, responsavelNome: bm.titular, responsavelId: bm.analistaId, isSuplente:false};
  });
  // Exclui a cobertura avulsa em que o próprio titular é quem cobre (ex.:
  // Gerar Escala de Domingo priorizando a carteira própria de quem já foi
  // escalado) — senão ele via aparecer duas vezes na própria agenda: um
  // card "Folgando" aqui e outro "Cobrindo" logo abaixo (coberturaAdhoc)
  // pra a MESMA operação, quando na real ele só está roteirizando o
  // próprio hub normalmente.
  const adhoc = DB.suplencias.filter(s=>s.analistaOriginalId===analistaId && s.dataCobertura===dateStr && !(me && normalizarNome(s.suplente)===normalizarNome(me.name)))
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

  const coberturaAdhoc = me ? DB.suplencias.filter(s=>s.suplente===me.name && s.dataCobertura===dateStr).map(s=>{
    const titular = userById(s.analistaOriginalId);
    return {id:s.id, operacao:s.operacao, ciclo:s.ciclo, horaInicio:s.horaInicio, horaFim:s.horaFim, isOff:false, isCobertura:true, tipo:'cobertura', responsavelNome: titular?.name || '—', responsavelId: s.analistaOriginalId||null, isSuplente:false};
  }) : [];

  const all = [...slots, ...adhoc, ...coberturaAusencias, ...coberturaAdhoc];

  // Base mestra às vezes tem entrada duplicada pra mesma operação/ciclo
  // (sobra de importação em massa repetida) — quando isso acontece, só UMA
  // das cópias tem a ausência/cobertura vinculada (ela vira "com tag":
  // Folga do titular ou Cobrindo X); a(s) outra(s) cópia(s) aparecem como
  // operação normal, duplicando o card à toa. Já que a versão com tag é a
  // que reflete o que realmente está acontecendo, descarta a(s) sem tag
  // quando há uma com tag pro mesmo par operação+ciclo — de propósito SEM
  // o horário na chave: um hub pode passar pra outro analista que roteiriza
  // em outro horário pra caber na agenda dele, e mesmo assim é a MESMA
  // operação sendo coberta (achado real: card do Breno não sumia porque a
  // cobertura tinha horário diferente do titular). Ciclo ENTRA na chave de
  // propósito (não usar só o nome): evita suprimir o card errado quando a
  // mesma operação roda em ciclos genuinamente diferentes no cadastro fixo.
  // Cadastro de operação fixa e de cobertura avulsa precisam usar o MESMO
  // ciclo pra essa dedupe funcionar — se o card ficar duplicado, o motivo
  // costuma ser ciclo divergente entre as duas pontas, não bug de código.
  const comTag = new Set(all.filter(s=>s.isOff||s.isCobertura).map(s=>s.operacao+'|'+s.ciclo));
  const deduped = all.filter(s=> s.isOff || s.isCobertura || !comTag.has(s.operacao+'|'+s.ciclo));

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

// Lembrete de passagem de bastão: aparece quando o dia SEGUINTE à data
// exibida é folga do analista — mesmo critério do banner de plantão acima
// (relativo a dateStr, a data navegada, não a hoje de verdade), pra também
// aparecer enquanto ele estiver adiantando e conferindo a agenda de um dia
// antes da folga, não só bem na hora real. Mesmo critério de "Folgando" já
// usado no resto do app (isFolgaDSR: dia todo coberto por outra pessoa,
// sem operação própria sobrando, sem plantão).
function passagemBastaoBannerFor(analistaId, dateStr){
  const amanha = addDaysISO(dateStr, 1);
  if(!isFolgaDSR(analistaId, amanha)) return '';
  return `<div class="banner">🔄 Você folga amanhã (<b>${formatarDataCurta(amanha)}</b>) — faça a <b>passagem de bastão</b> das suas operações de hoje antes de sair, combinando com quem cobre.</div>`;
}


function userSupKey(userId){ const u=userById(userId); return u.supervisorId; }

function recadosParaAnalista(analistaId){
  return DB.recados.filter(r=> r.to==='all' || r.to==='all_ana_'+userSupKey(analistaId) || r.to===analistaId);
}

// Trava as outras abas do menu do analista até ele confirmar leitura de
// todo recado pendente (ver renderMain/updateNavBadges, ui.js) — força
// passar pela Caixa de Entrada antes de mexer em qualquer outra coisa.
function analistaTemRecadosPendentes(){
  if(session.role!=='analista') return false;
  return recadosParaAnalista(session.userId).some(r=>!(r.lidoPor||[]).includes(session.userId));
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

// Prévia em texto puro do conteúdo (HTML) da Particularidade — usado na
// aba de auditoria do supervisor (render-supervisor.js), onde mostrar o
// HTML renderizado numa célula de tabela ficaria estranho (negrito/
// alinhamento cortado no meio). Corta em maxLen com reticências.
function stripHtmlPreview(html, maxLen){
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const texto = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  return texto.length > maxLen ? texto.slice(0, maxLen) + '…' : texto;
}

// Link de reunião sem "http(s)://" (ex: "meet.google.com/xxx") vira um
// caminho relativo da própria página em vez de um link externo — o
// navegador monta a URL como "kronoopoficial/meet.google.com/xxx". Aplicado
// tanto ao salvar (events.js) quanto ao exibir (render-*.js), pra também
// corrigir links já salvos sem o prefixo.
function normalizeUrl(url){
  if(!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Limpa HTML colado (Word/Google Docs/e-mail) no editor de Particularidade
// (events.js): mantém só negrito/itálico/sublinhado/alinhamento e links,
// descarta cor/fonte/tamanho e qualquer outra coisa que o fonte externo
// tenha trazido junto — espelha o whitelist do backend (sanitizeHtml.js),
// só que rodando no DOM real do navegador em vez de regex.
function limparHtmlColado(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const permitidas = new Set(['B','STRONG','I','EM','U','DIV','SPAN','P','BR','A']);
  function limpar(node){
    [...node.childNodes].forEach(child=>{
      if(child.nodeType!==1) return;
      if(!permitidas.has(child.tagName)){
        while(child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }
      const align = child.style && child.style.textAlign;
      const href = child.tagName==='A' ? child.getAttribute('href') : null;
      [...child.attributes].forEach(attr=>child.removeAttribute(attr.name));
      if(align) child.style.textAlign = align;
      if(href && /^(https?:|mailto:)/i.test(href)){
        child.setAttribute('href', href);
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      limpar(child);
    });
  }
  limpar(tmp);
  return tmp.innerHTML;
}

// Troca URL "solta" (texto puro, ainda não dentro de um <a>) por link
// clicável de verdade, direto no DOM — só mexe em nós de TEXTO, nunca em
// tags já existentes (evita duplicar link dentro de link). Usado ao colar
// e ao salvar a Particularidade (events.js).
const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
function linkify(container){
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest('a')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const alvos = [];
  let n;
  while((n = walker.nextNode())){ URL_REGEX.lastIndex = 0; if(URL_REGEX.test(n.nodeValue)) alvos.push(n); }
  alvos.forEach(node=>{
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    URL_REGEX.lastIndex = 0;
    node.nodeValue.replace(URL_REGEX, (match, _g, offset)=>{
      frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, offset)));
      const a = document.createElement('a');
      a.href = normalizeUrl(match);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = match;
      frag.appendChild(a);
      lastIndex = offset + match.length;
      return match;
    });
    frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
    node.parentNode.replaceChild(frag, node);
  });
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


// UF embutida no nome do hub — sempre "LM Hub_UF_Cidade..." (92/92 hubs
// reais seguem esse padrão). Usado só pra diversificar a escala de fim de
// semana (gerarEscalaFDS), sem valor de fallback especial se não bater —
// hubs sem esse padrão simplesmente não contam pra diversidade de ninguém.
// Raio-X antigo às vezes não tem ciclo gravado (campo chegou depois na
// tabela) — pra não mostrar "—" à toa no Ranking SPR, busca o ciclo
// vigente da mesma operação nas Operações Fixas (Base Mestra): primeiro
// tenta achar do mesmo analista que roteirizou, senão de qualquer um que
// já teve essa operação.
function cicloDaOperacaoHistorico(operacao, analistaId){
  const doAnalista = DB.baseMestra.find(b=>b.operacao===operacao && b.analistaId===analistaId && b.ciclo);
  if(doAnalista) return doAnalista.ciclo;
  const qualquer = DB.baseMestra.find(b=>b.operacao===operacao && b.ciclo);
  return qualquer ? qualquer.ciclo : '';
}

function ufDaOperacao(operacao){
  const m = /^LM Hub_([A-Za-z]{2})_/.exec(operacao||'');
  return m ? m[1].toUpperCase() : '';
}

// Regional: agrupamento maior que UF, cadastrado junto do SPR (sprs.regional
// — não vem do nome do hub como a UF, e não é um campo à parte na Base
// Mestra: SPR já é 1 linha por operação+ciclo, sem duplicar por vigência/
// titular, e já tem carga em massa por Excel). Usado só pra filtrar
// Resultado SPR (sprResultadoBody, render-supervisor.js) e pra mostrar
// (só leitura) na tabela de Operações Fixas; não aparece no card da
// Programação do analista. Mesmo espírito de getSPR (utils.js): escopado
// por supervisor, porque operação+ciclo só é único DENTRO da carteira de
// um supervisor, não globalmente.
function regionalDaOperacao(supervisorId, operacao, ciclo){
  const rec = DB.sprs.find(s=>s.supervisorId===supervisorId && s.operacao===operacao && s.ciclo===ciclo && s.regional);
  return rec ? rec.regional : '';
}

// Regionais já cadastradas em algum SPR — sugestão pro datalist do modal de
// Nova entrada/Editar (events.js), pra evitar variação de digitação
// ("Sudeste" vs "sudeste ") que faria o filtro de Resultado SPR não juntar
// tudo direito.
function regionaisConhecidas(){
  return [...new Set(DB.sprs.map(s=>s.regional).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

// Hubs (Base Mestra) que rodam numa data, com o horário já convertido pra
// timestamp real (cruza meia-noite corretamente pra turnos de madrugada,
// ver slotTimestamp) — usado pelo Gerar Escala de Fim de Semana abaixo.
// DB.baseMestra vem SEM filtro de equipe (GET /base-mestra devolve a
// tabela inteira, todo supervisor — cada tela filtra por myAnalistas na
// hora de usar). idsEquipe é obrigatório aqui: sem ele, a proposta mistura
// hub de time nenhum a ver com o supervisor que está gerando a escala.
function hubsParaData(dateStr, idsEquipe){
  const equipe = new Set(idsEquipe);
  return DB.baseMestra.filter(b=>b.analistaId && equipe.has(b.analistaId) && bmRodaNoDia(b, dateStr)).map(b=>{
    const startMs = slotTimestamp(dateStr, b.horaInicio);
    const durMs = calcularDuracaoManual(b.horaInicio, b.horaFim)*1000;
    return { bmId:b.id, analistaId:b.analistaId, titular:b.titular, operacao:b.operacao, ciclo:b.ciclo,
      horaInicio:b.horaInicio, horaFim:b.horaFim, startMs, endMs:startMs+durMs };
  });
}

const ESCALA_FDS_MAX_OPS = 6;
const ESCALA_FDS_MAX_JORNADA_MS = 8*60*60*1000;

// Gera uma proposta de escala de fim de semana (sábado ou domingo — mesma
// dinâmica pros dois dias, só muda a data): recebe quem foi escalado pra
// trabalhar (escaladoIds) numa data e distribui entre eles os hubs que
// precisam de cobertura nessa data — no máximo 6 operações por pessoa, sem
// horários sobrepostos, e sem passar de 8h entre o início da primeira e o
// fim da última operação da pessoa (a janela do turno).
//
// Prioridade 1: cada escalado recebe as operações que já são da carteira
// dele (Base Mestra), se caírem nessa data — são as que ele já conhece.
// Prioridade 2: o que sobra é distribuído priorizando, nessa ordem: (a)
// quem tem menos operações até agora (pra fechar todo mundo perto do
// limite, em vez de sobrecarregar os primeiros), (b) UF diferente das que
// a pessoa já pegou (própria carteira + extras já atribuídos) — evita
// empilhar hub do mesmo estado que ela já roteiriza — e por fim (c) o
// encaixe de horário mais justo (menor crescimento da janela do turno)
// como desempate final. Hubs que não couberem em ninguém (capacidade ou
// janela de horário esgotada) voltam em naoCobertos, pro supervisor
// resolver manualmente.
function gerarEscalaFDS(escaladoIds, dateStr, idsEquipe){
  const hubs = hubsParaData(dateStr, idsEquipe);
  const jaCoberto = new Set(
    DB.suplencias.filter(s=>s.dataCobertura===dateStr)
      .map(s=>`${s.operacao}|${s.ciclo}|${s.horaInicio}|${s.horaFim}`)
  );
  const pendentes = hubs.filter(h=>!jaCoberto.has(`${h.operacao}|${h.ciclo}|${h.horaInicio}|${h.horaFim}`));

  const escalados = escaladoIds.map(id=>{
    const u = userById(id);
    return { id, name: u?.name || '—', assigned: [], minStart: null, maxEnd: null, ufs: new Set() };
  });
  const porId = new Map(escalados.map(e=>[e.id, e]));

  function cabe(e, hub){
    if(e.assigned.length >= ESCALA_FDS_MAX_OPS) return false;
    if(e.assigned.some(a=>rangesOverlap(a.startMs, a.endMs, hub.startMs, hub.endMs))) return false;
    const novoMin = e.minStart===null ? hub.startMs : Math.min(e.minStart, hub.startMs);
    const novoMax = e.maxEnd===null ? hub.endMs : Math.max(e.maxEnd, hub.endMs);
    return (novoMax - novoMin) <= ESCALA_FDS_MAX_JORNADA_MS;
  }
  function atribuir(e, hub){
    e.assigned.push(hub);
    e.minStart = e.minStart===null ? hub.startMs : Math.min(e.minStart, hub.startMs);
    e.maxEnd = e.maxEnd===null ? hub.endMs : Math.max(e.maxEnd, hub.endMs);
    e.ufs.add(ufDaOperacao(hub.operacao));
  }

  const restantes = [];
  pendentes.forEach(hub=>{
    const dono = hub.analistaId && porId.get(hub.analistaId);
    if(dono && cabe(dono, hub)) atribuir(dono, hub);
    else restantes.push(hub);
  });

  restantes.sort((a,b)=>a.startMs-b.startMs);
  const naoCobertos = [];
  restantes.forEach(hub=>{
    const elegiveis = escalados.filter(e=>cabe(e, hub));
    if(elegiveis.length===0){ naoCobertos.push(hub); return; }
    const ufHub = ufDaOperacao(hub.operacao);
    elegiveis.sort((a,b)=>{
      if(a.assigned.length !== b.assigned.length) return a.assigned.length - b.assigned.length;
      const repeteUfA = a.ufs.has(ufHub) ? 1 : 0, repeteUfB = b.ufs.has(ufHub) ? 1 : 0;
      if(repeteUfA !== repeteUfB) return repeteUfA - repeteUfB;
      const spanA = a.minStart===null ? 0 : Math.max(a.maxEnd, hub.endMs) - Math.min(a.minStart, hub.startMs);
      const spanB = b.minStart===null ? 0 : Math.max(b.maxEnd, hub.endMs) - Math.min(b.minStart, hub.startMs);
      return spanA - spanB;
    });
    atribuir(elegiveis[0], hub);
  });

  escalados.forEach(e=> e.assigned.sort((a,b)=>a.startMs-b.startMs));
  return { escalados, naoCobertos };
}

// Último dia do mês "YYYY-MM", em ISO. new Date(y, m, 0) usa o truque do
// dia 0 (dia anterior ao dia 1 do mês seguinte) — m já vem 1-indexado da
// string, então passar ele direto como índice de mês (0-indexado) do JS
// já aponta pro mês seguinte, e o dia 0 desse volta pro último dia do mês
// pedido.
function ultimoDiaDoMesISO(mesStr){
  const [y,m] = mesStr.split('-').map(Number);
  return dateToISO(new Date(y, m, 0));
}

// Gera uma proposta de escala mensal (Operações Fixas) pro time inteiro:
// pega o "cardápio" de hubs atualmente vigentes (mesmo critério do botão
// Exportar vigentes) e propõe um novo titular pra cada um, pro período
// informado. Três regras duras: (1) nunca propõe um hub pra quem já teve
// ele em qualquer vigência, passada ou atual — consulta o histórico
// completo da equipe; (2) só propõe se o horário do hub cabe dentro da
// janela de jornada da pessoa (horaInicio–horaFim, cruzando meia-noite do
// mesmo jeito que hourSortValue já trata em outros lugares); (3) nunca
// sobrepõe dois hubs no mesmo horário pra mesma pessoa. Entre os
// elegíveis, prioriza quem tem menos hubs atribuídos nessa rodada e, em
// seguida, quem ainda não pegou nenhum hub do mesmo UF — pra espalhar a
// carteira de cada analista entre estados diferentes. A ordem dos hubs e
// o desempate entre elegíveis são embaralhados a cada chamada, então
// clicar em Gerar de novo tende a propor uma combinação diferente.
// dias fica vazio ([]) nas entradas novas, igual ao resto da base hoje —
// é o que deixa o Gerar Escala de Fim de Semana continuar enxergando
// esses hubs como precisando de cobertura no domingo (bmRodaNoDia só
// filtra por dias quando o campo não está vazio).
function gerarEscalaMensal(analistaIds, idsEquipe){
  const equipe = new Set(idsEquipe);
  const hoje = todayISO();
  const vistos = new Set();
  const hubs = [];
  DB.baseMestra.filter(b=>b.analistaId && equipe.has(b.analistaId) && b.dataFim>=hoje).forEach(b=>{
    const chave = `${b.operacao}|${b.ciclo}|${b.horaInicio}|${b.horaFim}`;
    if(vistos.has(chave)) return;
    vistos.add(chave);
    // dias carregado do registro original — sem isso, um hub que só roda em
    // alguns dias da semana (dias não vazio) virava "todos os dias" na
    // escala nova, publicado sob outro titular (ver dias:[] hardcoded que
    // existia em events.js antes desse fix).
    hubs.push({ operacao:b.operacao, ciclo:b.ciclo, horaInicio:b.horaInicio, horaFim:b.horaFim, dias:b.dias||[] });
  });

  const jaTeve = new Set(
    DB.baseMestra.filter(b=>b.analistaId && equipe.has(b.analistaId))
      .map(b=>`${b.analistaId}|${b.operacao}`)
  );

  const analistas = analistaIds.map(id=>{
    const u = userById(id);
    return { id, name: u?.name || '—', jornada: u?.jornada || null, assigned: [], ufs: new Set() };
  });

  function janela(horaInicio, horaFim){
    const s = hourSortValue(horaInicio);
    let e = hourSortValue(horaFim);
    if(e<=s) e += 24;
    return [s,e];
  }
  function elegivel(a, h){
    if(jaTeve.has(`${a.id}|${h.operacao}`)) return false;
    const [s,e] = janela(h.horaInicio, h.horaFim);
    if(a.jornada && a.jornada.horaInicio && a.jornada.horaFim){
      const [js,je] = janela(a.jornada.horaInicio, a.jornada.horaFim);
      if(s<js || e>je) return false;
    }
    return !a.assigned.some(x=>{
      const [xs,xe] = janela(x.horaInicio, x.horaFim);
      return rangesOverlap(s,e,xs,xe);
    });
  }
  function embaralhar(arr){
    const out = [...arr];
    for(let i=out.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [out[i],out[j]] = [out[j],out[i]];
    }
    return out;
  }

  const naoCobertos = [];
  const linhas = embaralhar(hubs).map(h=>{
    const uf = ufDaOperacao(h.operacao);
    const elegiveis = embaralhar(analistas.filter(a=>elegivel(a,h)));
    if(elegiveis.length===0){ naoCobertos.push(h); return { ...h, uf, analistaId:'' }; }
    elegiveis.sort((a,b)=>{
      if(a.assigned.length !== b.assigned.length) return a.assigned.length - b.assigned.length;
      const repeteA = a.ufs.has(uf) ? 1 : 0, repeteB = b.ufs.has(uf) ? 1 : 0;
      return repeteA - repeteB;
    });
    const escolhido = elegiveis[0];
    escolhido.assigned.push(h);
    escolhido.ufs.add(uf);
    return { ...h, uf, analistaId: escolhido.id };
  });

  return { linhas, analistas, naoCobertos };
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

