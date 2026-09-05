const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { previsarOuEnviarPassagemBastao } = require("../controllers/passagemBastao.controller");

const router = Router();

router.post("/", asyncHandler(previsarOuEnviarPassagemBastao));

module.exports = router;
