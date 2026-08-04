// Docs↔code drift enforcement (pattern from the observability module's
// DocSyncTest): the build fails when a component exists in code but is
// missing from the README, the verify project's routes, or the e2e suite —
// or when the README's advertised component count no longer matches reality.
//
// The CONTRACT table below is the one place to update when adding a
// component; every assertion derives from it or from the real files.
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** One row per shipped component: where its pieces must show up. */
const CONTRACT: Array<{ id: string; readmeHeading: string; demoRoute: string; e2eSpec: string }> = [
    { id: 'mustrysolutions.perspective.input.datetimerangepicker', readmeHeading: '## Date/Time Range Picker', demoRoute: '/picker', e2eSpec: 'picker.spec.ts' },
    { id: 'mustrysolutions.perspective.display.calendar', readmeHeading: '## Calendar / Scheduler', demoRoute: '/calendar', e2eSpec: 'calendar.spec.ts' },
    { id: 'mustrysolutions.perspective.display.resourcetimeline', readmeHeading: '## Resource Timeline', demoRoute: '/timeline', e2eSpec: 'timeline.spec.ts' },
    { id: 'mustrysolutions.perspective.input.datagrid', readmeHeading: '## Data Grid', demoRoute: '/grid', e2eSpec: 'grid.spec.ts' },
    { id: 'mustrysolutions.perspective.display.panzoomview', readmeHeading: '## Pan & Zoom View', demoRoute: '/panzoom', e2eSpec: 'panzoom.spec.ts' },
    { id: 'mustrysolutions.perspective.input.richtexteditor', readmeHeading: '## Rich Text Editor', demoRoute: '/rte', e2eSpec: 'richtext.spec.ts' },
    { id: 'mustrysolutions.perspective.input.codeeditor', readmeHeading: '## Code / JSON Editor', demoRoute: '/code', e2eSpec: 'code.spec.ts' },
    { id: 'mustrysolutions.perspective.input.colorpicker', readmeHeading: '## Color Picker', demoRoute: '/color', e2eSpec: 'color.spec.ts' },
    { id: 'mustrysolutions.perspective.input.keyboard', readmeHeading: '## On-Screen Keyboard', demoRoute: '/keyboard', e2eSpec: 'keyboard.spec.ts' },
    { id: 'mustrysolutions.perspective.admin.schedulemanager', readmeHeading: '## Schedule Manager', demoRoute: '/schedule', e2eSpec: 'schedule.spec.ts' },
    { id: 'mustrysolutions.perspective.admin.rostermanager', readmeHeading: '## Roster Manager', demoRoute: '/roster', e2eSpec: 'roster.spec.ts' },
    { id: 'mustrysolutions.perspective.admin.usermanager', readmeHeading: '## User Manager', demoRoute: '/users', e2eSpec: 'users.spec.ts' },
    { id: 'mustrysolutions.perspective.admin.holidaymanager', readmeHeading: '## Holiday Manager', demoRoute: '/holidays', e2eSpec: 'holiday.spec.ts' },
    { id: 'mustrysolutions.perspective.display.branching', readmeHeading: '## Branching Diagram', demoRoute: '/branching', e2eSpec: 'branching.spec.ts' }
];

const NUMBER_WORDS: { [n: number]: string } = {
    9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
    14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen'
};

/** Every COMPONENT_TYPE declared in the web components (the code truth). */
function codeComponentIds(): string[] {
    const dir = path.join(ROOT, 'web/typescript/components');
    const out: string[] = [];
    for (const sub of fs.readdirSync(dir)) {
        const full = path.join(dir, sub);
        if (!fs.statSync(full).isDirectory() || sub === '__tests__') {
            continue;
        }
        for (const f of fs.readdirSync(full)) {
            if (!f.endsWith('.tsx') && !f.endsWith('.ts')) {
                continue;
            }
            const m = /COMPONENT_TYPE = '([^']+)'/.exec(fs.readFileSync(path.join(full, f), 'utf8'));
            if (m) {
                out.push(m[1]);
            }
        }
    }
    return out;
}

describe('docs stay in sync with the code', () => {
    const readme = read('README.md');
    const pageConfig = JSON.parse(read('ops/verify/project/com.inductiveautomation.perspective/page-config/config.json'));
    const ids = codeComponentIds();

    it('the contract table covers exactly the components declared in code', () => {
        expect([...ids].sort()).toEqual(CONTRACT.map((c) => c.id).sort());
    });

    it('Components.java registers every component (both hooks feed from it)', () => {
        const java = read('common/src/main/java/com/mustrysolutions/perspective/components/common/comp/Components.java');
        const registered = (java.match(/\w+\.DESCRIPTOR/g) || []).length;
        expect(registered).toBe(CONTRACT.length);
    });

    it('index.ts registers a Meta for every component', () => {
        const index = read('web/typescript/index.ts');
        const metas = (index.match(/new \w+Meta\(\)/g) || []).length;
        expect(metas).toBe(CONTRACT.length);
    });

    it("the README's advertised component count matches reality", () => {
        const word = NUMBER_WORDS[CONTRACT.length];
        expect(word).toBeDefined(); // extend NUMBER_WORDS when we outgrow it
        expect(readme).toContain(`It ships ${word} components`);
    });

    CONTRACT.forEach((c) => {
        describe(c.id, () => {
            it('has its README section', () => {
                expect(readme).toContain(`${c.readmeHeading}\n`);
            });
            it('has its verify-project demo route', () => {
                expect(Object.keys(pageConfig.pages)).toContain(c.demoRoute);
            });
            it('has its e2e spec', () => {
                expect(fs.existsSync(path.join(ROOT, 'e2e/tests', c.e2eSpec))).toBe(true);
            });
        });
    });
});
