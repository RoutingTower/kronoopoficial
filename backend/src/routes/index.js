const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
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

// Tudo abaixo exige um Firebase ID token válido — ver middleware/auth.js.
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
