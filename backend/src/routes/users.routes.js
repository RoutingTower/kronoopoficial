const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { listUsers, getMe, getUser, createUser, updateUser, deleteUser } = require("../controllers/users.controller");

const router = Router();

router.get("/", asyncHandler(listUsers));
router.get("/me", asyncHandler(getMe)); // antes de "/:id" — senão "me" seria lido como um id
router.get("/:id", asyncHandler(getUser));
router.post("/", asyncHandler(createUser));
router.patch("/:id", asyncHandler(updateUser));
router.delete("/:id", asyncHandler(deleteUser));

module.exports = router;
