module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/jest.global-setup.ts',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // `file-type` and its dependencies are ESM only. Node loads them from CommonJS,
  // Jest's own module loader cannot, so they get transpiled like the sources.
  transformIgnorePatterns: [
    '/node_modules/(?!(file-type|strtok3|token-types|uint8array-extras|@tokenizer|@borewit)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
};
