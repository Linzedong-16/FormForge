// 该文件是题型面板对应的配置文件，用于配置题型面板的题型信息
import { CircleCheck, ChatLineSquare, User, EditPen, Files, Message } from "@element-plus/icons-vue";
import type { MaterialGroup } from "@/types";
import { t } from "@/utils/i18n";

export function getSurveyComsList(): MaterialGroup[] {
  return [
    {
      title: t("components.surveyGroup.choiceQuestions"),
      icon: CircleCheck,
      list: [
        { materialName: "single-select", comName: t("components.surveyGroup.singleSelect") },
        { materialName: "single-pic-select", comName: t("components.surveyGroup.singlePicSelect") },
        { materialName: "multi-select", comName: t("components.surveyGroup.multiSelect") },
        { materialName: "multi-pic-select", comName: t("components.surveyGroup.multiPicSelect") },
        { materialName: "option-select", comName: t("components.surveyGroup.optionSelect") }
      ]
    },
    {
      title: t("components.surveyGroup.advanced"),
      icon: Files,
      list: [
        { materialName: "date-time", comName: t("components.surveyGroup.dateTime") },
        { materialName: "rate-score", comName: t("components.surveyGroup.rateScore") },
        { materialName: "cascader", comName: t("components.surveyGroup.cascader") },
        { materialName: "matrix-single", comName: t("components.surveyGroup.matrixSingle") },
        { materialName: "slider", comName: t("components.surveyGroup.slider") },
        { materialName: "transfer", comName: t("components.surveyGroup.transfer") }
      ]
    },
    {
      title: t("components.surveyGroup.inputBox"),
      icon: EditPen,
      list: [{ materialName: "text-input", comName: t("components.surveyGroup.textInput") }]
    },
    {
      title: t("components.surveyGroup.note"),
      icon: ChatLineSquare,
      list: [{ materialName: "text-note", comName: t("components.surveyGroup.textNote") }]
    },
    {
      title: t("components.surveyGroup.personalInfo"),
      icon: User,
      list: [
        { materialName: "personal-info-name", comName: t("components.surveyGroup.name") },
        { materialName: "personal-info-gender", comName: t("components.surveyGroup.gender") },
        { materialName: "personal-info-education", comName: t("components.surveyGroup.education") },
        { materialName: "personal-info-age", comName: t("components.surveyGroup.age") },
        { materialName: "personal-info-career", comName: t("components.surveyGroup.career") },
        { materialName: "personal-info-collage", comName: t("components.surveyGroup.college") },
        { materialName: "personal-info-major", comName: t("components.surveyGroup.major") },
        { materialName: "personal-info-industry", comName: t("components.surveyGroup.industry") },
        { materialName: "personal-info-company", comName: t("components.surveyGroup.company") },
        { materialName: "personal-info-position", comName: t("components.surveyGroup.position") },
        { materialName: "personal-info-id", comName: t("components.surveyGroup.idCard") }
      ]
    },
    {
      title: t("components.surveyGroup.contactInfo"),
      icon: Message,
      list: [
        { materialName: "personal-info-address", comName: t("components.surveyGroup.address") },
        { materialName: "personal-info-tel", comName: t("components.surveyGroup.tel") },
        { materialName: "personal-info-wechat", comName: t("components.surveyGroup.wechat") },
        { materialName: "personal-info-qq", comName: t("components.surveyGroup.qq") },
        { materialName: "personal-info-email", comName: t("components.surveyGroup.email") }
      ]
    }
  ];
}
