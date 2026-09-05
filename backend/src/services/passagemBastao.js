// Detecta "passagem de bastão": uma operação fixa (base_mestra) que termina
// num dia e outra, do MESMO hub mas com titular diferente, que começa no dia
// seguinte — típico de reimportação mensal da escala (cria lote novo, não
// edita o que já existe, ver help-text de "Operações Fixas" no frontend).
// Sem isso, o titular que está saindo não necessariamente sabe que precisa
// passar o bastão, e o titular que está entrando pode nem saber que a
// operação é dele a partir de quando.
const supabaseService = require("./supabaseService");

function diaSeguinte(dataStr) {
  const d = new Date(dataStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function diaAnterior(dataStr) {
  const d = new Date(dataStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatarDataBR(dataStr) {
  const [, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}`;
}

// Acha todos os pares "sai X, entra Y" cujo titular antigo termina em
// `dataFimAntigo` — usado tanto pela varredura manual/retroativa (uma data
// específica) quanto pelo gatilho automático em createBaseMestra (só o dia
// anterior ao dataInicio da entrada recém-criada).
async function encontrarPassagensDeBastao(dataFimAntigo) {
  const dataInicioNovo = diaSeguinte(dataFimAntigo);
  const [todos, usuarios] = await Promise.all([supabaseService.listAll("baseMestra"), supabaseService.listAll("users")]);
  const nomeDoUsuario = (id) => usuarios.find((u) => u.id === id)?.name || "—";

  const antigos = todos.filter((b) => b.dataFim === dataFimAntigo);
  const novos = todos.filter((b) => b.dataInicio === dataInicioNovo);

  const pares = [];
  antigos.forEach((antigo) => {
    const novo = novos.find((n) => n.operacao === antigo.operacao && n.analistaId !== antigo.analistaId);
    if (!novo) return;
    pares.push({
      operacao: antigo.operacao,
      cicloAntigo: antigo.ciclo,
      cicloNovo: novo.ciclo,
      dataFimAntigo: antigo.dataFim,
      dataInicioNovo: novo.dataInicio,
      antigoAnalistaId: antigo.analistaId,
      antigoNome: nomeDoUsuario(antigo.analistaId),
      novoAnalistaId: novo.analistaId,
      novoNome: nomeDoUsuario(novo.analistaId),
    });
  });
  return pares;
}

function montarMensagens(par) {
  return {
    paraAntigo: `Seu tempo como titular do hub ${par.operacao} vai até ${formatarDataBR(par.dataFimAntigo)}. Faça a passagem de bastão para ${par.novoNome}.`,
    paraNovo: `A partir de ${formatarDataBR(par.dataInicioNovo)}, você será responsável pelo hub ${par.operacao}, que hoje é de ${par.antigoNome}.`,
  };
}

module.exports = { encontrarPassagensDeBastao, montarMensagens, diaSeguinte, diaAnterior, formatarDataBR };
