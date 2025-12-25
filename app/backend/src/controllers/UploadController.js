// 文件上传控制器
class UploadController {
  // 上传单个文件
  static async uploadFile(req, res) {
    try {
      // 检查是否有文件上传
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "请选择要上传的文件"
        });
      }

      // 构建文件信息响应
      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`
      };

      res.json({
        success: true,
        data: fileInfo,
        message: "文件上传成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "文件上传失败",
        error: error.message
      });
    }
  }

  // 上传多个文件
  static async uploadFiles(req, res) {
    try {
      // 检查是否有文件上传
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "请选择要上传的文件"
        });
      }

      // 构建文件信息响应数组
      const filesInfo = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: `/uploads/${file.filename}`
      }));

      res.json({
        success: true,
        data: filesInfo,
        message: "文件上传成功",
        count: filesInfo.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "文件上传失败",
        error: error.message
      });
    }
  }
}

export default UploadController;
