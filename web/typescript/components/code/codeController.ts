// The CodeMirror 6 lifecycle wrapper: assembles the editor state (language,
// gutters, keymaps, lint, theme hooks) and exposes the small imperative surface
// the class component drives. DOM-facing, hence untested; anything with logic
// lives in codeLogic.ts.
import { EditorState, Compartment, Transaction } from '@codemirror/state';
import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
    placeholder as cmPlaceholder
} from '@codemirror/view';
import {
    defaultKeymap, history, historyKeymap, indentWithTab, redo, undo
} from '@codemirror/commands';
import {
    bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit,
    syntaxHighlighting, HighlightStyle
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { tags } from '@lezer/highlight';
import { CodeLanguage, validateJson } from './codeLogic';

export interface CodeControllerOpts {
    element: HTMLElement;
    code: string;
    editable: boolean;
    language: CodeLanguage;
    lineNumbers: boolean;
    lineWrapping: boolean;
    tabSize: number;
    placeholder: string;
    /** Document changed by user input. */
    onUpdate: () => void;
    /** Anything that might change toolbar state (undo/redo depth, selection). */
    onStateChange: () => void;
}

/** Syntax palette driven by the --code-* CSS variables so Perspective themes
 *  (light/dark ± warm/cool) restyle the highlighting without a rebuild. */
const themeHighlight = HighlightStyle.define([
    { tag: [tags.propertyName, tags.attributeName], color: 'var(--code-property, #0550ae)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string, #0a3069)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number, #953800)' },
    { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--code-keyword, #cf222e)' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment, #6e7781)', fontStyle: 'italic' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function, #8250df)' },
    { tag: [tags.typeName, tags.className, tags.tagName], color: 'var(--code-type, #116329)' },
    { tag: [tags.operator, tags.punctuation], color: 'var(--code-text, inherit)' }
]);

function languageExtensions(lang: CodeLanguage) {
    switch (lang) {
        case 'json': return [json(), linter((view) => {
            const v = validateJson(view.state.doc.toString());
            if (v.valid) {
                return [] as Diagnostic[];
            }
            const at = v.pos >= 0 ? v.pos : 0;
            return [{ from: at, to: Math.min(at + 1, view.state.doc.length), severity: 'error' as const, message: v.message }];
        }), lintGutter()];
        case 'python': return [python()];
        case 'sql': return [sql()];
        case 'xml': return [xml()];
        default: return [];
    }
}

export class CodeController {
    private view: EditorView;
    private editableComp = new Compartment();

    constructor(opts: CodeControllerOpts) {
        this.view = new EditorView({
            parent: opts.element,
            state: EditorState.create({
                doc: opts.code,
                extensions: [
                    ...(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
                    ...(opts.lineWrapping ? [EditorView.lineWrapping] : []),
                    history(),
                    bracketMatching(),
                    indentOnInput(),
                    highlightActiveLine(),
                    highlightSelectionMatches(),
                    indentUnit.of(' '.repeat(opts.tabSize)),
                    EditorState.tabSize.of(opts.tabSize),
                    ...(opts.placeholder && opts.editable ? [cmPlaceholder(opts.placeholder)] : []),
                    syntaxHighlighting(themeHighlight),
                    ...languageExtensions(opts.language),
                    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
                    this.editableComp.of([
                        EditorView.editable.of(opts.editable),
                        EditorState.readOnly.of(!opts.editable)
                    ]),
                    EditorView.updateListener.of((u) => {
                        if (u.docChanged && u.transactions.some((tr) => tr.annotation(Transaction.addToHistory) !== false)) {
                            opts.onUpdate();
                        }
                        if (u.docChanged || u.selectionSet) {
                            opts.onStateChange();
                        }
                    })
                ]
            })
        });
    }

    dispose(): void {
        this.view.destroy();
    }

    getCode(): string {
        return this.view.state.doc.toString();
    }

    /** Replace the document (external/bound content — NOT undoable: without the
     *  history opt-out, the binding's arrival becomes an undo step and Ctrl-Z
     *  could blank the document). */
    setCode(code: string): void {
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: code },
            annotations: Transaction.addToHistory.of(false)
        });
    }

    /** Replace the document as a USER edit (undoable; fires onUpdate) — e.g. Format. */
    applyUserEdit(code: string): void {
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: code }
        });
    }

    setEditable(editable: boolean): void {
        this.view.dispatch({
            effects: this.editableComp.reconfigure([
                EditorView.editable.of(editable),
                EditorState.readOnly.of(!editable)
            ])
        });
    }

    undo(): void {
        undo(this.view);
        this.view.focus();
    }

    redo(): void {
        redo(this.view);
        this.view.focus();
    }

    focus(): void {
        this.view.focus();
    }
}
