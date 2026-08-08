const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listRaioX, createRaioX, updateRaioX, deleteRaioX } = require("../controllers/raioX.controller");

const router = Router();

router.get("/", asyncHandler(listRaioX));
router.post("/", asyncHandler(createRaioX));
router.patch("/:id", asyncHandler(updateRaioX));
router.delete("/:id", asyncHandler(deleteRaioX));

module.exports = router;
