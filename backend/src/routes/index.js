const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { esqueciSenha } = require("../controllers/notificacoes.controller");
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
const notificacoesRoutes = require("./notificacoes.routes");
const particularidadesRoutes = require("./particularidades.routes");
const particularidadeCienteRoutes = require("./particularidadeCiente.routes");
const reuniaoPresencaRoutes = require("./reuniaoPresenca.routes");
const formulariosRoutes = require("./formularios.routes");
const formularioRespostasRoutes = require("./formularioRespostas.routes");
const planilhaImportRoutes = require("./planilhaImport.routes");
const roteirizacaoStatusRoutes = require("./roteirizacaoStatus.routes");
const quizRoutes = require("./quiz.routes");
const quizPlayRoutes = require("./quizPlay.routes");
const operacaoLinksRoutes = require("./operacaoLinks.routes");
const seatalkReportRoutes = require("./seatalkReport.routes");

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

// Único endpoint público além de /health — quem clica em "Esqueci minha
// senha" na tela de login ainda não tem token (ver
// backend/src/controllers/notificacoes.controller.js, esqueciSenha).
router.post("/esqueci-senha", asyncHandler(esqueciSenha));

// Também fora do requireAuth: quem chama é o Apps Script da planilha de
// roteirização, não um usuário logado no Kronos — se autentica com um
// token fixo (ver planilhaImport.controller.js), não um Supabase ID token.
router.use("/planilha-import", planilhaImportRoutes);

// Também público: quem entra num Quiz ao vivo pelo PIN não tem (nem precisa
// de) conta no Kronos — ver quizPlay.controller.js e docs do feature no
// plano salvo. O lado do host (criar/apresentar) exige login normalmente
// e fica em "/quiz", abaixo do requireAuth.
router.use("/quiz-play", quizPlayRoutes);

// Também fora do requireAuth: quem chama é o mesmo Apps Script da planilha
// de roteirização (gatilho de hora em hora à parte), não um usuário logado
// no Kronos — token fixo próprio (ver seatalkReport.controller.js).
router.use("/reports/seatalk", seatalkReportRoutes);

// Tudo abaixo exige um Supabase ID token válido — ver middleware/auth.js.
router.use(requireAuth);

router.use("/users", usersRoutes);
router.use("/lembretes", lembretesRoutes);
router.use("/base-mestra", baseMestraRoutes);
router.use("/ausencias", ausenciasRoutes);
router.use("/suplencias", suplenciasRoutes);
router.use("/raio-x", raioXRoutes);
router.use("/roteirizacao-status", roteirizacaoStatusRoutes);
router.use("/recados", recadosRoutes);
router.use("/reunioes", reunioesRoutes);
router.use("/plantoes", plantoesRoutes);
router.use("/feedbacks", feedbacksRoutes);
router.use("/sprs", sprsRoutes);
router.use("/notificacoes", notificacoesRoutes);
router.use("/particularidades", particularidadesRoutes);
router.use("/particularidade-ciente", particularidadeCienteRoutes);
router.use("/reuniao-presenca", reuniaoPresencaRoutes);
router.use("/formularios", formulariosRoutes);
router.use("/formulario-respostas", formularioRespostasRoutes);
router.use("/quiz", quizRoutes);
router.use("/operacao-links", operacaoLinksRoutes);

module.exports = router;
