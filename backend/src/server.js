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
app.use(express.json({ limit: "2mb" })); // folga para importações em massa (XLSX/CSV) via Cadastros
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
