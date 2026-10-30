// SPDX-License-Identifier: MIT
const preset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  // messageformat is published as ES modules only, so Jest transforms it like Expo's own.
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('node_modules/(?!(', 'node_modules/(?!(messageformat|'),
  ),
};
