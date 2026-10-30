// SPDX-License-Identifier: MIT
// The modules' boundaries (docs/architecture.md, Modules; ADR-0002), checked in CI.
const INDEX = [
  '^src/[^/]+/index\\.tsx?$', // a module's interface
  '^src/shared/[^/]+/index\\.tsx?$', // the interface of a part of shared
];

module.exports = {
  forbidden: [
    {
      name: 'through-the-index',
      comment: "A module reaches another only through that module's index.ts.",
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/', pathNot: ['^src/$1/', ...INDEX] },
    },
    {
      name: 'shared-beneath',
      comment: 'shared is beneath the modules, and imports none of them.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(?!shared/)' },
    },
    {
      name: 'thin-routes',
      comment: "Routes render the modules' screens, through their index.ts.",
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '^src/', pathNot: INDEX },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
  },
};
