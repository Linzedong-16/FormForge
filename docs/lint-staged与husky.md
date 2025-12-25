# Git 钩子与 Lint-Staged 配置说明

本文档详细说明项目中使用的 Git 钩子工具 (`husky`) 和暂存文件检查工具 (`lint-staged`) 的配置和区别。

## 注意
使用的husky与lint-staged版本如下：
- husky: 9.0.11
- lint-staged: 15.2.2
二者执行脚本时会有重复操作，需要额外配置lint-staged的脚本，避免husky执行时重复执行lint-staged的脚本。

## 1. 核心概念

### 1.1 Git 钩子 (Git Hooks)

Git 钩子是 Git 仓库中在特定事件（如提交、推送、合并等）发生时自动执行的脚本。它们位于 `.git/hooks` 目录中，用于自动化开发工作流程。

### 1.2 Husky

Husky 是一个现代化的 Git 钩子管理工具，它让配置和管理 Git 钩子变得更加简单。Husky 会在 `.husky` 目录下创建钩子脚本，并自动将它们链接到 Git 钩子系统。

### 1.3 Lint-Staged

Lint-Staged 是一个只对 Git 暂存文件执行 linting 检查的工具。它可以在提交前自动检查并修复暂存文件中的问题，避免将有问题的代码提交到仓库。

## 2. 项目配置分析

### 2.1 Husky 配置

项目中使用 Husky 9.x 版本，配置如下：

**`.husky/pre-commit` 钩子内容：**
```bash
#!/usr/bin/env sh
pnpm lint:prettier && pnpm lint:eslint && pnpm lint:spellcheck
```

**`package.json` 相关脚本：**
```json
{
  "scripts": {
    "prepare": "husky",
    "lint:prettier": "prettier --write \"**/*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}\"",
    "lint:eslint": "eslint",
    "lint:spellcheck": "cspell lint \"(packages|app)/**/*.{js,ts,mjs,cjs,json,css,less,scss,vue,html,md}\""
  }
}
```

### 2.2 Lint-Staged 配置

**`.lintstagedrc.js` 内容：**
```javascript
export default {
  "*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}": ["cspell lint"],
  "*.{js,ts,vue,md}": ["prettier --write", "eslint"]
};
```

**`package.json` 相关脚本：**
```json
{
  "scripts": {
    "precommit": "lint-staged"
  }
}
```

## 3. Husky 与 Lint-Staged 的区别

| 特性 | Husky | Lint-Staged |
|------|-------|-------------|
| **作用范围** | 管理所有 Git 钩子 | 只处理暂存文件的 linting |
| **执行时机** | 可以在 Git 生命周期的任意阶段执行 | 通常在 pre-commit 钩子中执行 |
| **处理对象** | 可以处理所有文件或特定条件的文件 | 只处理 Git 暂存区中的文件 |
| **配置方式** | 在 `.husky` 目录下创建钩子脚本 | 在 `.lintstagedrc.js` 或 `package.json` 中配置 |
| **使用场景** | 适用于需要在 Git 事件发生时执行的任何脚本 | 专门用于提交前的代码质量检查 |

## 4. 当前配置存在的问题

### 4.1 重复配置问题

当前项目中同时配置了 Husky 和 Lint-Staged，但存在以下问题：

1. **Husky pre-commit 钩子直接执行完整 lint 命令**：
   ```bash
   pnpm lint:prettier && pnpm lint:eslint && pnpm lint:spellcheck
   ```
   这会对**所有文件**执行检查，而不是只检查暂存文件，导致检查时间过长。

2. **Husky 与 Lint-Staged 配置分离**：
   - Husky 直接执行 lint 命令
   - Lint-Staged 配置了不同的 lint 规则
   - 但 `package.json` 中的 `precommit` 脚本未被使用

3. **Lint 规则不一致**：
   - Husky 调用的命令与 Lint-Staged 配置的命令不完全一致
   - 例如，Husky 调用 `pnpm lint:prettier` (格式化所有文件)，而 Lint-Staged 只对特定文件执行 `prettier --write`

### 4.2 执行效率问题

由于 Husky 直接执行完整的 lint 命令，对所有文件进行检查，会导致：
- 提交时间过长
- 不必要地检查未修改的文件
- 可能导致与其他开发者的修改冲突

## 5. 推荐配置方案

### 5.1 优化 Husky 与 Lint-Staged 配合

建议将 Husky pre-commit 钩子配置为调用 Lint-Staged，而不是直接执行 lint 命令：

**修改 `.husky/pre-commit` 钩子：**
```bash
#!/usr/bin/env sh
pnpm precommit
```

这样，Husky 会调用 `package.json` 中的 `precommit` 脚本，该脚本会执行 Lint-Staged，只对暂存文件进行检查。

### 5.2 统一 Lint 规则

确保 Lint-Staged 配置与项目的 lint 命令保持一致：

**优化 `.lintstagedrc.js`：**
```javascript
export default {
  "*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}": [
    "prettier --write",
    "eslint --fix",
    "cspell lint"
  ]
};
```

### 5.3 完整配置示例

**`.husky/pre-commit`：**
```bash
#!/usr/bin/env sh
pnpm precommit
```

**`package.json`：**
```json
{
  "scripts": {
    "prepare": "husky",
    "precommit": "lint-staged",
    "lint:prettier": "prettier --write \"**/*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}\"",
    "lint:eslint": "eslint --fix",
    "lint:spellcheck": "cspell lint \"(packages|app)/**/*.{js,ts,mjs,cjs,json,css,less,scss,vue,html,md}\"",
    "lint": "pnpm lint:prettier && pnpm lint:eslint && pnpm lint:spellcheck"
  }
}
```

**`.lintstagedrc.js`：**
```javascript
export default {
  "*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}": [
    "prettier --write",
    "eslint --fix",
    "cspell lint"
  ]
};
```

## 6. 执行流程对比

### 6.1 当前执行流程
