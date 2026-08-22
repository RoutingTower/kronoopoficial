const supabaseService = require("../services/supabaseService");

// Mesmo motivo do DEFAULT_JANELA_DIAS em raioX.controller.js: sem filtro,
// cada carga de página paga o preço de ler tudo que já existiu.
const DEFAULT_JANELA_DIAS = 7;
function inicioPadrao() {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_JANELA_DIAS);
  return d.toISOString().slice(0, 10);
}

// Só leitura — quem escreve aqui é planilhaImport.controller.js (a
// importação da planilha de roteirização), nunca o frontend diretamente.
async function listRoteirizacaoStatus(req, res) {
  const { inicio } = req.query;
  const inicioEfetivo = inicio || inicioPadrao();
  const rows = await supabaseService.listWhere("roteirizacaoStatus", [["data", ">=", inicioEfetivo]]);
  res.json(rows);
}

module.exports = { listRoteirizacaoStatus };
