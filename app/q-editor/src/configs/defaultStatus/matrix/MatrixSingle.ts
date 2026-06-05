import MatrixSingle from "@/components/SurveyComs/Materials/MatrixComs/MatrixSingle.vue";
import type { Status } from "@/types";
import TitleEditor from "@/components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "@/components/SurveyComs/EditItems/DescEditor.vue";
import PositionEditor from "@/components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "@/components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "@/components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "@/components/SurveyComs/EditItems/ItalicEditor.vue";
import ColorEditor from "@/components/SurveyComs/EditItems/ColorEditor.vue";
import MatrixOptionsEditor from "@/components/SurveyComs/EditItems/MatrixOptionsEditor.vue";
import { markRaw } from "vue";
import { v4 as uuidv4 } from "uuid";

// 矩阵单选题默认状态：通用样式 + matrixRows（评价维度）+ matrixColumns（评价等级），
// 行/列均为字符串数组，复用 OptionsProps 与 addOption/removeOption 的增删逻辑。
export default function (): Status {
  return {
    type: markRaw(MatrixSingle),
    name: "matrix-single",
    id: uuidv4(),
    status: {
      title: {
        id: uuidv4(),
        status: "默认矩阵单选题标题",
        isShow: true,
        name: "title-editor",
        editCom: markRaw(TitleEditor)
      },
      desc: {
        id: uuidv4(),
        status: "默认矩阵单选题描述内容",
        isShow: true,
        name: "desc-editor",
        editCom: markRaw(DescEditor)
      },
      // 行：评价维度
      matrixRows: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["服务态度", "响应速度", "专业程度"],
        isShow: true,
        name: "matrix-options-editor",
        editCom: markRaw(MatrixOptionsEditor)
      },
      // 列：评价等级
      matrixColumns: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["非常满意", "满意", "一般", "不满意"],
        isShow: true,
        name: "matrix-options-editor",
        editCom: markRaw(MatrixOptionsEditor)
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["左对齐", "居中对齐"],
        isShow: true,
        name: "position-editor",
        editCom: markRaw(PositionEditor)
      },
      titleSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor",
        editCom: markRaw(SizeEditor)
      },
      descSize: {
        id: uuidv4(),
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor",
        editCom: markRaw(SizeEditor)
      },
      titleWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: true,
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["加粗", "正常"],
        isShow: true,
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor",
        editCom: markRaw(ItalicEditor)
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor",
        editCom: markRaw(ItalicEditor)
      },
      titleColor: {
        id: uuidv4(),
        status: "#000",
        isShow: true,
        name: "color-editor",
        editCom: markRaw(ColorEditor)
      },
      descColor: {
        id: uuidv4(),
        status: "#909399",
        isShow: true,
        name: "color-editor",
        editCom: markRaw(ColorEditor)
      }
    }
  };
}
