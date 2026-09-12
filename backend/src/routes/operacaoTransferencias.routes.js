const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listTransferencias,
  createTransferencia,
  cancelarTransferencia,
  responderTransferencia,
} = require("../controllers/operacaoTransferencias.controller");

const router = Router();

router.get("/", asyncHandler(listTransferencias));
router.post("/", asyncHandler(createTransferencia));
router.patch("/:id/cancelar", asyncHandler(cancelarTransferencia));
router.patch("/:id/responder", asyncHandler(responderTransferencia));

module.exports = router;
