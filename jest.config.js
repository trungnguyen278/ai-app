// SPDX-License-Identifier: MIT
const preset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  resolver: '<rootDir>/tests/resolver.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // messageformat and culori are published as ES modules only, so Jest transforms them like
  // Expo's own.
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('node_modules/(?!(', 'node_modules/(?!(messageformat|culori|'),
  ),
};
