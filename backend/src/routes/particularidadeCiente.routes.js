const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listParticularidadeCiente, marcarCiente } = require("../controllers/particularidadeCiente.controller");

const router = Router();

router.get("/", asyncHandler(listParticularidadeCiente));
router.post("/", asyncHandler(marcarCiente));

module.exports = router;
