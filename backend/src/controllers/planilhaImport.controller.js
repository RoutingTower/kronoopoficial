const supabaseService = require("../services/supabaseService");
const { planilhaImportToken } = require("../config/env");

// Duração em segundos entre dois "HH:mm", cruzando meia-noite se o fim for
// menor/igual ao início — mesma lógica de calcularDuracaoManual no frontend
// (frontend/js/utils.js), só que calculada aqui a partir do horário real da
// planilha, não do que o analista digitou.
function duracaoEmSegundos(inicio, fim) {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  let iniMin = hi * 60 + mi;
  let fimMin = hf * 60 + mf;
  if (fimMin <= iniMin) fimMin += 24 * 60;
  return (fimMin - iniMin) * 60;
}

// Chamado pelo Apps Script da planilha de roteirização (fora do requireAuth
// — ver routes/index.js), não por um usuário logado no Kronos. Por isso se
// autentica com um token fixo (PLANILHA_IMPORT_TOKEN) em vez de um Supabase
// ID token. Substitui o tempo de execução (duracao_segundos/duracao_origem)
// do Raio-X já existente pra cada linha — nunca CRIA um Raio-X novo (a
// finalização em si continua exigindo o fluxo normal, com estrelas e
// observação; isso só corrige o tempo depois que ela já existe).
async function importarPlanilha(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!planilhaImportToken || token !== planilhaImportToken) {
    return res.status(403).json({ error: "forbidden", message: "Token inválido." });
  }

  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas : [];
  const todosRaioX = await supabaseService.listAll("raioX");

  let atualizados = 0;
  const naoEncontrados = [];
  const ambiguos = [];
  const invalidos = [];

  for (const linha of linhas) {
    const data = String(linha.data || "").trim();
    const operacao = String(linha.operacao || "").trim();
    const ciclo = String(linha.ciclo || "").trim();
    const inicio = String(linha.inicio || "").trim();
    const fim = String(linha.fim || "").trim();
    if (!data || !operacao || !/^\d{1,2}:\d{2}$/.test(inicio) || !/^\d{1,2}:\d{2}$/.test(fim)) {
      invalidos.push(linha);
      continue;
    }

    // Ciclo é o desempate quando o mesmo hub roda mais de uma vez no dia —
    // registro antigo (sem ciclo gravado, ver comentário em raio_x no
    // supabase-schema.sql) conta como "qualquer ciclo" pra não deixar de
    // achar um Raio-X real só porque ele é anterior à correção do bug.
    const candidatos = todosRaioX.filter(
      (r) => r.data === data && r.operacao === operacao && (!ciclo || !r.ciclo || r.ciclo === ciclo)
    );
    if (candidatos.length === 0) {
      naoEncontrados.push({ data, operacao, ciclo });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({ data, operacao, ciclo, qtd: candidatos.length });
      continue;
    }

    const duracaoSegundos = duracaoEmSegundos(inicio, fim);
    await supabaseService.update("raioX", candidatos[0].id, {
      duracaoSegundos,
      duracaoOrigem: "planilha",
      ciclo: ciclo || candidatos[0].ciclo || null,
    });
    atualizados++;
  }

  res.json({ recebidas: linhas.length, atualizados, naoEncontrados, ambiguos, invalidos });
}

module.exports = { importarPlanilha };
