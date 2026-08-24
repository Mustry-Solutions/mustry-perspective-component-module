// The unused-code gate (#78 step 1) rests on three independent facts, and
// breaking any one of them disables it SILENTLY — nothing fails, dead code
// simply starts compiling again. Two of the three are plain config and are
// asserted here: tsconfig.json carries the flags, and tsconfig.test.json still
// inherits them, which is what keeps ts-jest enforcing under `./gradlew build`.
// The third — ts-loader running without `transpileOnly` — can't be read off a
// JSON file and is a deliberate, reviewable edit, so it's left to review.
import * as fs from 'fs';
import * as path from 'path';

interface TsConfig {
    extends?: string;
    compilerOptions?: {
        noUnusedLocals?: boolean;
        noUnusedParameters?: boolean;
    };
}

/** Parse one of the web tsconfigs. A syntax error throws here, which is the
 *  right outcome: a tsconfig we can't read is a gate we can't vouch for. */
function readConfig(name: string): TsConfig {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', name), 'utf8'));
}

describe('unused-code build gate', () => {
    const base = readConfig('tsconfig.json');
    const testCfg = readConfig('tsconfig.test.json');

    it('tsconfig.json turns on noUnusedLocals and noUnusedParameters', () => {
        expect(base.compilerOptions?.noUnusedLocals).toBe(true);
        expect(base.compilerOptions?.noUnusedParameters).toBe(true);
    });

    it('tsconfig.test.json extends the base config, so ts-jest inherits the flags', () => {
        expect(testCfg.extends).toBe('./tsconfig.json');
    });

    it('tsconfig.test.json does not switch them back off', () => {
        expect(testCfg.compilerOptions?.noUnusedLocals).not.toBe(false);
        expect(testCfg.compilerOptions?.noUnusedParameters).not.toBe(false);
    });
});
