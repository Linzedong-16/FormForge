export default {
  // PicItem コンポーネント
  picItem: {
    addImage: "画像を追加",
    uploadFailed: "画像のアップロードに失敗しました",
    uploadSuccess: "画像のアップロードに成功しました",
    saveFailed: "画像のアップロードに成功しましたが保存できません。先にコンポーネントを選択してください",
    sizeLimit: "画像サイズは2MBを超えないでください！"
  },

  // OptionsEditor コンポーネント
  optionsEditor: {
    options: "選択肢"
  },

  // TitleEditor コンポーネント
  titleEditor: {
    titleContent: "タイトル",
    placeholder: "質問タイトルを入力してください"
  },

  // DescEditor コンポーネント
  descEditor: {
    descContent: "説明",
    placeholder: "説明を入力してください"
  },

  // SliderConfigEditor コンポーネント
  sliderConfigEditor: {
    sliderConfig: "スライダー設定",
    min: "最小値",
    max: "最大値",
    step: "ステップ"
  },

  // MatrixOptionsEditor コンポーネント
  matrixOptionsEditor: {
    row: "評価次元（行）",
    column: "評価レベル（列）",
    rowPlaceholder: "次元名",
    columnPlaceholder: "レベル名"
  },

  // CascaderOptionsEditor コンポーネント
  cascaderOptionsEditor: {
    customCascader: "カスタムカスケード",
    maxLevel: "最大4階層",
    addressMode: "現在のモード：住所（都道府県/市区町村）"
  },

  // PicOptionsEditor コンポーネント
  picOptionsEditor: {
    questionOptions: "質問選択肢",
    option: "選択肢",
    uploaded: "アップロード済み",
    deletePic: "画像を削除",
    notUploaded: "未アップロード",
    picTitle: "画像タイトル",
    picDesc: "画像説明",
    deleteConfirm: "アップロードした画像を削除してもよろしいですか？",
    warning: "警告",
    confirm: "確認",
    cancel: "キャンセル",
    deleteSuccess: "画像の削除に成功しました",
    deleteCanceled: "削除をキャンセルしました"
  },

  // RateTextEditor コンポーネント
  rateTextEditor: {
    auxiliaryText: "補助テキスト"
  },

  // TextTypeEditor コンポーネント
  textTypeEditor: {
    descriptionType: "説明タイプ"
  },

  // DateTimeTypeEditor コンポーネント
  dateTimeTypeEditor: {
    dateType: "日付タイプ"
  },

  // TextInputTypeEditor コンポーネント
  textInputTypeEditor: {
    textType: "テキストタイプ"
  },

  // PositionEditor コンポーネント
  positionEditor: {
    alignment: "配置"
  },

  // SizeEditor コンポーネント
  sizeEditor: {
    title: "タイトル",
    desc: "説明",
    size: "サイズ"
  },

  // WeightEditor コンポーネント
  weightEditor: {
    title: "タイトル",
    desc: "説明",
    bold: "太字"
  },

  // ItalicEditor コンポーネント
  italicEditor: {
    title: "タイトル",
    desc: "説明",
    italic: "斜体"
  },

  // ColorEditor コンポーネント
  colorEditor: {
    title: "タイトル",
    desc: "説明",
    color: "色"
  },

  // OptionSelect コンポーネント
  optionSelect: {
    placeholder: "選択してください"
  },

  // Cascader コンポーネント
  cascader: {
    placeholder: "選択してください"
  },

  // DateTime コンポーネント
  dateTime: {
    placeholder: "日付を選択してください"
  },

  // Transfer コンポーネント
  transfer: {
    pending: "未ソート",
    sorted: "ソート済み"
  },

  // Signature コンポーネント
  signature: {
    undo: "元に戻す",
    clear: "クリア",
    signed: "署名済み",
    unsigned: "未署名"
  },

  // SignatureConfigEditor コンポーネント
  signatureConfigEditor: {
    strokeWidth: "線の太さ",
    showToolbar: "ツールバー"
  },

  // 設定ファイル - SurveyGroupConfig
  surveyGroup: {
    choiceQuestions: "選択問題",
    singleSelect: "単一選択",
    singlePicSelect: "画像単一選択",
    multiSelect: "複数選択",
    multiPicSelect: "画像複数選択",
    optionSelect: "ドロップダウン選択",
    advanced: "高度な問題",
    dateTime: "日時",
    rateScore: "評価スコア",
    cascader: "カスケード選択",
    matrixSingle: "マトリックス単一選択",
    slider: "スライダー",
    transfer: "並べ替え",
    signature: "電子署名",
    inputBox: "入力ボックス",
    textInput: "テキスト入力",
    note: "備考",
    textNote: "テキスト備考",
    personalInfo: "個人情報",
    name: "氏名",
    gender: "性別",
    education: "学歴",
    age: "年齢",
    career: "職業",
    college: "学校",
    major: "専攻",
    industry: "業界",
    company: "会社",
    position: "職位",
    idCard: "身分証明書",
    contactInfo: "連絡先",
    address: "住所",
    tel: "電話",
    wechat: "WeChat",
    qq: "QQ",
    email: "メール"
  },

  // 設定ファイル - デフォルトステータス
  defaultStatus: {
    // エディタステータス
    leftAlign: "左揃え",
    centerAlign: "中央揃え",
    bold: "太字",
    normal: "正常",
    italic: "斜体",
    // サイズ
    titleSize: "タイトルサイズ",
    descSize: "説明サイズ",
    // デフォルトテキスト
    questionnaireTitle: "アンケートタイトル",
    defaultDesc: "デフォルトの説明内容",
    defaultTitle: "デフォルトのタイトル内容",
    defaultWelcome:
      "より良いサービスを提供するために、数分お時間をいただき、ご感想やご意見をお聞かせください。私たちは皆様のご意見やご提案を大切にしています。ご参加をお待ちしております！それでは、早速始めましょう！",
    // 単一選択
    singleSelectTitle: "単一選択デフォルトタイトル",
    singleSelectDesc: "単一選択デフォルト説明",
    defaultOption1: "デフォルト選択肢 1",
    defaultOption2: "デフォルト選択肢 2",
    // 複数選択
    multiSelectTitle: "複数選択デフォルトタイトル",
    multiSelectDesc: "複数選択デフォルト説明",
    multiSelectOption1: "複数選択選択肢 1",
    multiSelectOption2: "複数選択選択肢 2",
    // ドロップダウン選択
    optionSelectTitle: "ドロップダウン選択デフォルトタイトル",
    optionSelectDesc: "ドロップダウン選択デフォルト説明",
    optionSelect1: "デフォルト選択肢 1",
    optionSelect2: "デフォルト選択肢 2",
    // 性別選択肢
    male: "男",
    female: "女",
    secret: "秘密",
    // 学歴選択肢
    educationBelowJunior: "中学校卒業以下",
    educationHighSchool: "高校/専門学校",
    educationCollege: "短期大学",
    educationBachelor: "大学卒業",
    educationMasterPlus: "修士以上",
    // 職業選択肢
    careerStudent: "学生",
    careerGovernment: "政府/公務員",
    careerManager: "企業管理者",
    careerProfessional: "専門職（医師/弁護士/教師など）",
    careerClerk: "一般職員",
    careerWorker: "労働者",
    careerService: "サービス業",
    careerSelfEmployed: "自営業",
    careerFreelancer: "フリーランス",
    careerAgriculture: "農林水産業",
    careerRetired: "退職",
    careerUnemployed: "無職",
    careerOther: "その他",
    // 年齢選択肢
    ageBelow18: "18 歳未満",
    age25to30: "25〜30 歳",
    age31to40: "31〜40 歳",
    age41to50: "41〜50 歳",
    age51to60: "51〜60 歳",
    age61Plus: "61 歳以上"
  }
};
