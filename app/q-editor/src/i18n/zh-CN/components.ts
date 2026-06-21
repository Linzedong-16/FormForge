export default {
  // PicItem 组件
  picItem: {
    addImage: "添加图片",
    uploadFailed: "图片上传失败",
    uploadSuccess: "图片上传成功",
    saveFailed: "图片上传成功但无法保存，请先选中组件",
    sizeLimit: "图片大小不要超过2MB!"
  },

  // OptionsEditor 组件
  optionsEditor: {
    options: "选项"
  },

  // TitleEditor 组件
  titleEditor: {
    titleContent: "标题内容",
    placeholder: "请输入题目标题"
  },

  // DescEditor 组件
  descEditor: {
    descContent: "描述内容",
    placeholder: "请输入描述内容"
  },

  // SliderConfigEditor 组件
  sliderConfigEditor: {
    sliderConfig: "滑块配置",
    min: "最小值",
    max: "最大值",
    step: "步长"
  },

  // MatrixOptionsEditor 组件
  matrixOptionsEditor: {
    row: "评价维度（行）",
    column: "评价等级（列）",
    rowPlaceholder: "维度名称",
    columnPlaceholder: "等级名称"
  },

  // CascaderOptionsEditor 组件
  cascaderOptionsEditor: {
    customCascader: "自定义级联",
    maxLevel: "最多 4 级",
    addressMode: "当前为地址模式（省 / 市 / 区）"
  },

  // PicOptionsEditor 组件
  picOptionsEditor: {
    questionOptions: "题目选项",
    option: "选项",
    uploaded: "已上传图片",
    deletePic: "删除图片",
    notUploaded: "未上传图片",
    picTitle: "图片标题",
    picDesc: "图片描述",
    deleteConfirm: "是否确认删除已上传的图片？",
    warning: "警告",
    confirm: "确认",
    cancel: "取消",
    deleteSuccess: "图片删除成功",
    deleteCanceled: "已取消删除"
  },

  // RateTextEditor 组件
  rateTextEditor: {
    auxiliaryText: "辅助文字"
  },

  // TextTypeEditor 组件
  textTypeEditor: {
    descriptionType: "说明类型"
  },

  // DateTimeTypeEditor 组件
  dateTimeTypeEditor: {
    dateType: "日期类型"
  },

  // TextInputTypeEditor 组件
  textInputTypeEditor: {
    textType: "文本类型"
  },

  // PositionEditor 组件
  positionEditor: {
    alignment: "居中设置"
  },

  // SizeEditor 组件
  sizeEditor: {
    title: "标题",
    desc: "描述",
    size: "尺寸"
  },

  // WeightEditor 组件
  weightEditor: {
    title: "标题",
    desc: "描述",
    bold: "加粗"
  },

  // ItalicEditor 组件
  italicEditor: {
    title: "标题",
    desc: "描述",
    italic: "倾斜"
  },

  // ColorEditor 组件
  colorEditor: {
    title: "标题",
    desc: "描述",
    color: "颜色"
  },

  // OptionSelect 组件
  optionSelect: {
    placeholder: "请选择"
  },

  // Cascader 组件
  cascader: {
    placeholder: "请选择"
  },

  // DateTime 组件
  dateTime: {
    placeholder: "请选择日期"
  },

  // Transfer 组件
  transfer: {
    pending: "待排序",
    sorted: "已排序"
  },

  // Signature 组件
  signature: {
    undo: "撤销",
    clear: "清空",
    signed: "已签名",
    unsigned: "未签名",
    uploading: "上传中..."
  },

  // SignatureConfigEditor 组件
  signatureConfigEditor: {
    strokeWidth: "笔画粗细",
    showToolbar: "工具栏"
  },

  // 配置文件 - SurveyGroupConfig
  surveyGroup: {
    choiceQuestions: "选择题",
    singleSelect: "单选题",
    singlePicSelect: "图片单选",
    multiSelect: "多选题",
    multiPicSelect: "图片多选",
    optionSelect: "下拉选择",
    advanced: "高级题型",
    dateTime: "日期时间",
    rateScore: "评分",
    cascader: "多级联动",
    matrixSingle: "矩阵单选",
    slider: "滑块",
    transfer: "排序题",
    signature: "电子签名",
    inputBox: "输入框",
    textInput: "输入框",
    note: "备注说明",
    textNote: "备注说明",
    personalInfo: "个人信息",
    name: "姓名",
    gender: "性别",
    education: "学历",
    age: "年龄",
    career: "职业",
    college: "学校",
    major: "专业",
    industry: "行业",
    company: "公司",
    position: "岗位",
    idCard: "身份证号",
    contactInfo: "联系信息",
    address: "地址",
    tel: "电话",
    wechat: "微信",
    qq: "QQ",
    email: "邮箱"
  },

  // 配置文件 - 默认状态
  defaultStatus: {
    // 编辑器状态
    leftAlign: "左对齐",
    centerAlign: "居中对齐",
    bold: "加粗",
    normal: "正常",
    italic: "斜体",
    // 尺寸
    titleSize: "标题尺寸",
    descSize: "描述尺寸",
    // 默认文本
    questionnaireTitle: "问卷标题",
    defaultDesc: "默认描述内容",
    defaultTitle: "默认标题内容",
    defaultWelcome:
      "为了给您提供更好的服务，希望您能抽出几分钟时间，将您的感受和建议告诉我们，我们非常重视每位用户的宝贵意见，期待您的参与！现在我们就马上开始吧！",
    // 单选题
    singleSelectTitle: "单选题默认标题",
    singleSelectDesc: "单选题默认描述",
    defaultOption1: "默认选项 1",
    defaultOption2: "默认选项 2",
    // 多选题
    multiSelectTitle: "默认多选题标题",
    multiSelectDesc: "默认多选题描述内容",
    multiSelectOption1: "默认多选题选项 1",
    multiSelectOption2: "默认多选题选项 2",
    // 下拉选择
    optionSelectTitle: "默认下拉选择题标题内容",
    optionSelectDesc: "默认下拉选择题描述内容",
    optionSelect1: "默认下拉选项 1",
    optionSelect2: "默认下拉选项 2",
    // 性别选项
    male: "男",
    female: "女",
    secret: "保密",
    // 学历选项
    educationBelowJunior: "初中及以下",
    educationHighSchool: "高中/中专/技校",
    educationCollege: "大学专科",
    educationBachelor: "大学本科",
    educationMasterPlus: "硕士及以上",
    // 职业选项
    careerStudent: "在校学生",
    careerGovernment: "政府/机关干部/公务员",
    careerManager: "企业管理者（包括基层及中高层管理者）",
    careerProfessional: "专业人员（如医生/律师/文体/记者/老师等）",
    careerClerk: "普通职员（办公室/写字楼工作人员）",
    careerWorker: "普通工人（如工厂工人/体力劳动者等）",
    careerService: "商业服务业职工（如销售人员/商店职员/服务员等）",
    careerSelfEmployed: "个体经营者/承包商",
    careerFreelancer: "自由职业者",
    careerAgriculture: "农林牧渔劳动者",
    careerRetired: "退休",
    careerUnemployed: "暂无职业",
    careerOther: "其他",
    // 年龄选项
    ageBelow18: "18 岁以下",
    age25to30: "25～30 岁",
    age31to40: "31～40 岁",
    age41to50: "41～50 岁",
    age51to60: "51～60 岁",
    age61Plus: "61 岁及以上"
  }
};
