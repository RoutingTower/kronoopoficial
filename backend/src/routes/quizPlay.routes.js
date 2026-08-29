const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { entrar, estado, responder } = require("../controllers/quizPlay.controller");

const router = Router();

router.post("/:pin/entrar", asyncHandler(entrar));
router.get("/:pin/estado", asyncHandler(estado));
router.post("/:pin/responder", asyncHandler(responder));

module.exports = router;
