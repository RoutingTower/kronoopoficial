const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listOperacaoLinks,
  createOperacaoLink,
  updateOperacaoLink,
  deleteOperacaoLink,
} = require("../controllers/operacaoLinks.controller");

const router = Router();

router.get("/", asyncHandler(listOperacaoLinks));
router.post("/", asyncHandler(createOperacaoLink));
router.patch("/:id", asyncHandler(updateOperacaoLink));
router.delete("/:id", asyncHandler(deleteOperacaoLink));

module.exports = router;
