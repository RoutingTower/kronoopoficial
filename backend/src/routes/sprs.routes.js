const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listSprs, createSpr, updateSpr, deleteSpr } = require("../controllers/sprs.controller");

const router = Router();

router.get("/", asyncHandler(listSprs));
router.post("/", asyncHandler(createSpr));
router.patch("/:id", asyncHandler(updateSpr));
router.delete("/:id", asyncHandler(deleteSpr));

module.exports = router;
