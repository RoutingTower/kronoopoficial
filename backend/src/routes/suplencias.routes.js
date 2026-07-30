const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listSuplencias,
  createSuplencia,
  updateSuplencia,
  deleteSuplencia,
} = require("../controllers/suplencias.controller");

const router = Router();

router.get("/", asyncHandler(listSuplencias));
router.post("/", asyncHandler(createSuplencia));
router.patch("/:id", asyncHandler(updateSuplencia));
router.delete("/:id", asyncHandler(deleteSuplencia));

module.exports = router;
