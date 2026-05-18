module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@roster-loom/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@roster-loom/core/(.*)$': '<rootDir>/../../packages/core/src/$1',
  },
};
