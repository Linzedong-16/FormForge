import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const Survey = sequelize.define(
  "Survey",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    survey_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      comment: "问卷唯一标识"
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "问卷标题"
    },
    description: {
      type: DataTypes.TEXT,
      comment: "问卷描述"
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
    tableName: "surveys",
    timestamps: true,
    underscored: true
  }
);

export default Survey;
