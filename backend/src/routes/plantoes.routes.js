const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listPlantoes, createPlantao, deletePlantao } = require("../controllers/plantoes.controller");

const router = Router();

router.get("/", asyncHandler(listPlantoes));
router.post("/", asyncHandler(createPlantao));
router.delete("/:id", asyncHandler(deletePlantao));

module.exports = router;
