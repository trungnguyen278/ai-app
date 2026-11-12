// SPDX-License-Identifier: MIT
const preset = require('jest-expo/jest-preset');

// The tests run in one time zone, whatever the machine's, so that a time reads the same on every
// machine. The workers Jest starts inherit it.
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  resolver: '<rootDir>/tests/resolver.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // messageformat, culori and qr are published as ES modules only, so Jest transforms them like
  // Expo's own.
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('node_modules/(?!(', 'node_modules/(?!(messageformat|culori|qr/|@noble/|'),
  ),
};
