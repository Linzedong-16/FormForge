import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ignores = ["**/dist/**", "**/node_modules/**", ".*", "scripts/**", "**/*.d.ts", "docs/**/*.md"];

export default defineConfig(
  // 通用配置
  {
    ignores, // 忽略项
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier], // 继承规则
    plugins: {
      prettier: eslintPluginPrettier
    },
    languageOptions: {
      ecmaVersion: "latest", // ecma语法支持版本
      sourceType: "module", // 模块化类型
      parser: tseslint.parser // 解析器
    },
    rules: {
      // 自定义
      "no-var": "error" // 禁用var，使用let或const代替
    }
  },
  // q-editor 配置
  {
    ignores,
    files: ["app/q-editor/**/*.{ts,js,tsx,jsx,vue}"],
    extends: [...eslintPluginVue.configs["flat/recommended"], eslintConfigPrettier],
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parser: eslintPluginVue.parser,
      parserOptions: {
        tsconfigRootDir: path.resolve(__dirname, "app/q-editor"),
        project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  // 前端配置 (frontend)
  {
    ignores,
    files: ["app/frontend/**/*.{ts,js,tsx,jsx,vue}", "packages/components/**/*.{ts,js,tsx,jsx,vue}"],
    extends: [...eslintPluginVue.configs["flat/recommended"], eslintConfigPrettier],
    languageOptions: {
      globals: {
        ...globals.browser,
        EventListener: "readonly"
      },
      parser: eslintPluginVue.parser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [
          "./tsconfig.json",
          "./app/frontend/tsconfig.json",
          "./app/frontend/tsconfig.app.json",
          "./app/frontend/tsconfig.node.json"
        ],
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      // 允许catch块中的error使用any类型
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  // 后端配置
  {
    ignores,
    files: ["app/backend/**/*.{ts,js}"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
);
