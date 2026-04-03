import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import Survey from "./Survey.js";

const SurveyComponent = sequelize.define(
  "SurveyComponent",
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
    component_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      comment: "组件唯一标识"
    },
    component_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "组件名称"
    },
    component_type: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "组件类型"
    },
    status: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "组件状态数据"
    },
    order_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "组件排序索引"
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
    tableName: "survey_components",
    timestamps: true,
    underscored: true
  }
);

// 关联关系
SurveyComponent.belongsTo(Survey, {
  foreignKey: "survey_id",
  targetKey: "survey_id",
  as: "survey"
});

Survey.hasMany(SurveyComponent, {
  foreignKey: "survey_id",
  sourceKey: "survey_id",
  as: "components"
});

export default SurveyComponent;
