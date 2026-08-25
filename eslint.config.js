// Lint-only workspace config, covering both npm projects: the component sources
// under web/typescript and the Playwright suite under e2e/tests. Run by its own
// CI step, not by Gradle — `./gradlew build` stays the fast inner loop.
//
// Deliberately NOT type-aware. The rule that would justify the project-service
// cost is no-floating-promises, and the entire codebase contains one
// async/await/.then — nothing for it to find.
//
// The rule set is chosen from what this codebase actually violates, measured
// rather than assumed: `recommended` on its own reported 83 problems, 76 of
// them no-explicit-any. Rules disabled below are disabled because the pattern
// they flag is deliberate here, not because the findings were inconvenient.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';

export default tseslint.config(
    {
        ignores: [
            '**/build/**',
            '**/node_modules/**',
            '**/playwright-report/**',
            '**/test-results/**'
        ]
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    // React rules on the components only. Classic runtime (tsconfig jsx: "react"),
    // React 16 — pinned so version-dependent rules don't guess.
    {
        files: ['web/typescript/**/*.tsx'],
        ...react.configs.flat.recommended,
        settings: { react: { version: '16.14' } }
    },

    {
        rules: {
            // tsc owns both of these, and enforces them on the production build
            // too (web/tsconfig.json, #80). A second differently-worded copy of
            // the same error helps nobody.
            '@typescript-eslint/no-unused-vars': 'off',

            // `any` is load-bearing here, not laziness: the prop readers mirror
            // perspective-client's PropertyTree so the reducers can be tested
            // under plain node, and data-array item schemas stay open because
            // rows and events carry arbitrary user fields. 76 sites, every one
            // deliberate — turning this on would buy 76 suppression comments.
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },

    {
        // Mid-test require() is a deliberate jest idiom here — re-importing a
        // module inside a single test to observe module-level state. Production
        // code keeps the rule.
        files: ['web/typescript/**/__tests__/**'],
        rules: { '@typescript-eslint/no-require-imports': 'off' }
    }
);
