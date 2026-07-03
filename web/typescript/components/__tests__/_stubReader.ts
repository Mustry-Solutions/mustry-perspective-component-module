// Test helper: a PropReader backed by a plain nested object, mimicking PropertyTree's
// dot-path lookups + light coercion. (Filename has no `.test.` so jest won't run it as a suite.)
import { PropReader } from '../../shared/propReader';

export function stubReader(data: any): PropReader {
    const at = (path: string): any =>
        path.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), data);
    const missing = (v: any): boolean => v === undefined || v === null;
    return {
        readString: (p, fb = '') => { const v = at(p); return missing(v) ? (fb as string) : String(v); },
        readBoolean: (p, fb = false) => { const v = at(p); return missing(v) ? (fb as boolean) : !!v; },
        readNumber: <T,>(p: string, fb: T): T => { const v = at(p); return (missing(v) ? fb : v) as T; },
        readArray: (p, fb = [] as never[]) => { const v = at(p); return (missing(v) ? fb : v) as any[]; }
    };
}
