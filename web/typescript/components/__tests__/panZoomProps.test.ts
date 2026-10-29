import { mapPanZoomProps } from '../panzoom/panZoomProps';
import { stubReader } from './_stubReader';

describe('mapPanZoomProps: config.minimap', () => {
    it('defaults: shown, preview on, bottom-right, 160×110', () => {
        expect(mapPanZoomProps(stubReader({})).minimap).toEqual({
            show: true, preview: true, position: 'bottom-right', width: 160, height: 110
        });
    });
    it('reads the set values', () => {
        const p = mapPanZoomProps(stubReader({ config: { minimap: {
            show: false, preview: false, position: 'top-left', width: 240, height: 150
        } } }));
        expect(p.minimap).toEqual({ show: false, preview: false, position: 'top-left', width: 240, height: 150 });
    });
    it('a partial object keeps the other defaults', () => {
        expect(mapPanZoomProps(stubReader({ config: { minimap: { position: 'top-right' } } })).minimap)
            .toEqual({ show: true, preview: true, position: 'top-right', width: 160, height: 110 });
    });
    it('an unknown position falls back to bottom-right', () => {
        expect(mapPanZoomProps(stubReader({ config: { minimap: { position: 'middle' } } })).minimap.position)
            .toBe('bottom-right');
    });
    it('clamps the size to 60–640 × 40–480', () => {
        const small = mapPanZoomProps(stubReader({ config: { minimap: { width: 5, height: 5 } } })).minimap;
        expect([small.width, small.height]).toEqual([60, 40]);
        const big = mapPanZoomProps(stubReader({ config: { minimap: { width: 5000, height: 5000 } } })).minimap;
        expect([big.width, big.height]).toEqual([640, 480]);
    });
});

describe('mapPanZoomProps: config.zoom', () => {
    const zoomOf = (config: Record<string, unknown>) => {
        const p = mapPanZoomProps(stubReader({ config }));
        return [p.minZoom, p.maxZoom, p.zoomStep, p.wheelZoom, p.doubleClickZoom];
    };
    it('defaults: 0.1–8, step 1.25, wheel and double-click on', () => {
        expect(zoomOf({})).toEqual([0.1, 8, 1.25, true, true]);
    });
    it('reads the set values', () => {
        expect(zoomOf({ zoom: { min: 0.5, max: 4, step: 1.5, wheel: false, doubleClick: false } }))
            .toEqual([0.5, 4, 1.5, false, false]);
    });
    it('a partial object keeps the other defaults', () => {
        expect(zoomOf({ zoom: { max: 3 } })).toEqual([0.1, 3, 1.25, true, true]);
    });
    it('clamps: min floor 0.01, max never below min, step 1.05–3', () => {
        expect(zoomOf({ zoom: { min: 0, max: 0, step: 10 } }).slice(0, 3)).toEqual([0.01, 0.01, 3]);
        expect(zoomOf({ zoom: { step: 1 } })[2]).toBe(1.05);
    });
    it('the current zoom stays state.zoom', () => {
        expect(mapPanZoomProps(stubReader({ config: { zoom: { min: 0.5 } }, state: { zoom: 2 } })).zoom).toBe(2);
    });
});
