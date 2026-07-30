const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listRaioX, createRaioX, deleteRaioX } = require("../controllers/raioX.controller");

const router = Router();

router.get("/", asyncHandler(listRaioX));
router.post("/", asyncHandler(createRaioX));
router.delete("/:id", asyncHandler(deleteRaioX));

module.exports = router;
