// 单选题的 JSON-Schema 配置
// 单选题（业务组件） ---> 编辑组件有哪些

// 业务组件
import SingleSelect from "../../../components/SurveyComs/Materials/SelectComs/SingleSelect.vue";
// 编辑组件
import TitleEditor from "../../../components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "../../../components/SurveyComs/EditItems/DescEditor.vue";
import OptionsEditor from "../../../components/SurveyComs/EditItems/OptionsEditor.vue";
import PositionEditor from "../../../components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "../../../components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "../../../components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "../../../components/SurveyComs/EditItems/ItalicEditor.vue";
import ColorEditor from "../../../components/SurveyComs/EditItems/ColorEditor.vue";
import { markRaw } from "vue";
import { v4 as uuidv4 } from "uuid";
import type { Status } from "../../../types";
import { t } from "../../../utils/i18n";

export default function (): Status {
  return {
    type: markRaw(SingleSelect),
    name: "single-select",
    id: uuidv4(),
    // 组件的状态：组件的每一个能够修改的状态都应该对应一个编辑组件
    status: {
      title: {
        id: uuidv4(),
        status: t("components.defaultStatus.singleSelectTitle"),
        isShow: true,
        name: "title-editor",
        editCom: markRaw(TitleEditor)
      },
      desc: {
        id: uuidv4(),
        status: t("components.defaultStatus.singleSelectDesc"),
        isShow: true,
        name: "desc-editor",
        editCom: markRaw(DescEditor)
      },
      options: {
        id: uuidv4(),
        status: [t("components.defaultStatus.defaultOption1"), t("components.defaultStatus.defaultOption2")],
        currentStatus: 0,
        isShow: true,
        name: "options-editor",
        editCom: markRaw(OptionsEditor)
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: [t("components.defaultStatus.leftAlign"), t("components.defaultStatus.centerAlign")],
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
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: true,
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: true,
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
        isShow: true,
        name: "italic-editor",
        editCom: markRaw(ItalicEditor)
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
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
