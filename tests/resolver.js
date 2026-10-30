// SPDX-License-Identifier: MIT
// Jest's resolver: React Native's, from the preset, with Reanimated's rule before it. In tests,
// Reanimated and Worklets run their web implementations, not the native ones (Reanimated's
// guide, "Testing with Jest").
const preset = require('jest-expo/jest-preset');
const reanimated = require('react-native-reanimated/jest/resolver');

const reactNative = require(preset.resolver);

module.exports = (request, options) => {
  const throughReactNative = (path, next) =>
    reactNative(path, { ...next, defaultResolver: options.defaultResolver });
  return reanimated(request, { ...options, defaultResolver: throughReactNative });
};
