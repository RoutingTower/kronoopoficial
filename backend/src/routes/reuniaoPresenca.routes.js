const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listReuniaoPresenca, marcarPresenca } = require("../controllers/reuniaoPresenca.controller");

const router = Router();

router.get("/", asyncHandler(listReuniaoPresenca));
router.post("/", asyncHandler(marcarPresenca));

module.exports = router;
