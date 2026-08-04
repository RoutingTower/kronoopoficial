const { Router } = require("express");
const { listNotificacoes, marcarLida } = require("../controllers/notificacoes.controller");

const router = Router();

router.get("/", listNotificacoes);
router.patch("/:id", marcarLida);

module.exports = router;
