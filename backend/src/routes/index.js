const { Router } = require("express");
const dns = require("dns").promises;
const { requireAuth } = require("../middleware/auth");
const { supabase: supabaseConfig } = require("../config/env");
const usersRoutes = require("./users.routes");
const lembretesRoutes = require("./lembretes.routes");
const baseMestraRoutes = require("./baseMestra.routes");
const ausenciasRoutes = require("./ausencias.routes");
const suplenciasRoutes = require("./suplencias.routes");
const raioXRoutes = require("./raioX.routes");
const recadosRoutes = require("./recados.routes");
const reunioesRoutes = require("./reunioes.routes");
const plantoesRoutes = require("./plantoes.routes");
const feedbacksRoutes = require("./feedbacks.routes");
const sprsRoutes = require("./sprs.routes");

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

// Diagnóstico TEMPORÁRIO (remover depois de achar a causa de "fetch failed"
// nos logs — ver docs/MIGRACAO-SUPABASE.md) — testa conectividade de rede
// deste host com o Supabase, sem passar pela lib supabase-js (que engole o
// erro de rede original e só deixa "fetch failed" genérico nos logs).
router.get("/debug-network", async (_req, res) => {
  const host = new URL(supabaseConfig.url).hostname;
  const out = { host };
  try {
    out.dns = await dns.lookup(host, { all: true });
  } catch (err) {
    out.dnsError = { message: err.message, code: err.code };
  }
  try {
    const started = Date.now();
    const r = await fetch(`${supabaseConfig.url}/auth/v1/health`);
    out.fetch = { status: r.status, ms: Date.now() - started };
  } catch (err) {
    out.fetchError = {
      message: err.message,
      name: err.name,
      code: err.cause?.code,
      causeMessage: err.cause?.message,
      stack: err.stack,
    };
  }
  res.json(out);
});

// Tudo abaixo exige um Supabase ID token válido — ver middleware/auth.js.
router.use(requireAuth);

router.use("/users", usersRoutes);
router.use("/lembretes", lembretesRoutes);
router.use("/base-mestra", baseMestraRoutes);
router.use("/ausencias", ausenciasRoutes);
router.use("/suplencias", suplenciasRoutes);
router.use("/raio-x", raioXRoutes);
router.use("/recados", recadosRoutes);
router.use("/reunioes", reunioesRoutes);
router.use("/plantoes", plantoesRoutes);
router.use("/feedbacks", feedbacksRoutes);
router.use("/sprs", sprsRoutes);

module.exports = router;
