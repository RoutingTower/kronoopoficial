const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listRecados,
  createRecado,
  updateRecado,
  deleteRecado,
} = require("../controllers/recados.controller");

const router = Router();

router.get("/", asyncHandler(listRecados));
router.post("/", asyncHandler(createRecado));
router.patch("/:id", asyncHandler(updateRecado));
router.delete("/:id", asyncHandler(deleteRecado));

module.exports = router;
