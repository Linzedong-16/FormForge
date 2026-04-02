import type { TypeStatus } from "@/types";

// 专门导出各种初始值
export const genderStatus = () => ["男", "女", "保密"];

export const educationStatus = () => ["初中及以下", "高中/中专/技校", "大学专科", "大学本科", "硕士及以上"];

export const careerStatus = () => [
  "在校学生",
  "政府/机关干部/公务员",
  "企业管理者（包括基层及中高层管理者）",
  "专业人员（如医生/律师/文体/记者/老师等）",
  "普通职员（办公室/写字楼工作人员）",
  "普通工人（如工厂工人/体力劳动者等）",
  "商业服务业职工（如销售人员/商店职员/服务员等）",
  "个体经营者/承包商",
  "自由职业者",
  "农林牧渔劳动者",
  "退休",
  "暂无职业",
  "其他"
];

export const ageStatus = () => ["18岁以下", "25～30岁", "31～40岁", "41～50岁", "51～60岁", "61岁及以上"];

import { v4 as uuidv4 } from "uuid";
import { markRaw } from "vue";
// 编辑器
import TextTypeEditor from "@/components/SurveyComs/EditItems/TextTypeEditor.vue";
import TitleEditor from "@/components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "@/components/SurveyComs/EditItems/DescEditor.vue";
import PositionEditor from "@/components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "@/components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "@/components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "@/components/SurveyComs/EditItems/ItalicEditor.vue";
import ColorEditor from "@/components/SurveyComs/EditItems/ColorEditor.vue";
import textNoteDefaultStatus from "@/configs/defaultStatus/remark/TextNote";
// 仓库的初始化状态
export const initStore = () => [
  Object.assign({}, textNoteDefaultStatus(), {
    status: <TypeStatus>{
      type: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["标题", "段落"],
        isShow: true,
        editCom: markRaw(TextTypeEditor),
        name: "text-type-editor"
      },
      title: {
        id: uuidv4(),
        status: "问卷标题",
        isShow: true,
        editCom: markRaw(TitleEditor),
        name: "title-editor"
      },
      desc: {
        id: uuidv4(),
        status: "默认描述内容",
        isShow: false,
        editCom: DescEditor,
        name: "desc-editor"
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["左对齐", "居中对齐"],
        isShow: false,
        editCom: markRaw(PositionEditor),
        name: "position-editor"
      },
      titleSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["26", "24", "22"],
        isShow: true,
        editCom: markRaw(SizeEditor),
        name: "size-editor"
      },
      descSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: false,
        editCom: markRaw(SizeEditor),
        name: "size-editor"
      },
      titleWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: true,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: false,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: false,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      titleColor: {
        id: uuidv4(),
        status: "#000",
        isShow: true,
        editCom: markRaw(ColorEditor),
        name: "color-editor"
      },
      descColor: {
        id: uuidv4(),
        status: "#909399",
        isShow: false,
        editCom: markRaw(ColorEditor),
        name: "color-editor"
      }
    }
  }),
  Object.assign({}, textNoteDefaultStatus(), {
    status: <TypeStatus>{
      type: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["标题", "段落"],
        isShow: true,
        editCom: markRaw(TextTypeEditor),
        name: "text-type-editor"
      },
      title: {
        id: uuidv4(),
        status: "默认标题内容",
        isShow: false,
        editCom: markRaw(TitleEditor),
        name: "title-editor"
      },
      desc: {
        id: uuidv4(),
        status:
          "为了给您提供更好的服务，希望您能抽出几分钟时间，将您的感受和建议告诉我们，我们非常重视每位用户的宝贵意见，期待您的参与！现在我们就马上开始吧！",
        isShow: true,
        editCom: markRaw(DescEditor),
        name: "desc-editor"
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["左对齐", "居中对齐"],
        isShow: true,
        editCom: markRaw(PositionEditor),
        name: "position-editor"
      },
      titleSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["26", "24", "22"],
        isShow: false,
        editCom: markRaw(SizeEditor),
        name: "size-editor"
      },
      descSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        editCom: markRaw(SizeEditor),
        name: "size-editor"
      },
      titleWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: false,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: true,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: false,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      titleColor: {
        id: uuidv4(),
        status: "#000",
        isShow: false,
        editCom: markRaw(ColorEditor),
        name: "color-editor"
      },
      descColor: {
        id: uuidv4(),
        status: "#909399",
        isShow: true,
        editCom: markRaw(ColorEditor),
        name: "color-editor"
      }
    }
  })
];
