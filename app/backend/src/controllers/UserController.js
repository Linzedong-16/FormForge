import { User } from "../models/index.js";

// 用户控制器类
class UserController {
  // 获取所有用户
  static async getAllUsers(req, res) {
    try {
      const users = await User.findAll({
        attributes: { exclude: ["password"] } // 排除密码字段
      });
      res.json({
        success: true,
        data: users,
        message: "获取所有用户成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "获取用户失败",
        error: error.message
      });
    }
  }

  // 根据ID获取用户
  static async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id, {
        attributes: { exclude: ["password"] }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      res.json({
        success: true,
        data: user,
        message: "获取用户成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "获取用户失败",
        error: error.message
      });
    }
  }

  // 创建用户
  static async createUser(req, res) {
    try {
      const { username, email, password } = req.body;

      // 验证必填字段
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "用户名、邮箱和密码不能为空"
        });
      }

      // 创建用户
      const user = await User.create({
        username,
        email,
        password
      });

      // 排除密码字段返回
      const userData = user.get();
      delete userData.password;

      res.status(201).json({
        success: true,
        data: userData,
        message: "创建用户成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "创建用户失败",
        error: error.message
      });
    }
  }

  // 更新用户
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email, password } = req.body;

      // 查找用户
      const user = await User.findByPk(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      // 更新用户信息
      const updateData = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (password) updateData.password = password;

      await user.update(updateData);

      // 排除密码字段返回
      const userData = user.get();
      delete userData.password;

      res.json({
        success: true,
        data: userData,
        message: "更新用户成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "更新用户失败",
        error: error.message
      });
    }
  }

  // 删除用户
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // 查找用户
      const user = await User.findByPk(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      // 删除用户
      await user.destroy();

      res.json({
        success: true,
        message: "删除用户成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "删除用户失败",
        error: error.message
      });
    }
  }

  // 上传用户头像
  static async uploadAvatar(req, res) {
    try {
      const { id } = req.params;

      // 查找用户
      const user = await User.findByPk(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      // 检查是否有文件上传
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "请选择要上传的文件"
        });
      }

      // 更新用户头像
      const avatarPath = `/uploads/${req.file.filename}`;
      await user.update({ avatar: avatarPath });

      // 排除密码字段返回
      const userData = user.get();
      delete userData.password;

      res.json({
        success: true,
        data: userData,
        message: "上传头像成功"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "上传头像失败",
        error: error.message
      });
    }
  }
}

export default UserController;
