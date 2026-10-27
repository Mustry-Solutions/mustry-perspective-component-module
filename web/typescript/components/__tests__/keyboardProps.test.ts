import { mapKeyboardProps } from '../keyboard/keyboardProps';
import { stubReader } from './_stubReader';

describe('mapKeyboardProps: placeholder (#153)', () => {
    it('follows config.locale when unset', () => {
        expect(mapKeyboardProps(stubReader({})).labels.placeholder).toBe('Tap to enter…');
        expect(mapKeyboardProps(stubReader({ config: { locale: 'fr-BE' } })).labels.placeholder)
            .toBe('Touchez pour saisir…');
        expect(mapKeyboardProps(stubReader({ config: { locale: 'xx' } })).labels.placeholder)
            .toBe('Tap to enter…');
    });
    it('the old materialized English default does not shadow the locale pack', () => {
        const p = mapKeyboardProps(stubReader({ config: { locale: 'de', placeholder: 'Tap to enter…' } }));
        expect(p.labels.placeholder).toBe('Tippen zum Eingeben…');
    });
    it('a set config.placeholder wins', () => {
        const p = mapKeyboardProps(stubReader({ config: { locale: 'nl', placeholder: 'Naam…' } }));
        expect(p.labels.placeholder).toBe('Naam…');
    });
    it('every bundled language has its own placeholder', () => {
        const seen = ['en', 'fr', 'de', 'es', 'nl', 'it', 'pt']
            .map((locale) => mapKeyboardProps(stubReader({ config: { locale } })).labels.placeholder);
        seen.forEach((s) => expect(s).not.toBe(''));
        expect(new Set(seen).size).toBe(seen.length);
    });
    it('other labels still come from config.labels', () => {
        const p = mapKeyboardProps(stubReader({ config: { locale: 'fr', labels: { enter: 'OK' } } }));
        expect(p.labels.enter).toBe('OK');
        expect(p.labels.clear).toBe('Effacer');
    });
});
