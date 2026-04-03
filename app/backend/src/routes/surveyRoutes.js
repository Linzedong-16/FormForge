import express from "express";
import SurveyController from "../controllers/SurveyController.js";

const router = express.Router();

// 生成在线问卷
router.post("/generateSurvey", SurveyController.generateSurvey);

// 提交问卷答案
router.post("/submitAnswers", SurveyController.submitAnswers);

// 获取问卷详情（用于在线问卷展示）
router.get("/getSurvey/:surveyId", SurveyController.getSurveyForOnline);

// 获取问卷详情（用于问卷管理）
router.get("/survey/:surveyId", SurveyController.getSurvey);

// 获取所有问卷
router.get("/surveys", SurveyController.getAllSurveys);

// 删除问卷
router.delete("/survey/:surveyId", SurveyController.deleteSurvey);

export default router;
