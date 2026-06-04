// 该文件是题型面板对应的配置文件，用于配置题型面板的题型信息
import { CircleCheck, ChatLineSquare, User, EditPen, Files, Message } from "@element-plus/icons-vue";
export const SurveyComsList = [
  {
    title: "选择题",
    icon: CircleCheck,
    list: [
      { materialName: "single-select", comName: "单选题" },
      { materialName: "single-pic-select", comName: "图片单选" },
      { materialName: "multi-select", comName: "多选题" },
      { materialName: "multi-pic-select", comName: "图片多选" },
      { materialName: "option-select", comName: "下拉选择" }
    ]
  },
  {
    title: "高级题型",
    icon: Files,
    list: [
      { materialName: "date-time", comName: "日期时间" },
      { materialName: "rate-score", comName: "评分" },
      { materialName: "cascader", comName: "多级联动" }
    ]
  },
  {
    title: "输入框",
    icon: EditPen,
    list: [{ materialName: "text-input", comName: "输入框" }]
  },
  {
    title: "备注说明",
    icon: ChatLineSquare,
    list: [{ materialName: "text-note", comName: "备注说明" }]
  },
  {
    title: "个人信息",
    icon: User,
    list: [
      { materialName: "personal-info-name", comName: "姓名" },
      { materialName: "personal-info-gender", comName: "性别" },
      { materialName: "personal-info-education", comName: "学历" },
      { materialName: "personal-info-age", comName: "年龄" },
      { materialName: "personal-info-career", comName: "职业" },
      { materialName: "personal-info-collage", comName: "学校" },
      { materialName: "personal-info-major", comName: "专业" },
      { materialName: "personal-info-industry", comName: "行业" },
      { materialName: "personal-info-company", comName: "公司" },
      { materialName: "personal-info-position", comName: "岗位" },
      { materialName: "personal-info-id", comName: "身份证号" }
    ]
  },
  {
    title: "联系信息",
    icon: Message,
    list: [
      { materialName: "personal-info-address", comName: "地址" },
      { materialName: "personal-info-tel", comName: "电话" },
      { materialName: "personal-info-wechat", comName: "微信" },
      { materialName: "personal-info-qq", comName: "QQ" },
      { materialName: "personal-info-email", comName: "邮箱" }
    ]
  }
];
