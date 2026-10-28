import { mapPanZoomProps } from '../panzoom/panZoomProps';
import { stubReader } from './_stubReader';

describe('mapPanZoomProps: minimap config', () => {
    it('defaults: preview on, bottom-right, 160×110', () => {
        const p = mapPanZoomProps(stubReader({}));
        expect(p.minimapPreview).toBe(true);
        expect(p.minimapPosition).toBe('bottom-right');
        expect([p.minimapWidth, p.minimapHeight]).toEqual([160, 110]);
    });
    it('reads the set values', () => {
        const p = mapPanZoomProps(stubReader({ config: {
            minimapPreview: false, minimapPosition: 'top-left', minimapWidth: 240, minimapHeight: 150
        } }));
        expect(p.minimapPreview).toBe(false);
        expect(p.minimapPosition).toBe('top-left');
        expect([p.minimapWidth, p.minimapHeight]).toEqual([240, 150]);
    });
    it('an unknown position falls back to bottom-right', () => {
        expect(mapPanZoomProps(stubReader({ config: { minimapPosition: 'middle' } })).minimapPosition)
            .toBe('bottom-right');
    });
    it('clamps the size to 60–640 × 40–480', () => {
        const small = mapPanZoomProps(stubReader({ config: { minimapWidth: 5, minimapHeight: 5 } }));
        expect([small.minimapWidth, small.minimapHeight]).toEqual([60, 40]);
        const big = mapPanZoomProps(stubReader({ config: { minimapWidth: 5000, minimapHeight: 5000 } }));
        expect([big.minimapWidth, big.minimapHeight]).toEqual([640, 480]);
    });
});
