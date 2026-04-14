import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
    },
  ],
  collectCoverageFrom: ['services/**/*.ts', 'execution/**/*.ts', '!**/*.d.ts'],
  coverageDirectory: 'coverage',
  forceExit: true,
};

export default config;
