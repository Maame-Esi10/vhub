/*
  Jest configuration for the evaluation ONLY. The evaluation files end in
  .eval.ts, so the normal `npx jest` never runs them: they call Gemini, take
  real time (the 8-second timeout case), and write files.

  Run one:   npx jest -c scripts/evaluation/jest.eval.config.js layers
  Run all:   see scripts/evaluation/README.md
*/
const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..', '..'),
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/scripts/evaluation/**/*.eval.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  // Type checking is done by tsc in each tree; the API and app have different
  // tsconfigs and ts-jest would otherwise report one tree's settings against
  // the other's files.
  transform: { '^.+\.tsx?$': ['ts-jest', { diagnostics: false }] },
  testTimeout: 600000,
  // One file at a time: the runs share the Gemini quota and must not overlap.
  maxWorkers: 1,
};
