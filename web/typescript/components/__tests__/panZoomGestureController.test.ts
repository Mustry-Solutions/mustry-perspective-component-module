// Double-click zoom through the real PanZoomGestureController. Jest runs in
// node, so the viewport's DOM is a few fake elements: just enough tree for
// Element.closest() and the listener calls attach() makes.
import { PanZoomGestureController, PzGestureEnv } from '../panzoom/panZoomGestureController';
import { PzViewport } from '../panzoom/panZoomLogic';

class FakeEl {
    constructor(readonly className: string, readonly parentElement: FakeEl | null = null) {}

    closest(selector: string): FakeEl | null {
        const wanted = selector.split(',').map((s) => s.trim().replace(/^\./, ''));
        const own = this.className.split(' ');
        if (wanted.some((c) => own.includes(c))) {
            return this;
        }
        return this.parentElement ? this.parentElement.closest(selector) : null;
    }

    addEventListener(): void {}
    removeEventListener(): void {}
    getBoundingClientRect(): { left: number; top: number } {
        return { left: 0, top: 0 };
    }
}

const env: PzGestureEnv = {
    minZoom: 0.1, maxZoom: 8, zoomStep: 1.25, wheelZoom: true, doubleClickZoom: true,
    contentW: 2000, contentH: 1200, viewportW: 800, viewportH: 600
};

function setup(): { gestures: PanZoomGestureController; applied: PzViewport[]; viewport: FakeEl } {
    const applied: PzViewport[] = [];
    const vp: PzViewport = { zoom: 1, center: { x: 1000, y: 600 } };
    const gestures = new PanZoomGestureController({
        env: () => env,
        vp: () => vp,
        motionActive: () => false,
        apply: (next) => { applied.push(next); },
        springBack: () => {},
        glide: () => {}
    });
    const viewport = new FakeEl('mustry-pz-viewport');
    gestures.attach(viewport as unknown as HTMLElement);
    return { gestures, applied, viewport };
}

function dblclick(target: FakeEl): React.MouseEvent {
    return { target, clientX: 760, clientY: 40 } as unknown as React.MouseEvent;
}

beforeAll(() => {
    (globalThis as { window?: unknown }).window = { addEventListener() {}, removeEventListener() {} };
});

afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
});

describe('PanZoomGestureController.doubleClick', () => {
    it('zooms in when the embedded content is double-clicked', () => {
        const { gestures, applied, viewport } = setup();
        const content = new FakeEl('mustry-pz-content', viewport);
        gestures.doubleClick(dblclick(new FakeEl('some-view-child', content)));
        expect(applied).toHaveLength(1);
        expect(applied[0].zoom).toBeCloseTo(1.25 * 1.25, 5);
    });

    it('zooms in when the empty viewport around the content is double-clicked', () => {
        const { gestures, applied, viewport } = setup();
        gestures.doubleClick(dblclick(viewport));
        expect(applied).toHaveLength(1);
    });

    it('ignores a double-click on the zoom out button', () => {
        const { gestures, applied, viewport } = setup();
        const controls = new FakeEl('mustry-pz-controls', viewport);
        gestures.doubleClick(dblclick(new FakeEl('', controls)));
        expect(applied).toHaveLength(0);
    });

    it('ignores a double-click on the minimap, the POI list and an edge indicator', () => {
        const { gestures, applied, viewport } = setup();
        const minimap = new FakeEl('mustry-pz-minimap', viewport);
        gestures.doubleClick(dblclick(new FakeEl('mustry-pz-mini-view', minimap)));
        gestures.doubleClick(dblclick(new FakeEl('mustry-pz-poi-select', viewport)));
        gestures.doubleClick(dblclick(new FakeEl('mustry-pz-indicator', viewport)));
        expect(applied).toHaveLength(0);
    });
});
