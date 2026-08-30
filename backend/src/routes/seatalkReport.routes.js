const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { enviarReportSeatalk } = require("../controllers/seatalkReport.controller");

const router = Router();

router.post("/", asyncHandler(enviarReportSeatalk));

module.exports = router;
