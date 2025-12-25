import multer from "multer";
import path from "path";
import fs from "fs";

// 确保uploads目录存在
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳 + 原始文件名
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});

// 文件类型过滤
const fileFilter = (req, file, cb) => {
  // 允许所有类型的文件上传
  cb(null, true);

  // 如果需要限制文件类型，可以使用下面的代码
  // const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|csv/;
  // const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  // const mimetype = allowedTypes.test(file.mimetype);
  //
  // if (extname && mimetype) {
  //   return cb(null, true);
  // } else {
  //   cb(new Error('只允许上传图片、文档和文本文件！'));
  // }
};

// 创建multer实例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制文件大小为5MB
  }
});

export default upload;
