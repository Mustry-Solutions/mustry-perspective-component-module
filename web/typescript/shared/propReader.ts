// Minimal structural view of perspective-client's PropertyTree — just the readers the
// reducers use. Keeping it perspective-client-free lets the prop mappers (and their tests)
// run under plain node jest. A real PropertyTree satisfies this interface.
// Signatures mirror perspective-client's PropertyTree so a real tree is assignable here.
export interface PropReader {
    readString(path: string, defaultValue?: string): string;
    readBoolean(path: string, defaultValue?: boolean): boolean;
    readNumber<T>(path: string, defaultValue: T): T;
    readArray(path: string, defaultValue?: never[]): any[];
}
