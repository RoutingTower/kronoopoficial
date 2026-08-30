const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listQuizzes, createQuiz, getQuiz, updateQuiz, avancarQuiz, deleteQuiz } = require("../controllers/quiz.controller");

const router = Router();

router.get("/", asyncHandler(listQuizzes));
router.post("/", asyncHandler(createQuiz));
router.get("/:id", asyncHandler(getQuiz));
router.patch("/:id", asyncHandler(updateQuiz));
router.patch("/:id/avancar", asyncHandler(avancarQuiz));
router.delete("/:id", asyncHandler(deleteQuiz));

module.exports = router;
