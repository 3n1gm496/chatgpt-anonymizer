import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  zip: {
    name: 'chatgpt-anonymizer-extension',
  },
  manifest: {
    name: 'ChatGPT Anonymizer',
    description:
      'Sanitizes pasted ChatGPT input locally before submit and keeps mappings on the device.',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'http://127.0.0.1/*',
    ],
    action: {
      default_popup: 'entrypoints/popup/index.html',
    },
    options_ui: {
      page: 'entrypoints/options/index.html',
      open_in_tab: true,
    },
  },
});
