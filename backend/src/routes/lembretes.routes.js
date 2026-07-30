const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listLembretes,
  createLembrete,
  updateLembrete,
  deleteLembrete,
} = require("../controllers/lembretes.controller");

const router = Router();

router.get("/", asyncHandler(listLembretes));
router.post("/", asyncHandler(createLembrete));
router.patch("/:id", asyncHandler(updateLembrete));
router.delete("/:id", asyncHandler(deleteLembrete));

module.exports = router;
