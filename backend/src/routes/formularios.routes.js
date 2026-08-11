const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listFormularios, createFormulario, updateFormulario, deleteFormulario } = require("../controllers/formularios.controller");

const router = Router();

router.get("/", asyncHandler(listFormularios));
router.post("/", asyncHandler(createFormulario));
router.patch("/:id", asyncHandler(updateFormulario));
router.delete("/:id", asyncHandler(deleteFormulario));

module.exports = router;
