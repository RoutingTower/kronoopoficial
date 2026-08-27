const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listRespostas, enviarResposta, aprovarFerias, recusarFerias, confirmarCobertura } = require("../controllers/formularioRespostas.controller");

const router = Router();

router.get("/", asyncHandler(listRespostas));
router.post("/", asyncHandler(enviarResposta));
router.post("/:id/aprovar", asyncHandler(aprovarFerias));
router.post("/:id/recusar", asyncHandler(recusarFerias));
router.patch("/:id/confirmar-cobertura", asyncHandler(confirmarCobertura));

module.exports = router;
