import express from "express";
import QEditorUploadController from "../../controllers/QEditorUploadController.js";
import upload from "../../config/multer-qeditor.js";

const router = express.Router();

// q-editor图片上传路由
router.post("/upload", upload.single("image"), QEditorUploadController.uploadImage);

// q-editor上传测试路由
router.get("/upload/test", QEditorUploadController.testUpload);

export default router;
