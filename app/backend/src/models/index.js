import { sequelize, testConnection } from "../config/db.js";
import User from "./User.js";
import Survey from "./Survey.js";
import SurveyComponent from "./SurveyComponent.js";
import SurveyResponse from "./SurveyResponse.js";

// 同步数据库模型
async function syncDatabase() {
  try {
    await sequelize.sync({ alter: true });
    console.log("数据库同步成功");
  } catch (error) {
    console.error("数据库同步失败:", error);
  }
}

export { sequelize, testConnection, syncDatabase, User, Survey, SurveyComponent, SurveyResponse };
