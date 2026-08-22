const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { importarPlanilha } = require("../controllers/planilhaImport.controller");

const router = Router();

router.post("/", asyncHandler(importarPlanilha));

module.exports = router;
