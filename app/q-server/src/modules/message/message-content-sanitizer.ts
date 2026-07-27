/**
 * 消息内容安全处理（对齐消息系统 research.md §5）
 *
 * 三项处理，均为纵深防御的第二层（前端已用 v-text/{{ }} 做 Vue 自动转义，
 * 这里是服务端侧的兜底）：
 *   1. 剔除 HTML/脚本标签
 *   2. 手机号（中国大陆 11 位）替换为 ***
 *   3. 邮箱、18 位身份证号替换为 ***
 *
 * 刻意不引入第三方敏感词库——范围收窄到这三类可枚举的个人信息模式，
 * 不做没有明确词库来源的泛化"敏感词过滤"。
 */

const HTML_TAG_PATTERN = /<[^>]*>/g;
const PHONE_PATTERN = /1[3-9]\d{9}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ID_CARD_PATTERN = /\d{17}[\dXx]/g;

export function sanitizeMessageContent(raw: string): string {
  // 身份证号（18 位）必须先于手机号（11 位）替换：否则 18 位数字串中间恰好
  // 出现符合手机号模式的 11 位子串时，会被手机号规则提前拆断，导致身份证号
  // 无法被完整命中，残留部分数字未脱敏
  return raw
    .replace(HTML_TAG_PATTERN, "")
    .replace(ID_CARD_PATTERN, "***")
    .replace(PHONE_PATTERN, "***")
    .replace(EMAIL_PATTERN, "***");
}
