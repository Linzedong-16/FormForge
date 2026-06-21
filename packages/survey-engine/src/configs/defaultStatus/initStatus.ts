import type { TypeStatus } from "../../types";
import { t } from "../../utils/i18n";

export const genderStatus = () => [
  t("components.defaultStatus.male"),
  t("components.defaultStatus.female"),
  t("components.defaultStatus.secret")
];

export const educationStatus = () => [
  t("components.defaultStatus.educationBelowJunior"),
  t("components.defaultStatus.educationHighSchool"),
  t("components.defaultStatus.educationCollege"),
  t("components.defaultStatus.educationBachelor"),
  t("components.defaultStatus.educationMasterPlus")
];

export const careerStatus = () => [
  t("components.defaultStatus.careerStudent"),
  t("components.defaultStatus.careerGovernment"),
  t("components.defaultStatus.careerManager"),
  t("components.defaultStatus.careerProfessional"),
  t("components.defaultStatus.careerClerk"),
  t("components.defaultStatus.careerWorker"),
  t("components.defaultStatus.careerService"),
  t("components.defaultStatus.careerSelfEmployed"),
  t("components.defaultStatus.careerFreelancer"),
  t("components.defaultStatus.careerAgriculture"),
  t("components.defaultStatus.careerRetired"),
  t("components.defaultStatus.careerUnemployed"),
  t("components.defaultStatus.careerOther")
];

export const ageStatus = () => [
  t("components.defaultStatus.ageBelow18"),
  t("components.defaultStatus.age25to30"),
  t("components.defaultStatus.age31to40"),
  t("components.defaultStatus.age41to50"),
  t("components.defaultStatus.age51to60"),
  t("components.defaultStatus.age61Plus")
];

import { v4 as uuidv4 } from "uuid";
import { markRaw } from "vue";
// 编辑器
import TextTypeEditor from "../../components/SurveyComs/EditItems/TextTypeEditor.vue";
import TitleEditor from "../../components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "../../components/SurveyComs/EditItems/DescEditor.vue";
import PositionEditor from "../../components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "../../components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "../../components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "../../components/SurveyComs/EditItems/ItalicEditor.vue";
import ColorEditor from "../../components/SurveyComs/EditItems/ColorEditor.vue";
import textNoteDefaultStatus from "../../configs/defaultStatus/remark/TextNote";
// 仓库的初始化状态
export const initStore = () => [
  Object.assign({}, textNoteDefaultStatus(), {
    status: <TypeStatus>{
      type: {
        id: uuidv4(),
        currentStatus: 0,
        status: [t("components.textTypeEditor.descriptionType"), t("common.paragraph")],
        isShow: true,
        editCom: markRaw(TextTypeEditor),
        name: "text-type-editor"
      },
      title: {
        id: uuidv4(),
        status: t("components.defaultStatus.questionnaireTitle"),
        isShow: true,
        editCom: markRaw(TitleEditor),
        name: "title-editor"
      },
      desc: {
        id: uuidv4(),
        status: t("components.defaultStatus.defaultDesc"),
        isShow: false,
        editCom: DescEditor,
        name: "desc-editor"
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: [t("components.defaultStatus.leftAlign"), t("components.defaultStatus.centerAlign")],
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
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: true,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: false,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
        isShow: true,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
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
        status: [t("components.textTypeEditor.descriptionType"), t("common.paragraph")],
        isShow: true,
        editCom: markRaw(TextTypeEditor),
        name: "text-type-editor"
      },
      title: {
        id: uuidv4(),
        status: t("components.defaultStatus.defaultTitle"),
        isShow: false,
        editCom: markRaw(TitleEditor),
        name: "title-editor"
      },
      desc: {
        id: uuidv4(),
        status: t("components.defaultStatus.defaultWelcome"),
        isShow: true,
        editCom: markRaw(DescEditor),
        name: "desc-editor"
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        status: [t("components.defaultStatus.leftAlign"), t("components.defaultStatus.centerAlign")],
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
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: false,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.bold"), t("components.defaultStatus.normal")],
        isShow: true,
        editCom: markRaw(WeightEditor),
        name: "weight-editor"
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
        isShow: false,
        editCom: markRaw(ItalicEditor),
        name: "italic-editor"
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        status: [t("components.defaultStatus.italic"), t("components.defaultStatus.normal")],
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
