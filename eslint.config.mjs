import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

const browserGlobals = {
  AbortController: 'readonly',
  ClipboardEvent: 'readonly',
  Crypto: 'readonly',
  DOMParser: 'readonly',
  DataTransfer: 'readonly',
  Document: 'readonly',
  DocumentFragment: 'readonly',
  DragEvent: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  FormData: 'readonly',
  HTMLElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLFormElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  InputEvent: 'readonly',
  KeyboardEvent: 'readonly',
  Location: 'readonly',
  MouseEvent: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  NodeFilter: 'readonly',
  ParentNode: 'readonly',
  Response: 'readonly',
  Text: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  Window: 'readonly',
  chrome: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  globalThis: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

const nodeGlobals = {
  __dirname: 'readonly',
  process: 'readonly',
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.output/**',
      '**/.pnpm-store/**',
      '**/.tooling/**',
      '**/.venv/**',
      '**/.wxt/**',
      'coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'import/no-unresolved': 'off',
      'no-undef': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
];
