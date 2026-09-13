const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { enviarReportSeatalk, enviarSuporteNoturno } = require("../controllers/seatalkReport.controller");

const router = Router();

router.post("/", asyncHandler(enviarReportSeatalk));
router.post("/suporte-noturno", asyncHandler(enviarSuporteNoturno));

module.exports = router;
