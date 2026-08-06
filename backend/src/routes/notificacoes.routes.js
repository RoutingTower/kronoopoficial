const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listNotificacoes, marcarLida } = require("../controllers/notificacoes.controller");

const router = Router();

router.get("/", asyncHandler(listNotificacoes));
router.patch("/:id", asyncHandler(marcarLida));

module.exports = router;
