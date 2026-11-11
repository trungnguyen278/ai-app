// SPDX-License-Identifier: MIT
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores([
    'platform/*',
    'android/*',
    'ios/*',
    'dist/*',
    '.expo/*',
    // Made by `npm run protocols`, which checks them itself.
    'src/shared/protocols/generated/*',
  ]),
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
    // A message that appears or changes is the design system's Notice, which each platform's
    // screen reader says: a role or a live region alone is silent on iOS, and on Android's Text.
    files: ['app/**', 'src/**'],
    ignores: ['src/shared/design/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name=/^(aria-live|accessibilityLiveRegion)$/]',
          message: 'Use Notice, which screen readers say on every platform.',
        },
        {
          selector:
            "JSXOpeningElement[name.name!='Notice'] > JSXAttribute[name.name=/^(role|accessibilityRole)$/][value.value=/^(alert|status)$/]",
          message: 'Use Notice, which screen readers say on every platform.',
        },
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
