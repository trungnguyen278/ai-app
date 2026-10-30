// SPDX-License-Identifier: MIT
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['platform/*', 'android/*', 'ios/*', 'dist/*', '.expo/*']),
  expoConfig,
  prettierRecommended,
  {
    // The app runs on phones: Node's own modules exist only in its tools and tests.
    files: ['app/**', 'src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^node:', message: 'Node modules do not run on a phone.' }] },
      ],
    },
  },
  {
    // Expo writes process.env's values into the app when it bundles it, and only those it can
    // see by name. Tests and configuration run in Node, which reads process.env as it is.
    files: ['tests/**', '*.config.{js,ts}'],
    rules: { 'expo/no-dynamic-env-var': 'off' },
  },
]);
