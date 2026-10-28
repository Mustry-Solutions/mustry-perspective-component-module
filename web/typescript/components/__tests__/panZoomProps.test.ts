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
