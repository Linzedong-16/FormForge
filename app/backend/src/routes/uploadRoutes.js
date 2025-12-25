import express from "express";
import UploadController from "../controllers/UploadController.js";
import upload from "../config/multer.js";

const router = express.Router();

// 文件上传路由
router.post("/upload", upload.single("file"), UploadController.uploadFile);
router.post("/upload/multiple", upload.array("files", 10), UploadController.uploadFiles);

export default router;
