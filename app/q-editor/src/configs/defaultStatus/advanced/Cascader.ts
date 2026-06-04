import Cascader from "@/components/SurveyComs/Materials/AdvancedComs/Cascader.vue";
import type { Status } from "@/types";
import TitleEditor from "@/components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "@/components/SurveyComs/EditItems/DescEditor.vue";
import PositionEditor from "@/components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "@/components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "@/components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "@/components/SurveyComs/EditItems/ItalicEditor.vue";
import ColorEditor from "@/components/SurveyComs/EditItems/ColorEditor.vue";
import CascaderOptionsEditor from "@/components/SurveyComs/EditItems/CascaderOptionsEditor.vue";
import { markRaw } from "vue";
import { v4 as uuidv4 } from "uuid";

// 多级联动题默认状态：仅含通用样式配置项（无 type / options），
// 省/市/区数据由业务组件内置，无需在 status 中维护，避免引入新的 configKey。
export default function (): Status {
  return {
    type: markRaw(Cascader),
    name: "cascader",
    id: uuidv4(),
    status: {
      title: {
        id: uuidv4(),
        status: "默认多级联动标题",
        isShow: true,
        name: "title-editor",
        editCom: markRaw(TitleEditor)
      },
      desc: {
        id: uuidv4(),
        status: "默认多级联动描述内容",
        isShow: true,
        name: "desc-editor",
        editCom: markRaw(DescEditor)
      },
      // 级联数据源配置：isUse=false 为地址模式（内置省/市/区），true 为自定义模式（使用下方 status 级联树）
      cascaderOptions: {
        id: uuidv4(),
        currentStatus: 0,
        isUse: false,
        status: [
          {
            label: "一级选项1",
            value: uuidv4(),
            children: [
              { label: "二级选项1", value: uuidv4() },
              { label: "二级选项2", value: uuidv4() }
            ]
          },
          {
            label: "一级选项2",
            value: uuidv4(),
            children: [{ label: "二级选项1", value: uuidv4() }]
          }
        ],
        isShow: true,
        name: "cascader-options-editor",
        editCom: markRaw(CascaderOptionsEditor)
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
