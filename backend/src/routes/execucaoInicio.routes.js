const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listExecucaoInicio, createExecucaoInicio, liberarManual } = require("../controllers/execucaoInicio.controller");

const router = Router();

router.get("/", asyncHandler(listExecucaoInicio));
router.post("/", asyncHandler(createExecucaoInicio));
router.post("/liberar", asyncHandler(liberarManual));

module.exports = router;
