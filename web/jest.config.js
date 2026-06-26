/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/typescript'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        // Compile test + source TS with the test tsconfig (adds Jest globals).
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
    }
};
