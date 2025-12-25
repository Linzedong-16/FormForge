# 项目配置文件说明

本文档详细说明项目中使用的两个重要配置文件：`commitlint.config.js` 和 `cspell.json`。

## 1. Commitlint 配置文件 (commitlint.config.js)

### 1.1 作用

`commitlint.config.js` 是 Commitlint 工具的配置文件，用于**规范 Git 提交信息的格式**。它确保所有提交信息都遵循统一的格式，提高代码仓库的可维护性和可读性。

### 1.2 核心配置

```javascript
/** @type {import('cz-git').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"]
  // ... 其他配置
};
```

### 1.3 规则说明

| 规则                   | 配置                   | 说明                             |
| ---------------------- | ---------------------- | -------------------------------- |
| `body-leading-blank`   | `[2, "always"]`        | 提交正文前必须有一个空行         |
| `footer-leading-blank` | `[1, "always"]`        | 提交底部前最好有一个空行         |
| `header-max-length`    | `[2, "always", 108]`   | 提交标题最长为108个字符          |
| `subject-empty`        | `[2, "never"]`         | 提交主题不能为空                 |
| `type-empty`           | `[2, "never"]`         | 提交类型不能为空                 |
| `type-enum`            | `[2, "always", [...]]` | 提交类型必须是预定义的枚举值之一 |

### 1.4 提交类型 (Type)

项目定义了以下提交类型：

| 类型       | 描述        | 示例                              |
| ---------- | ----------- | --------------------------------- |
| `feat`     | ✨ 新功能   | `feat: 添加用户登录功能`          |
| `fix`      | 🐛 修复缺陷 | `fix: 修复登录按钮点击无响应问题` |
| `docs`     | 📚 更新文档 | `docs: 更新API文档`               |
| `refactor` | 📦 代码重构 | `refactor: 重构用户管理模块`      |
| `perf`     | 🚀 性能优化 | `perf: 优化数据库查询速度`        |
| `test`     | 🧪 添加测试 | `test: 为登录功能添加单元测试`    |
| `chore`    | 🔧 工具配置 | `chore: 更新依赖版本`             |
| `revert`   | ⏪ 代码回滚 | `revert: 回滚到之前的稳定版本`    |
| `style`    | 🎨 样式调整 | `style: 格式化代码`               |

### 1.5 提交范围 (Scope)

支持的提交范围包括：`root`, `backend`, `frontend`, `components`, `utils`，也支持自定义范围。

### 1.6 使用方式

在项目根目录执行：

```bash
pnpm commit
```

这会启动交互式提交界面，引导您按照规范填写提交信息。

## 2. CSpell 配置文件 (cspell.json)

### 2.1 作用

`cspell.json` 是 CSpell 工具的配置文件，用于**检查代码中的拼写错误**。它帮助团队保持代码中术语和命名的一致性。

### 2.2 核心配置

```json
{
  "import": ["@cspell/dict-lorem-ipsum/cspell-ext.json"],
  "caseSensitive": false,
  "dictionaries": ["custom-dictionary"],
  "dictionaryDefinitions": [
    {
      "name": "custom-dictionary",
      "path": "./.cspell/custom-dictionary.txt",
      "addWords": true
    }
  ],
  "ignorePaths": [
    // ... 忽略的文件路径
  ]
}
```

### 2.3 关键配置项

#### 2.3.1 字典配置

- **`@cspell/dict-lorem-ipsum`**: 导入了一个用于处理 "lorem ipsum" 文本的字典
- **`custom-dictionary`**: 自定义字典，路径为 `./.cspell/custom-dictionary.txt`，允许自动添加新单词

#### 2.3.2 忽略路径

配置了大量忽略路径，包括：

- `node_modules` 依赖目录
- 构建输出目录 (`dist`, `build`, `lib` 等)
- 文档目录 (`docs`)
- 第三方库目录 (`vendor`)
- 静态资源目录 (`public`, `static`)
- 类型声明文件 (`*.d.ts`)
- 配置文件 (`package.json`, `*.md`, `.gitignore` 等)

### 2.4 使用方式

在项目根目录执行：

```bash
pnpm lint:spellcheck
```

这会对项目中的代码文件进行拼写检查。

## 3. 总结

- **`commitlint.config.js`**: 确保 Git 提交信息格式统一，提高代码仓库可维护性
- **`cspell.json`**: 检查代码中的拼写错误，保持术语和命名一致性

这两个工具共同作用，帮助团队维护高质量的代码仓库和开发流程。
