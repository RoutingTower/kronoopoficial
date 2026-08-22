const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listRoteirizacaoStatus } = require("../controllers/roteirizacaoStatus.controller");

const router = Router();

router.get("/", asyncHandler(listRoteirizacaoStatus));

module.exports = router;
