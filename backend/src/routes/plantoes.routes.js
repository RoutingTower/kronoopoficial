const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listPlantoes, createPlantao, updatePlantao, deletePlantao } = require("../controllers/plantoes.controller");

const router = Router();

router.get("/", asyncHandler(listPlantoes));
router.post("/", asyncHandler(createPlantao));
router.patch("/:id", asyncHandler(updatePlantao));
router.delete("/:id", asyncHandler(deletePlantao));

module.exports = router;
