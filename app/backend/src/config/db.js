import { Sequelize } from "sequelize";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 创建Sequelize实例
const sequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test_db",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  define: {
    timestamps: true,
    underscored: true
  }
});

// 测试数据库连接
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log("数据库连接成功");
  } catch (error) {
    console.error("数据库连接失败:", error);
    process.exit(1);
  }
}

// 导出数据库实例和测试连接函数
export { sequelize, testConnection };
