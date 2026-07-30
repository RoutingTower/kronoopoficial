const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listBaseMestra,
  createBaseMestra,
  updateBaseMestra,
  deleteBaseMestra,
} = require("../controllers/baseMestra.controller");

const router = Router();

router.get("/", asyncHandler(listBaseMestra));
router.post("/", asyncHandler(createBaseMestra));
router.patch("/:id", asyncHandler(updateBaseMestra));
router.delete("/:id", asyncHandler(deleteBaseMestra));

module.exports = router;
