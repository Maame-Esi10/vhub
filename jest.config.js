/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  // tsconfig's "@/*" path alias is a TypeScript-compiler-only concept; Jest's
  // own module resolver needs the equivalent mapping to resolve the same
  // imports at runtime (lib/matching/layer1.ts imports '@/types/database'
  // and '@/constants/categories').
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
