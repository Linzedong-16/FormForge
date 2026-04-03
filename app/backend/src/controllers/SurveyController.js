import { Survey, SurveyComponent, SurveyResponse, sequelize } from "../models/index.js";

class SurveyController {
  // 生成在线问卷
  static async generateSurvey(req, res) {
    try {
      const { surveyId, coms } = req.body;

      // 验证请求数据
      if (!surveyId || !Array.isArray(coms)) {
        return res.status(400).json({
          success: false,
          message: "请求数据无效"
        });
      }

      // 先删除引用了surveys表的表，然后删除surveys和survey_components表
      await sequelize.query("DROP TABLE IF EXISTS survey_responses CASCADE");
      await sequelize.query("DROP TABLE IF EXISTS survey_components CASCADE");
      await sequelize.query("DROP TABLE IF EXISTS surveys CASCADE");

      // 重新创建表
      await sequelize.sync({ force: true });

      // 检查问卷是否已存在
      let survey = await Survey.findOne({ where: { survey_id: surveyId } });

      if (survey) {
        // 如果问卷已存在，更新组件
        await SurveyComponent.destroy({ where: { survey_id: surveyId } });
      } else {
        // 创建新问卷
        survey = await Survey.create({
          survey_id: surveyId,
          title: "未命名问卷", // 可以从前端获取标题
          description: ""
        });
      }

      // 存储问卷组件
      const components = coms.map((com, index) => ({
        survey_id: surveyId,
        component_id: com.id,
        component_name: com.name,
        component_type: JSON.stringify(com.type), // 将类型对象转换为字符串存储
        status: com.status,
        order_index: index
      }));

      await SurveyComponent.bulkCreate(components);

      res.status(200).json({
        success: true,
        message: "在线问卷生成成功",
        data: {
          surveyId,
          componentCount: coms.length
        }
      });
    } catch (error) {
      console.error("生成在线问卷失败:", error);
      res.status(500).json({
        success: false,
        message: "生成在线问卷失败",
        error: error.message
      });
    }
  }

  // 提交问卷答案
  static async submitAnswers(req, res) {
    try {
      const { surveyId, answers } = req.body;

      // 验证请求数据
      if (!surveyId || !answers) {
        return res.status(400).json({
          success: false,
          message: "请求数据无效，缺少必要参数"
        });
      }

      // 验证问卷是否存在
      const survey = await Survey.findOne({ where: { survey_id: surveyId } });
      if (!survey) {
        return res.status(404).json({
          success: false,
          message: "问卷不存在"
        });
      }

      // 在控制台打印接收到的数据
      console.log(`[${new Date().toISOString()}] 收到问卷答案:`);
      console.log(`问卷ID: ${surveyId}`);
      console.log(`答案数据:`, answers);
      console.log(`答案数量: ${Object.keys(answers).length}`);
      console.log(`数据完整性: ${typeof answers === "object" && answers !== null ? "完整" : "不完整"}`);

      // 存储问卷答案到数据库
      await SurveyResponse.create({
        survey_id: surveyId,
        answers: answers
      });

      // 返回符合RESTful规范的响应
      res.status(200).json({
        success: true,
        message: "问卷答案提交成功",
        data: {
          surveyId,
          answerCount: Object.keys(answers).length,
          submittedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("提交问卷答案失败:", error);
      res.status(500).json({
        success: false,
        message: "提交问卷答案失败",
        error: error.message
      });
    }
  }

  // 获取问卷详情（用于在线问卷展示）
  static async getSurveyForOnline(req, res) {
    try {
      const { surveyId } = req.params;

      if (!surveyId) {
        return res.status(400).json({
          success: false,
          message: "问卷ID不能为空"
        });
      }

      const survey = await Survey.findOne({
        where: { survey_id: surveyId },
        include: [
          {
            model: SurveyComponent,
            as: "components",
            order: [["order_index", "ASC"]]
          }
        ]
      });

      if (!survey) {
        return res.status(404).json({
          success: false,
          message: "问卷不存在"
        });
      }

      // 转换组件数据格式，适应前端需求
      const coms = survey.components.map(component => ({
        type: JSON.parse(component.component_type || "{}"), // 将字符串转换回对象
        name: component.component_name,
        id: component.component_id,
        status: component.status
      }));

      // 返回前端期望的数据格式
      res.status(200).json({
        success: true,
        coms: JSON.stringify(coms), // 将coms数组转换为JSON字符串
        surveyCount: coms.length
      });
    } catch (error) {
      console.error("获取问卷详情失败:", error);
      res.status(500).json({
        success: false,
        message: "获取问卷详情失败",
        error: error.message
      });
    }
  }

  // 获取问卷详情（用于问卷管理）
  static async getSurvey(req, res) {
    try {
      const { surveyId } = req.params;

      if (!surveyId) {
        return res.status(400).json({
          success: false,
          message: "问卷ID不能为空"
        });
      }

      const survey = await Survey.findOne({
        where: { survey_id: surveyId },
        include: [
          {
            model: SurveyComponent,
            as: "components",
            order: [["order_index", "ASC"]]
          }
        ]
      });

      if (!survey) {
        return res.status(404).json({
          success: false,
          message: "问卷不存在"
        });
      }

      // 转换组件数据格式，适应前端需求
      const coms = survey.components.map(component => ({
        type: JSON.parse(component.component_type || "{}"), // 将字符串转换回对象
        name: component.component_name,
        id: component.component_id,
        status: component.status
      }));

      res.status(200).json({
        success: true,
        data: {
          surveyId: survey.survey_id,
          title: survey.title,
          description: survey.description,
          coms
        }
      });
    } catch (error) {
      console.error("获取问卷详情失败:", error);
      res.status(500).json({
        success: false,
        message: "获取问卷详情失败",
        error: error.message
      });
    }
  }

  // 获取所有问卷
  static async getAllSurveys(req, res) {
    try {
      const surveys = await Survey.findAll({
        include: [
          {
            model: SurveyComponent,
            as: "components",
            order: [["order_index", "ASC"]]
          }
        ]
      });

      const result = surveys.map(survey => ({
        surveyId: survey.survey_id,
        title: survey.title,
        description: survey.description,
        componentCount: survey.components.length,
        createdAt: survey.created_at,
        updatedAt: survey.updated_at
      }));

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error("获取问卷列表失败:", error);
      res.status(500).json({
        success: false,
        message: "获取问卷列表失败",
        error: error.message
      });
    }
  }

  // 删除问卷
  static async deleteSurvey(req, res) {
    try {
      const { surveyId } = req.params;

      if (!surveyId) {
        return res.status(400).json({
          success: false,
          message: "问卷ID不能为空"
        });
      }

      // 删除问卷组件
      await SurveyComponent.destroy({ where: { survey_id: surveyId } });

      // 删除问卷
      const result = await Survey.destroy({ where: { survey_id: surveyId } });

      if (result === 0) {
        return res.status(404).json({
          success: false,
          message: "问卷不存在"
        });
      }

      res.status(200).json({
        success: true,
        message: "问卷删除成功"
      });
    } catch (error) {
      console.error("删除问卷失败:", error);
      res.status(500).json({
        success: false,
        message: "删除问卷失败",
        error: error.message
      });
    }
  }
}

export default SurveyController;
