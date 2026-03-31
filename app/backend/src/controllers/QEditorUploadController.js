// q-editor图片上传控制器
class QEditorUploadController {
  // 上传图片文件
  static async uploadImage(req, res) {
    try {
      // 检查是否有文件上传
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "请选择要上传的图片"
        });
      }

      // 构建图片URL
      const imageUrl = `/uploads/q-editor/${req.file.filename}`;

      res.json({
        success: true,
        imageUrl: imageUrl,
        message: "图片上传成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "图片上传失败",
        error: error.message
      });
    }
  }

  // 测试接口
  static async testUpload(req, res) {
    try {
      res.json({
        success: true,
        message: "q-editor图片上传接口测试成功",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "测试接口失败",
        error: error.message
      });
    }
  }
}

export default QEditorUploadController;
