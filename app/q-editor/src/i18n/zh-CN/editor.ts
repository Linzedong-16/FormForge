export default {
  // 编辑器标题
  pageTitle: "问卷编辑器",

  // 顶部操作按钮
  updateSurvey: "更新问卷",
  resetSurvey: "重置问卷",
  saveSurvey: "保存问卷",
  preview: "预览",
  undo: "撤销",
  redo: "重做",

  // 确认对话框
  confirmReset: "确定要重置问卷吗？",
  confirmTitle: "提示",
  confirm: "确定",
  cancel: "取消",
  confirmButton: "确定",
  cancelButton: "取消",

  // 消息提示
  resetSuccess: "重置成功",
  resetCancelled: "已取消重置",
  saveSuccess: "问卷已保存",
  saveFailed: "问卷保存失败",
  updateSuccess: "问卷已更新",
  updateFailed: "问卷更新失败",
  saveCancelled: "已取消保存",
  deleteSuccess: "删除成功",
  deleteCancelled: "已取消删除",

  // 保存对话框
  savePromptTitle: "请输入问卷的标题",

  // 预览对话框
  previewConfirm: "预览会自动保存问卷，是否跳转预览？",
  previewCancelled: "已取消跳转",

  // 未保存提示
  unsavedTitle: "未保存的修改",
  unsavedMessage: "当前问卷有未保存的修改，是否保存后再离开？",
  saveAndLeave: "保存并离开",
  leaveWithoutSave: "不保存",

  // 左侧面板
  outlineTitle: "大纲",
  surveyTypeTitle: "题型",
  outline: "大纲",
  surveyType: "题型",
  templateMarket: "模板市场",
  addQuestion: "请添加题目",

  // AI 功能
  aiPolish: "AI润色",
  aiGenerate: "AI一键生成",
  aiInputPlaceholder: "请输入需求描述...",
  aiSubmit: "提交",
  aiClear: "清空",

  // 模板市场
  template: {
    searchPlaceholder: "搜索模板...",
    categoryAll: "全部",
    categoryEducation: "教育",
    categoryMarket: "市场调研",
    categoryHr: "人力资源",
    categoryCustomer: "客户服务",
    categoryEvent: "活动",
    categoryOther: "其他",
    sortLabel: "排序",
    sortNewest: "最新",
    sortPopular: "最热",
    sortRating: "评分",
    loading: "加载中...",
    retry: "重试",
    emptyHint: "暂无可用模板",
    fetchFailed: "获取模板列表失败",
    fetchDetailFailed: "获取模板详情失败",
    noDescription: "暂无描述",
    noComponents: "模板无可用组件",
    useCount: "次使用",
    componentPreview: "组件预览",
    required: "必填",
    useTemplate: "使用此模板创建问卷",
    yourRating: "评分",
    useTemplateSuccess: "模板应用成功，已创建新问卷",
    useTemplateFailed: "模板应用失败",
    rateSuccess: "评分成功",
    rateFailed: "评分失败",
    detailTitle: "模板详情",
    applyShareTemplate: "申请共享模板"
  },
  templateDialogTitle: "申请共享模板",
  templateCategory: "模板分类",
  templateCategoryRequired: "请选择模板分类",
  templateCategoryEducation: "教育",
  templateCategoryMarket: "市场调研",
  templateCategoryHr: "人力资源",
  templateCategoryCustomer: "客户满意度",
  templateCategoryEvent: "活动报名",
  templateCategoryOther: "其他",
  templateSubmitMessage: "提交说明",
  templateSubmit: "提交申请",
  templateApplySuccess: "模板申请已提交成功",
  templateApplyFailed: "模板申请提交失败",
  templateSyncFirst: "请先同步问卷到远程",
  templateNeedSync: "模板申请需要先同步到远程，请先保存问卷",

  // 在线问卷生成
  generateOnlineSuccess: "在线问卷生成成功",
  generateOnlineFailed: "在线问卷生成失败",

  // 审核
  noSurveyData: "暂无问卷数据",
  reviewNeedOnline: "请先生成在线问卷",
  reviewConfirm: "确定要提交审核吗？",
  reviewSuccess: "提交审核成功",
  reviewFailed: "提交审核失败",
  reviewCancelled: "已取消审核",

  // 题型分组
  selectGroup: "选择题",
  advancedGroup: "高级题型",
  inputGroup: "输入框",
  noteGroup: "备注说明",
  personalInfoGroup: "个人信息",
  contactGroup: "联系信息",

  // 选择题类型
  singleSelect: "单选题",
  singlePicSelect: "图片单选",
  multiSelect: "多选题",
  multiPicSelect: "图片多选",
  optionSelect: "下拉选择",

  // 高级题型类型
  dateTime: "日期时间",
  rateScore: "评分",
  cascader: "多级联动",
  matrixSingle: "矩阵单选",
  slider: "滑块",
  transfer: "排序题",

  // 输入框类型
  textInput: "输入框",

  // 备注说明类型
  textNote: "备注说明",

  // 个人信息类型
  personalName: "姓名",
  personalGender: "性别",
  personalEducation: "学历",
  personalAge: "年龄",
  personalCareer: "职业",
  personalSchool: "学校",
  personalMajor: "专业",
  personalIndustry: "行业",
  personalCompany: "公司",
  personalPosition: "岗位",
  personalId: "身份证号",

  // 联系信息类型
  personalAddress: "地址",
  personalTel: "电话",
  personalWechat: "微信",
  personalQQ: "QQ",
  personalEmail: "邮箱",

  // 右侧编辑面板
  editPanelTitle: "属性编辑",
  clickToEdit: "点击题型进行编辑",
  selectComponentFirst: "请先选中该图片题目组件后再上传图片",
  deleteConfirm: "确定删除该组件吗？",
  deleteTitle: "提示",
  keepTwoOptions: "至少保留两个选项",
  keepTwoItems: "至少保留两项",
  titleEdit: "标题",
  descEdit: "描述",
  optionsEdit: "选项",
  requiredEdit: "必填",
  positionEdit: "位置",
  sizeEdit: "尺寸",
  weightEdit: "权重",
  italicEdit: "斜体",
  colorEdit: "颜色",
  textTypeEdit: "文本类型",
  textInputTypeEdit: "输入类型",
  dateTimeTypeEdit: "日期类型",
  rateTextEdit: "评分文字",
  sliderConfigEdit: "滑块配置",
  matrixOptionsEdit: "矩阵选项",
  cascaderOptionsEdit: "级联选项",
  picOptionsEdit: "图片选项",

  // 选项编辑
  addOption: "添加选项",
  removeOption: "删除选项",
  optionLabel: "选项",

  // 滑块配置
  sliderMin: "最小值",
  sliderMax: "最大值",
  sliderStep: "步长",
  sliderDefault: "默认值",

  // 评分配置
  rateMax: "最大评分",
  rateAllowHalf: "允许半星",

  // 日期配置
  dateFormat: "日期格式",
  timeFormat: "时间格式",
  dateRange: "日期范围",

  // 级联配置
  cascaderLevels: "级联层级",
  cascaderLevel: "层级",

  // 矩阵配置
  matrixRows: "行",
  matrixCols: "列",
  matrixRow: "行",
  matrixCol: "列",

  // ══════════════════════════════════════════════════════════
  //  AI 一键生成
  // ══════════════════════════════════════════════════════════
  aiPanelTitle: "AI 一键生成问卷",
  aiPanelDesc: "用自然语言描述你的需求，AI 将自动生成一份完整的问卷",
  aiPromptLabel: "需求描述",
  aiPromptPlaceholder: "例如：生成一份员工敬业度调查问卷，包含工作满意度、职业发展、团队协作、薪酬福利等方面的问题",
  aiCountLabel: "题目数量",
  aiLanguageLabel: "语言",
  aiGenerateBtn: "开始生成",
  aiCancelBtn: "取消生成",
  aiGenerating: "AI 正在生成问卷...",
  aiStreamPreview: "实时预览",
  aiGeneratedComponents: "已生成组件",
  aiPreviewBtn: "预览生成结果",
  aiApplyBtn: "应用到编辑器",
  aiRetryBtn: "重新生成",
  aiCloseBtn: "关闭",
  aiHistoryTitle: "生成历史",
  aiNoHistory: "暂无生成历史",
  aiApplySuccess: "问卷已应用到编辑器",
  aiApplyConfirm: "当前编辑器有未保存的内容，应用 AI 生成结果将覆盖现有内容，是否继续？",
  aiApplyModeTitle: "选择应用方式",
  aiApplyModeDesc: "请选择 AI 生成内容的处理方式：",
  aiApplyModeOverwrite: "覆盖当前问卷",
  aiApplyModeAppend: "追加到当前问卷",
  aiApplyOverwriteSuccess: "问卷已替换为 AI 生成内容",
  aiApplyAppendSuccess: "AI 生成内容已追加到问卷末尾",
  aiNetworkError: "网络连接异常，请检查网络后重试",
  aiTimeoutError: "AI 生成超时，请稍后重试",
  aiServiceError: "AI 服务暂时不可用，请稍后重试",
  aiRateLimitError: "请求过于频繁，请稍后再试",
  aiNotConfigured: "AI 服务未配置，请联系管理员",
  aiEmptyPrompt: "请输入需求描述",
  aiPromptTooShort: "需求描述至少需要 5 个字符",
  aiPromptTooLong: "需求描述不能超过 2000 个字符",
  aiNoComponents: "未生成任何有效组件，请尝试调整需求描述后重试",
  aiWarningTitle: "生成提示",
  aiWarningBadType: '组件类型 "{type}" 不支持，已跳过',

  // ══════════════════════════════════════════════════════════
  //  AI 润色问卷
  // ══════════════════════════════════════════════════════════
  aiPolishLabel: "润色指令",
  aiPolishPlaceholder: "例如：优化题目逻辑顺序，让问题从易到难排列；改善第3题的措辞使其更中立",
  aiPolishAspects: "润色维度（可多选，不选则全维度润色）",
  aiPolishStart: "开始润色",
  aiPolishing: "AI 正在润色问卷...",
  aiPolishDone: "润色完成",
  aiPolishChanges: "变更说明",
  aiPolishApply: "应用润色结果",
  aiPolishFailed: "AI 润色失败",
  aiPolishApplyConfirm: "润色结果将完全替换当前问卷内容，是否继续？",
  aiPolishApplyTitle: "确认应用润色",
  aiPolishApplySuccess: "润色结果已应用"
};
