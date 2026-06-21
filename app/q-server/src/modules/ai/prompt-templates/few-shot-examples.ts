/**
 * AI 问卷生成 — Few-shot 示例
 *
 * 向 DeepSeek 提供 2 个完整的问卷 JSON 示例，显著提升输出质量和格式准确度。
 * 每个示例严格遵循 AI 输出的精简 JSON 格式（仅 type + config）。
 */

export interface AIFewShotExample {
  /** 示例描述 */
  label: string;
  /** 示例 JSON */
  json: unknown;
}

/** Few-shot 示例集合 */
export const FEW_SHOT_EXAMPLES: AIFewShotExample[] = [
  {
    label: "示例 1：员工满意度调查（12题，含分节标题）",
    json: {
      title: "2026年度员工满意度调查",
      description: "感谢您参与本次调查，您的反馈将帮助我们改进工作环境和管理方式。本问卷匿名填写，请如实作答。",
      components: [
        {
          type: "single-select",
          config: {
            title: { status: "您所在的部门是？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["研发部", "市场部", "销售部", "人力资源部", "财务部", "其他"], isShow: true }
          }
        },
        {
          type: "single-select",
          config: {
            title: { status: "您在本公司的工作年限？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["1年以内", "1-3年", "3-5年", "5-10年", "10年以上"], isShow: true }
          }
        },
        {
          type: "text-note",
          config: {
            title: { status: "一、工作环境与氛围", isShow: true },
            desc: { status: "", isShow: false }
          }
        },
        {
          type: "rate-score",
          config: {
            title: { status: "您对目前的工作环境满意吗？", isShow: true },
            desc: { status: "1分非常不满意，5分非常满意", isShow: true },
            options: { status: ["1分", "2分", "3分", "4分", "5分"], isShow: true }
          }
        },
        {
          type: "single-select",
          config: {
            title: { status: "您与同事之间的协作是否顺畅？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["非常顺畅", "比较顺畅", "一般", "不太顺畅", "很不顺畅"], isShow: true }
          }
        },
        {
          type: "text-note",
          config: {
            title: { status: "二、薪酬与福利", isShow: true },
            desc: { status: "", isShow: false }
          }
        },
        {
          type: "rate-score",
          config: {
            title: { status: "您对目前的薪酬水平满意吗？", isShow: true },
            desc: { status: "1分非常不满意，5分非常满意", isShow: true },
            options: { status: ["1分", "2分", "3分", "4分", "5分"], isShow: true }
          }
        },
        {
          type: "multi-select",
          config: {
            title: { status: "您最希望公司改善哪些福利？", isShow: true },
            desc: { status: "可多选", isShow: true },
            options: {
              status: ["五险一金", "带薪年假", "餐补交通补", "培训机会", "团建活动", "弹性工作制", "其他"],
              isShow: true
            }
          }
        },
        {
          type: "text-note",
          config: {
            title: { status: "三、发展与建议", isShow: true },
            desc: { status: "", isShow: false }
          }
        },
        {
          type: "single-select",
          config: {
            title: { status: "您认为公司提供的发展机会如何？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["机会很多", "有一定机会", "机会一般", "机会较少", "几乎没有机会"], isShow: true }
          }
        },
        {
          type: "rate-score",
          config: {
            title: { status: "您对直属上级的管理方式满意吗？", isShow: true },
            desc: { status: "", isShow: true },
            options: { status: ["1分", "2分", "3分", "4分", "5分"], isShow: true }
          }
        },
        {
          type: "text-input",
          config: {
            title: { status: "您对公司有什么建议或意见？", isShow: true },
            desc: { status: "请畅所欲言，您的每一条建议都会被认真对待", isShow: true }
          }
        }
      ]
    }
  },
  {
    label: "示例 2：产品反馈调查（5题，短问卷）",
    json: {
      title: "新产品使用体验反馈",
      description: "感谢您使用我们的新产品！请花几分钟分享您的使用体验。",
      components: [
        {
          type: "single-select",
          config: {
            title: { status: "您使用本产品多长时间了？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["不到1周", "1-4周", "1-3个月", "3个月以上"], isShow: true }
          }
        },
        {
          type: "multi-select",
          config: {
            title: { status: "您最常使用哪些功能？", isShow: true },
            desc: { status: "可多选", isShow: true },
            options: { status: ["功能A", "功能B", "功能C", "功能D", "功能E"], isShow: true }
          }
        },
        {
          type: "rate-score",
          config: {
            title: { status: "整体而言，您给本产品打几分？", isShow: true },
            desc: { status: "1分最低，5分最高", isShow: true },
            options: { status: ["1分", "2分", "3分", "4分", "5分"], isShow: true }
          }
        },
        {
          type: "single-select",
          config: {
            title: { status: "您会将本产品推荐给朋友吗？", isShow: true },
            desc: { status: "", isShow: false },
            options: { status: ["一定会", "可能会", "不确定", "可能不会", "一定不会"], isShow: true }
          }
        },
        {
          type: "text-input",
          config: {
            title: { status: "您认为产品最需要改进的地方是？", isShow: true },
            desc: { status: "请具体说明", isShow: true }
          }
        }
      ]
    }
  }
];
