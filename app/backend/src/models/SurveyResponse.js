import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import Survey from "./Survey.js";

const SurveyResponse = sequelize.define(
  "SurveyResponse",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    survey_id: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "问卷唯一标识"
    },
    answers: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "问卷答案数据"
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "创建时间"
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
      comment: "更新时间"
    }
  },
  {
    tableName: "survey_responses",
    timestamps: true,
    underscored: true
  }
);

// 关联关系
SurveyResponse.belongsTo(Survey, {
  foreignKey: "survey_id",
  targetKey: "survey_id",
  as: "survey"
});

Survey.hasMany(SurveyResponse, {
  foreignKey: "survey_id",
  sourceKey: "survey_id",
  as: "responses"
});

export default SurveyResponse;
