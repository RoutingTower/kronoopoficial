const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listRespostas, enviarResposta, aprovarFerias, recusarFerias } = require("../controllers/formularioRespostas.controller");

const router = Router();

router.get("/", asyncHandler(listRespostas));
router.post("/", asyncHandler(enviarResposta));
router.post("/:id/aprovar", asyncHandler(aprovarFerias));
router.post("/:id/recusar", asyncHandler(recusarFerias));

module.exports = router;
