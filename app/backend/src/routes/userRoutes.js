import express from "express";
import UserController from "../controllers/UserController.js";
import upload from "../config/multer.js";

const router = express.Router();

// 用户路由
router.get("/users", UserController.getAllUsers);
router.get("/users/:id", UserController.getUserById);
router.post("/users", UserController.createUser);
router.put("/users/:id", UserController.updateUser);
router.delete("/users/:id", UserController.deleteUser);
router.post("/users/:id/avatar", upload.single("avatar"), UserController.uploadAvatar);

export default router;
