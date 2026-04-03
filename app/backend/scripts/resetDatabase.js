import { sequelize } from "../src/config/db.js";

async function resetDatabase() {
  try {
    console.log("开始重置数据库...");

    // 删除所有表
    await sequelize.drop();
    console.log("已删除所有表");

    // 重新创建表
    await sequelize.sync({ force: true });
    console.log("数据库重置成功");

    process.exit(0);
  } catch (error) {
    console.error("数据库重置失败:", error);
    process.exit(1);
  }
}

resetDatabase();
