// SPDX-License-Identifier: MIT
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

// A message that appears or changes is the design system's Notice, which each platform's screen
// reader says: a role or a live region alone is silent on iOS, and on Android's Text.
const NOTICES = [
  {
    selector: 'JSXAttribute[name.name=/^(aria-live|accessibilityLiveRegion)$/]',
    message: 'Use Notice, which screen readers say on every platform.',
  },
  {
    selector:
      "JSXOpeningElement[name.name!='Notice'] > JSXAttribute[name.name=/^(role|accessibilityRole)$/][value.value=/^(alert|status)$/]",
    message: 'Use Notice, which screen readers say on every platform.',
  },
];

// A page that a link opened has nothing behind it, and going back from it would do nothing:
// goBack (shared/navigation) leads to the page above it then.
const GOING_BACK = [
  {
    selector: "CallExpression[callee.object.name='router'][callee.property.name='back']",
    message:
      'Use goBack (shared/navigation), which leads to the page above when nothing is behind.',
  },
];

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
  // Rules on the app's own code, each kept by the one part of shared that holds what it asks for.
  // A file's rules replace those of the configurations before it, so each part is listed apart.
  {
    files: ['app/**', 'src/**'],
    ignores: ['src/shared/design/**', 'src/shared/navigation/**'],
    rules: { 'no-restricted-syntax': ['error', ...NOTICES, ...GOING_BACK] },
  },
  {
    files: ['src/shared/design/**'],
    rules: { 'no-restricted-syntax': ['error', ...GOING_BACK] },
  },
  {
    files: ['src/shared/navigation/**'],
    rules: { 'no-restricted-syntax': ['error', ...NOTICES] },
  },
  {
    // Expo writes process.env's values into the app when it bundles it, and only those it can
    // see by name. Tests and configuration run in Node, which reads process.env as it is.
    files: ['tests/**', '*.config.{js,ts}'],
    rules: { 'expo/no-dynamic-env-var': 'off' },
  },
]);
