import { alphaFromPointer, fracX, fracY, hueFromPointer, svFromPointer } from '../color/colorGeometry';

const rect = { left: 100, top: 50, width: 200, height: 100 };

describe('fracX / fracY', () => {
    it('map a point inside the rect to a 0..1 fraction', () => {
        expect(fracX(rect, 100)).toBe(0);
        expect(fracX(rect, 300)).toBe(1);
        expect(fracX(rect, 200)).toBe(0.5);
        expect(fracY(rect, 50)).toBe(0);
        expect(fracY(rect, 150)).toBe(1);
        expect(fracY(rect, 100)).toBe(0.5);
    });

    it('clamp points outside the rect', () => {
        expect(fracX(rect, 0)).toBe(0);
        expect(fracX(rect, 999)).toBe(1);
        expect(fracY(rect, -50)).toBe(0);
        expect(fracY(rect, 999)).toBe(1);
    });

    it('degenerate (zero-size) rects yield 0, never NaN', () => {
        expect(fracX({ left: 0, top: 0, width: 0, height: 0 }, 10)).toBe(0);
        expect(fracY({ left: 0, top: 0, width: 0, height: 0 }, 10)).toBe(0);
    });
});

describe('svFromPointer', () => {
    it('top-left is s=0,v=100; bottom-right is s=100,v=0', () => {
        expect(svFromPointer(rect, 100, 50)).toEqual({ s: 0, v: 100 });
        expect(svFromPointer(rect, 300, 150)).toEqual({ s: 100, v: 0 });
        expect(svFromPointer(rect, 200, 100)).toEqual({ s: 50, v: 50 });
    });
});

describe('hueFromPointer / alphaFromPointer', () => {
    it('hue spans 0..360 across the width', () => {
        expect(hueFromPointer(rect, 100)).toBe(0);
        expect(hueFromPointer(rect, 300)).toBe(360);
        expect(hueFromPointer(rect, 200)).toBe(180);
    });

    it('alpha spans 0..1 across the width', () => {
        expect(alphaFromPointer(rect, 100)).toBe(0);
        expect(alphaFromPointer(rect, 300)).toBe(1);
        expect(alphaFromPointer(rect, 250)).toBe(0.75);
    });
});
