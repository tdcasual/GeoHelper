import js from "@eslint/js";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import * as yamlParser from "yaml-eslint-parser";

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

export default [
  {
    ignores: [
      ".cache/**",
      ".git/**",
      ".playwright-cli/**",
      ".worktrees/**",
      "**/.cache/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/output/**",
      "apps/web/public/vendor/**"
    ]
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals
    },
    plugins: {
      "simple-import-sort": simpleImportSort
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn"
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@typescript-eslint": tsEslintPlugin,
      "simple-import-sort": simpleImportSort
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn"
    }
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["**/*.{yml,yaml}"],
    languageOptions: {
      parser: yamlParser
    },
    rules: {}
  }
];
