const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listFeedbacks, createFeedback, deleteFeedback } = require("../controllers/feedbacks.controller");

const router = Router();

router.get("/", asyncHandler(listFeedbacks));
router.post("/", asyncHandler(createFeedback));
router.delete("/:id", asyncHandler(deleteFeedback));

module.exports = router;
