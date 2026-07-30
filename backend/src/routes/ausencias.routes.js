const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listAusencias,
  createAusencia,
  updateAusencia,
  deleteAusencia,
} = require("../controllers/ausencias.controller");

const router = Router();

router.get("/", asyncHandler(listAusencias));
router.post("/", asyncHandler(createAusencia));
router.patch("/:id", asyncHandler(updateAusencia));
router.delete("/:id", asyncHandler(deleteAusencia));

module.exports = router;
