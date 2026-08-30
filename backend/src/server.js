// Prefere IPv4 na resolução de DNS — em alguns ambientes de hospedagem
// (ex.: Render) a rota IPv6 pra *.supabase.co não funciona, e o fetch
// nativo do Node tenta IPv6 primeiro por padrão, falhando com "fetch
// failed" antes mesmo de tentar IPv4. Precisa vir antes de qualquer
// require que possa disparar uma chamada de rede (supabaseService).
require("dns").setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");
const { port, allowedOrigins } = require("./config/env");
const apiRoutes = require("./routes");

const app = express();

class CorsOriginError extends Error {}

app.use(
  cors({
    origin(origin, callback) {
      // Requisições sem header Origin (ex.: curl, health checks de infra)
      // não são chamadas de navegador — deixa passar.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new CorsOriginError(`Origem não permitida pelo CORS: ${origin}`));
    },
  })
);
// 2mb estourou de verdade em produção (29/08/2026): o Apps Script da
// planilha de roteirização (enviarParaKronos, roda a cada 5min) manda um
// corpo maior que isso, e o Express rejeita a requisição inteira ANTES de
// chegar em importarPlanilha — nenhuma linha é processada, mesmo as óbvias.
// Sobe pra 20mb com folga. Se a função da planilha estiver mandando o
// histórico inteiro a cada chamada (em vez de só os dias recentes), isso
// só adia o problema — o ideal é limitar o que a própria planilha envia a
// uma janela de poucos dias por chamada.
app.use(express.json({ limit: "20mb" }));
app.use("/api", apiRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof CorsOriginError) {
    return res.status(403).json({ error: "cors_forbidden", message: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "internal_error", message: err.message });
});

app.listen(port, () => {
  console.log(`KronoOP API rodando em http://localhost:${port}`);
});
