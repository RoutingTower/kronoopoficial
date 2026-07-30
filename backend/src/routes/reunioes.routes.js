const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  listReunioes,
  createReuniao,
  updateReuniao,
  deleteReuniao,
} = require("../controllers/reunioes.controller");

const router = Router();

router.get("/", asyncHandler(listReunioes));
router.post("/", asyncHandler(createReuniao));
router.patch("/:id", asyncHandler(updateReuniao));
router.delete("/:id", asyncHandler(deleteReuniao));

module.exports = router;
