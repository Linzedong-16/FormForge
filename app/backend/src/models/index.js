import { sequelize } from "../config/db.js";
import User from "./User.js";

// 定义模型之间的关联关系（如果有）
// 例如：User.hasMany(Post);

// 同步数据库
async function syncDatabase() {
  try {
    await sequelize.sync({
      alter: process.env.NODE_ENV === "development", // 在开发环境下自动修改表结构
      force: false // 不强制删除重建表
    });
    console.log("数据库同步完成");
    return true;
  } catch (error) {
    console.error("数据库同步失败:", error);
    console.warn("警告：数据库连接失败，服务器将继续启动但部分功能可能不可用");
    return false;
  }
}

// 导出所有模型
export { sequelize, syncDatabase, User };
