const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listParticularidades, upsertParticularidade } = require("../controllers/particularidades.controller");

const router = Router();

router.get("/", asyncHandler(listParticularidades));
router.post("/", asyncHandler(upsertParticularidade));

module.exports = router;
