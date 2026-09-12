const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { importarFluxo } = require("../controllers/fluxoImport.controller");

const router = Router();

router.post("/", asyncHandler(importarFluxo));

module.exports = router;
